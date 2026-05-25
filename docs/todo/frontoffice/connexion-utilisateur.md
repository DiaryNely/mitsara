# Front-office — Connexion utilisateur

## Rôle

Authentifie un client de la boutique pour lui permettre d'accéder aux pages protégées (checkout, commandes). Deux modes d'accès coexistent : connexion par **email seul** depuis la page de login dédiée, et connexion directe **"se connecter en tant que"** depuis la page d'accueil (à usage développement/test). Le système distingue les vrais clients des comptes anonymes (GDPR guest).

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/front/FrontLoginView.vue` | Page de connexion — formulaire email |
| `src/views/front/FrontHomeView.vue` | Page d'accueil — sélecteur client + connexion directe |
| `src/components/front/FrontHeader.vue` | Navigation — affiche nom client + lien logout si connecté |
| `src/stores/auth/customerAuth.js` | Store Pinia — état de session client |
| `src/composables/auth/useCustomerAuth.js` | Composable — interface publique du store |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `loginCustomer({ email })` | `src/services/frontoffice/customerAuthService.js` | Requête PS par email, vérifie bcrypt, crée session |
| `createCustomerSession(customer)` | `src/services/frontoffice/customerAuthService.js` | Construit l'objet session à persister |
| `getStoredCustomerSession()` | `src/services/frontoffice/customerAuthService.js` | Lecture session depuis localStorage (TTL 6h) |
| `clearCustomerSession()` | `src/services/frontoffice/customerAuthService.js` | Suppression session localStorage |

---

## Routes

| Path | Name | Meta | Comportement |
|---|---|---|---|
| `/front/login` | `front-login` | `layout: 'front'` | Accessible à tous |
| `/front` | `front-home` | `layout: 'front'` | Si `isRealCustomer` → redirect `/front/products` |
| `/front/checkout` | `front-checkout` | `frontAuth: true` | Requiert client non-guest |
| `/front/orders` | `front-orders` | `frontAuth: true` | Requiert client non-guest |
| `/front/orders/:id` | `front-order-detail` | `frontAuth: true` | Requiert client non-guest |

---

## Appels API

### Connexion par email (FrontLoginView)

```
handleSubmit()
  └── useCustomerAuth().loginByEmail({ email })
        └── customerAuthStore.login({ email })
              └── customerAuthService.loginCustomer({ email })
                    ├── GET /api/customers?filter[email]={email}&display=full
                    │     → Retourne le(s) client(s) correspondant
                    ├── Vérifie : customer.active === true
                    ├── Vérifie : email !== GDPR_ANONYMOUS_EMAIL
                    └── createCustomerSession(customer)
                          → { customer, expiresAt: Date.now() + 6h }
                          → Stocke en localStorage

  Post-login :
    ├── cartStore.initialize({ customerId })
    │     → Vérifie cartId existant ou crée nouveau
    └── cartStore.claimForCustomer(customerId)
          → Associe le panier anonyme au client
```

### Connexion directe (FrontHomeView)

```
handleConfirm()   // après sélection dans la liste + modal de confirmation
  └── loginAsCustomer(customer)
        └── customerAuthStore.loginAsCustomer(customer)
              ├── createCustomerSession(customer)
              └── cartStore.switchCustomer(customerId)
```

### Restauration de session (guard)

```
frontAuthGuard → customerStore.restoreSession()
  └── customerAuthService.getStoredCustomerSession()
        → Lit localStorage
        → Vérifie TTL (6 heures)
        → Si valide : restaure customer + session
        → Si expiré : clearCustomerSession() → état vide
```

### Déconnexion

```
handleLogout()   // FrontHeader
  └── logout()
        └── customerAuthStore.logout()
              ├── clearCustomerSession()
              ├── cartStore.$patch({ items: [], cartId: '', ownerId: '' })
              └── router.push('/front')
