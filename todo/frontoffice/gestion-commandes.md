# Front-office — Gestion des commandes

## Rôle

Couvre le cycle complet d'une commande côté client : **validation du panier et passage de commande** (checkout), **consultation de l'historique des commandes**, et **visualisation du détail d'une commande** avec timeline des états. Ces trois fonctionnalités sont accessibles uniquement aux clients authentifiés (non anonymes).

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/front/FrontCheckoutView.vue` | Tunnel d'achat — adresse + paiement + confirmation |
| `src/views/front/FrontOrdersView.vue` | Liste des commandes du client |
| `src/views/front/FrontOrderDetailView.vue` | Détail d'une commande + timeline des états |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `getCustomerAddresses(customerId)` | `src/services/frontoffice/addressService.js` | Adresses de livraison du client |
| `createAddress(params)` | `src/services/frontoffice/addressService.js` | Création d'une nouvelle adresse |
| `syncCart({ customer, addressId })` | `src/stores/front/cart.js` | Sync finale du panier avant commande |
| `placeOrder({ cartId, customer, addressId, items })` | `src/services/frontoffice/orderService.js` | Création de la commande dans PS |
| `cartStore.onOrderPlaced()` | `src/stores/front/cart.js` | Nettoyage post-commande |
| `getCustomerOrders(customerId, { page, pageSize })` | `src/services/frontoffice/orderService.js` | Liste paginée des commandes |
| `getOrderById(orderId)` | `src/services/frontoffice/orderService.js` | Données d'une commande |
| `getOrderDetails(orderId)` | `src/services/frontoffice/orderService.js` | Lignes de commande (produits) |
| `getOrderHistories(orderId)` | `src/services/frontoffice/orderService.js` | Historique des changements d'état |
| `getOrderStateMap()` | `src/services/frontoffice/orderService.js` | Map `{ [stateId]: label }` |

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/front/checkout` | `front-checkout` | `layout: 'front'`, `frontAuth: true` |
| `/front/orders` | `front-orders` | `layout: 'front'`, `frontAuth: true` |
| `/front/orders/:id` | `front-order-detail` | `layout: 'front'`, `frontAuth: true` |

Les trois routes requièrent `frontAuth: true` → un client anonyme (guest) est redirigé vers `/front/login`.

---

## Appels API

### Checkout — FrontCheckoutView

#### Chargement des adresses

```
onMounted()
  ├── useCart().hydrate()             → Charge le panier depuis localStorage
  └── loadAddresses()
        └── getCustomerAddresses(customerId)
              → GET /api/addresses?filter[id_customer]={id}&display=full
              → [{ id, alias, firstname, lastname, address1, postcode, city, phone }]
```

#### Création d'adresse

```
handleCreateAddress()
  ├── validateAddressForm()     → Vérifie champs requis (non vides)
  └── createAddress({
          customerId,
          alias, firstname, lastname,
          address1, postcode, city, phone
        })
        → POST /api/addresses
        → Retourne la nouvelle adresse avec son ID
  → selectedAddressId = newAddress.id
  → addresses.push(newAddress)
```

#### Passage de commande

```
requestConfirm()
  ├── Guard : isEmpty → erreur "Panier vide"
  ├── Guard : !selectedAddressId → erreur "Choisir une adresse"
  └── showConfirm = true  [ouvre la modale]

handlePlaceOrder()
  ├── loading = true
  ├── syncCart({ customer, addressId: selectedAddressId })
  │     → Sync PUT /api/carts/{cartId} avec adresse + lignes
  │     → Retourne cartId confirmé
  ├── placeOrder({
  │       cartId,
  │       customer: { id, secureKey, email },
  │       addressId: selectedAddressId,
  │       items
  │     })
  │     → POST /api/orders
  │     → PS crée la commande + lignes + associe le panier
  │     → Retourne { orderId }
  ├── cartStore.onOrderPlaced()
  │     → Vide items, cartId, addressId
  │     → Efface localStorage
  └── router.replace(`/front/orders/${orderId}`)
```

### Liste des commandes — FrontOrdersView

```
loadOrders(page)
  └── Promise.all([
        getCustomerOrders(customerId, { page, pageSize: 20 }),
        getOrderStateMap()
      ])
  → orders[] = list
  → stateMap = { [id]: label }
  → hasMore = list.length === PAGE_SIZE
```

### Détail d'une commande — FrontOrderDetailView

```
loadOrder()
  └── Promise.all([
        getOrderById(orderId),
        getOrderDetails(orderId),
        getOrderHistories(orderId),
        getOrderStateMap()
      ])
  → order    = { reference, currentState, totalPaid, ... }
  → details  = [{ id, name, quantity, total }]
  → histories = [{ id, stateId, dateAdd }]
  → stateMap  = { [id]: label }
```

---

## Logique métier

### FrontCheckoutView — Refs et computed

```js
// Composables
const { customerId, customerName, customerSecureKey } = useCustomerAuth()
const { items, subtotal, cartId, hydrate, syncCart, setAddressId } = useCart()

// Refs
const addresses          = ref([])
const selectedAddressId  = ref('')
const loading            = ref(false)
const addressError       = ref('')
const orderError         = ref('')
const showConfirm        = ref(false)     // modale de confirmation

const addressForm = ref({
  alias:     '',
  firstname: '',
  lastname:  '',
  address1:  '',
  postcode:  '',
  city:      '',
  phone:     ''
})
const formErrors = ref({})

// Computed
const total = computed(() => subtotal.value)
```

