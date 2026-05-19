# Backoffice — Authentification administrateur

## Rôle

Permet à un administrateur de se connecter au back-office via un formulaire email + mot de passe. La session est doublement validée : d'abord auprès du serveur PrestaShop (BO admin), puis via la clé WebService. Sans authentification valide, aucune route protégée n'est accessible.

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/auth/LoginView.vue` | Page de connexion (template + logique) |
| `src/components/layout/AdminSidebar.vue` | Non visible sur cette page (layout `auth` = sans sidebar) |
| `src/App.vue` | Sélectionne le layout `auth` (RouterView seul, sans sidebar ni header) |

---

## Services utilisés

| Service | Fichier | Rôle |
|---|---|---|
| `adminAuthService` | `src/services/auth/adminAuthService.js` | Login/logout BO, gestion token admin |
| `authService` | `src/services/auth/authService.js` | Validation clé WebService, persistence session |
| `xmlClient` | `src/api/xmlClient.js` | Initialisation client XML global (après login) |

---

## Routes

| Path | Name | Meta | Comportement |
|---|---|---|---|
| `/login` | `login` | `requiresAuth: false` | Accessible sans session |
| (redirect) | — | — | Si déjà authentifié, redirige vers `/dashboard` |

La redirection est gérée dans `src/router/guards.js` (`authGuard`) : si `isAuthenticated` et tentative d'accès à `/login` → `router.replace('/dashboard')`.

---

## Appels API

### Flux complet du login

```
handleSubmit()
  └── useAuth().login({ email, password })
        └── authStore.login({ email, password })
              ├── 1. adminAuthService.loginAdmin({ email, password })
              │     → POST /index.php?controller=AdminLogin&...
              │     → Retourne { adminToken, adminSession }
              │
              ├── 2. authService.validateApiKey({ apiUrl, apiKey })
              │     → GET /api/ (WebService, Basic Auth)
              │     → Retourne { employee, permissions[] }
              │
              ├── 3. authService.saveSession({ apiUrl, apiKey, employee, permissions })
              │     → Encode en base64 JSON, stocke en sessionStorage
              │     → TTL : 8 heures
              │
              └── 4. initXmlClient({ apiUrl, apiKey, onAuthError })
                    → Initialise le client XML global
                    → onAuthError : si 401 → clearAuthState() + redirect /login
```

---

## Logique métier

### Refs déclarées dans `<script setup>`

```js
const email        = ref('hasiniaina.nely@gmail.com') // pré-rempli pour dev
const password     = ref('')
const loading      = ref(false)
const errorMessage = ref('')
```

### `formatError(error)`

Mappe les codes d'erreur métier vers des messages français :

| Code | Message affiché |
|---|---|
| `INVALID_CREDENTIALS` | "Email ou mot de passe incorrect." |
| `MISSING_API_KEY` | "Clé API manquante dans .env.local." |
| `MISSING_ENV` | "Configuration manquante dans .env.local." |
| `MISSING_ADMIN_ENV` | "Répertoire admin non configuré." |
| `TOKEN_MISSING` | "Réponse inattendue du serveur." |
| `NETWORK_ERROR` | "Connexion impossible à l'API." |
| (fallback) | `error.message` ou "Erreur inconnue." |

### `handleSubmit()`

```
1. Vide errorMessage, active loading
2. Appelle login({ email, password })
3. En cas de succès :
   - Lit route.query.redirect (string strictement typé)
   - router.replace(redirectTarget || '/dashboard')
4. En cas d'erreur : formatError → errorMessage
5. finally : loading = false
```

### Restauration de session (guard)

Avant toute navigation, `authGuard` appelle `authStore.restoreSession()` (une seule fois via `hasRestored`) :
- Récupère la session depuis `sessionStorage`
- Valide le TTL (8h)
- Ré-initialise le client XML
- Si invalide → redirige vers `/login`

---

## Dépendances importantes

- `useAuth()` composable (`src/composables/auth/useAuth.js`) — wrappeur du store
- `useAuthStore()` (Pinia) — state : `session`, `employee`, `permissions`, `adminSession`, `hasRestored`
- Variables d'environnement **obligatoires** dans `.env.local` :
  - `VITE_PRESTASHOP_API_BASE_URL`
  - `VITE_PRESTASHOP_API_KEY`
  - `VITE_PRESTASHOP_ADMIN_DIR`

---

## Points critiques

1. **Double authentification** : le token BO et la clé WebService sont tous deux requis. L'échec de l'un ou l'autre bloque complètement l'accès.
2. **TTL 8h en sessionStorage** : la session expire à la fermeture de l'onglet OU après 8h. Un rafraîchissement de page relit la session sans re-login si dans la fenêtre.
3. **Email pré-rempli** : `email.value` est initialisé avec l'email du développeur — à supprimer en production.
4. **onAuthError** : toute réponse 401 du client XML déclenche un logout silencieux + redirect `/login` (protège contre les sessions expirées en cours d'usage).
5. **Redirect après login** : le paramètre `?redirect=/target` est préservé et utilisé après connexion réussie.

---

## Améliorations possibles

- Supprimer la valeur par défaut de `email` avant mise en production.
- Ajouter un mécanisme de "remember me" (TTL plus long en localStorage vs sessionStorage).
- Afficher un indicateur de verrouillage après N tentatives échouées.
- Implémenter un refresh token pour éviter la déconnexion après 8h d'activité.