```

---

## Logique métier

### État du store `customerAuth.js`

```js
state = {
  session:      null,    // { customer, expiresAt }
  customer:     null,    // { id, email, firstname, lastname, secureKey, active, isGuest }
  hasRestored:  false    // flag pour éviter double-restore
}
```

### Getters

```js
isAuthenticated   // customer !== null
isGuest           // customer.email === GDPR_ANONYMOUS_EMAIL
isRealCustomer    // isAuthenticated && !isGuest
customerName      // `${firstname} ${lastname}`.trim()
customerId        // customer.id
customerSecureKey // customer.secureKey (utilisé pour placeOrder)
```

### Composable `useCustomerAuth()`

Expose :
```js
{ customer, session, isAuthenticated, isGuest, isRealCustomer,
  customerName, customerId, customerSecureKey,
  login, loginByEmail, loginAsCustomer, logout, restoreSession }
```

`loginByEmail` est un alias de `login` exposé nommément pour la clarté des usages.

### Codes d'erreur gérés (FrontLoginView)

| Code | Message affiché |
|---|---|
| `CUSTOMER_NOT_FOUND` | "Client introuvable." |
| `CUSTOMER_INACTIVE` | "Compte client inactif." |
| `GUEST_NOT_ALLOWED` | "Compte anonyme non autorisé pour la validation." |
| `MISSING_API_KEY` | "Clé API manquante dans .env.local." |
| `MISSING_ENV` | "Configuration manquante dans .env.local." |
| `NETWORK_ERROR` | "Connexion impossible à l'API." |
| `MISSING_FIELDS` | "Email requis." |

### Guard `frontAuthGuard`

```
Pour chaque navigation :
  1. Si !customerStore.hasRestored → restoreSession()
  2. Si route.meta.frontAuth :
       - Si !isAuthenticated || isGuest → redirect /front/login?redirect=...
  3. Si route.name === 'front-home' :
       - Si isRealCustomer → redirect /front/products
  4. Si !cartStore.initialized :
       - cartStore.initialize({ customerId: customer?.id || '' })
```

### Page d'accueil (FrontHomeView) — sélection client

```js
// Refs
const customers     = ref([])     // liste chargée depuis PS
const searchTerm    = ref('')
const confirmOpen   = ref(false)
const pendingClient = ref(null)
const confirmLoading = ref(false)

// Flux
handleSelect(customer) → pendingClient = customer, confirmOpen = true
handleConfirm()        → loginAsCustomer(pendingClient) → redirect /front/products
closeConfirm()         → confirmOpen = false
```

---

## Dépendances importantes

- **`GDPR_ANONYMOUS_EMAIL`** (`src/config/guestUser.js`) : email du compte anonyme (ID=35). Ce client ne peut jamais se connecter via la page login (code `GUEST_NOT_ALLOWED`).
- **Bcrypt** : la vérification du mot de passe est faite côté client via bcrypt sur le hash stocké dans `customer.passwd`. Pas de route d'authentification serveur dédiée.
- **TTL 6h en localStorage** : la session persiste entre les rafraîchissements de page mais expire après 6 heures.
- **`secureKey`** : champ PS utilisé lors du `placeOrder` pour l'authentification de la commande.

---

## Points critiques

1. **Vérification bcrypt côté client** : le hash de mot de passe (`passwd`) est transmis dans la réponse WebService — risque de sécurité si la clé API est compromise. Cette conception suppose que le front-office n'est pas exposé publiquement.
2. **Pas de mot de passe** : `FrontLoginView` n'utilise que l'email. La vérification réelle est dans `FrontHomeView` (bcrypt). Ce n'est pas un vrai système d'authentification — il est conçu pour un contexte de démo/test.
3. **`isGuest` bloque le checkout** : le compte anonyme (ID=35) peut naviguer et ajouter au panier, mais ne peut pas valider une commande.
4. **Redirect après login** : le paramètre `?redirect=/target` est lu et utilisé après connexion depuis `FrontLoginView`, mais pas depuis `FrontHomeView`.
5. **Double initialisation possible** : si `initialize()` et `claimForCustomer()` sont appelés dans le mauvais ordre, le panier anonyme peut ne pas être transféré correctement.

---

## Améliorations possibles

- Déplacer la vérification du mot de passe côté serveur (endpoint dédié sur PS ou un proxy Node.js).
- Ajouter un champ mot de passe sur `FrontLoginView` pour une authentification réelle.
- Implémenter un refresh token pour prolonger la session sans re-login.
- Afficher un indicateur visuel de session expirée au lieu d'une redirection silencieuse.
- Séparer clairement les deux modes de connexion (dev vs prod) avec un flag d'environnement.