### `validateAddressForm()`

```js
const required = ['alias', 'firstname', 'lastname', 'address1', 'postcode', 'city']
// Pour chaque champ requis : formErrors[field] = 'Champ requis' si vide
// Retourne true si aucune erreur
```

### Stepper visuel (3 étapes)

| Étape | Label | État |
|---|---|---|
| 1 | Panier | Toujours "done" sur cette page |
| 2 | Livraison | Actif (sélection adresse) |
| 3 | Confirmation | En attente (modal) |

### Modale de confirmation

```js
showConfirm = true   // affichée via <Teleport to="body">
// backdrop-blur, boutons : "Confirmer" → handlePlaceOrder() | "Annuler" → cancelConfirm()
// loading = true pendant l'appel → désactive les deux boutons
```

### `setAddressId(id)`

```js
selectedAddressId.value = id
cartStore.setAddressId(id)   // met à jour le store (utilisé lors du syncCart)
```

---

### FrontOrdersView — Refs et computed

```js
const orders       = ref([])
const stateMap     = ref({})
const loading      = ref(false)
const error        = ref('')
const PAGE_SIZE    = 20
const currentPage  = ref(1)
const hasMore      = ref(false)
```

### Pagination

```js
// Bouton "Précédent" : loadOrders(currentPage - 1)
// Bouton "Suivant"   : loadOrders(currentPage + 1)
// Désactivés si currentPage <= 1 ou !hasMore
// hasMore = orders.length === PAGE_SIZE
```

### `formatDate(dateStr)`

```js
new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dateStr))
```

### `formatPrice(value)`

```js
new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(value || 0))
```

### Carte commande (article de liste)

Colonnes : **Référence** (monospace) · **Date** · **Statut** (badge indigo) · **Total payé** · **Bouton "Détails"**

Click sur la carte ou le bouton → `router.push('/front/orders/${order.id}')`.

---

### FrontOrderDetailView — Refs et computed

```js
const order     = ref(null)     // { reference, currentState, ... }
const details   = ref([])       // lignes produits
const histories = ref([])       // historique états
const stateMap  = ref({})
const loading   = ref(false)
const error     = ref('')

// Computed
const total = computed(() =>
  details.value.reduce((sum, item) => sum + Number(item.total || 0), 0)
)
```

### Breadcrumb

```
← Mes commandes  /  #REF-COMMANDE
```

Click "Mes commandes" → `router.push('/front/orders')`.

### Hero commande

- Référence (monospace) + badge ID
- Statut avec **dot pulsant** indigo
- Total payé (grand, indigo)

### Corps en 2 colonnes

**Colonne gauche — Produits** :
```
Pour chaque item :
  - Nom produit
  - Badge quantité (pill indigo) : "× N"
  - Prix total de la ligne
Total général en bas de section
```

**Colonne droite — Timeline des états** :
```
Pour chaque history (ordre chronologique) :
  timeline-marker :
    - idx === 0 : cercle indigo plein avec ✓ (état le plus récent)
    - idx > 0   : petit dot gris
  timeline-connector : ligne verticale entre items
  timeline-content   : label état + date
```

### `formatPrice(price)`

Identique à `FrontOrdersView`.

---

## Dépendances importantes

- **`frontAuth: true`** sur les 3 routes — obligatoire, géré par `frontAuthGuard`
- **`customerSecureKey`** : transmis dans `placeOrder` pour l'association sécurisée côté PS
- **`getOrderStateMap()`** : appelé à chaque chargement — pas de cache global. Si PS a beaucoup d'états, cela génère autant de requêtes
- **`cartStore.onOrderPlaced()`** : critique — sans cet appel, l'ancien panier serait rechargé à la prochaine visite

---

## Points critiques

1. **Pas de gestion du paiement réel** : `placeOrder` crée la commande directement sans passerelle de paiement. Le statut initial est défini par la configuration PS (généralement "En attente de paiement").
2. **Panier non validé côté serveur avant commande** : `syncCart` met à jour le panier, puis `placeOrder` crée la commande. Si le stock a changé entre les deux, la commande peut être créée avec des articles en rupture.
3. **Double-clic protégé** : le flag `loading` désactive la modale pendant l'appel API, mais pas de token d'idempotence côté PS — un appel en double peut créer deux commandes.
4. **Adresse obligatoire** : si le client n'a aucune adresse et ne veut pas en créer une via le formulaire intégré, il est bloqué.
5. **`getOrderStateMap()` non mis en cache** : appelé dans `FrontOrdersView` ET `FrontOrderDetailView` séparément, sans partage d'état — double requête si on navigue entre les deux pages rapidement.

---

## Améliorations possibles

- Intégrer une passerelle de paiement (Stripe, PayPal) entre `syncCart` et `placeOrder`.
- Ajouter un token d'idempotence sur `placeOrder` pour éviter les doublons en cas de double-envoi.
- Mettre `getOrderStateMap()` en cache dans un store ou un composable partagé.
- Permettre la modification de la quantité depuis le checkout (actuellement lecture seule).
- Envoyer un email de confirmation post-commande (hook PS ou appel direct).
- Ajouter un filtre par statut ou par date sur `FrontOrdersView`.
- Afficher le numéro de suivi de colis sur `FrontOrderDetailView` si disponible dans les métadonnées de l'état.
