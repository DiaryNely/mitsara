# Résumé du projet — Eval-v1-05-2026

_Dernière mise à jour: 2026-05-12_

---

## Vue d'ensemble

Application d'administration **PrestaShop moderne** réalisée en **Vue 3 + Vite**, sans backend propre. Elle se connecte directement au WebService XML de PrestaShop via un proxy Vite (évite les problèmes CORS).

**Cas d'usage principal**: importer un catalogue complet (produits, déclinaisons, commandes clients + images) dans une instance PrestaShop locale, et pouvoir réinitialiser les données.

---

## Stack technologique

| Catégorie | Technologie | Version |
|-----------|-------------|---------|
| Framework | Vue 3 | 3.5.32 |
| Build tool | Vite | 8.0.10 |
| Routeur | Vue Router | 5.0.6 |
| State | Pinia | 3.0.3 |
| HTTP | Axios | 1.16.0 |
| CSV | PapaParse | 5.4.1 |
| ZIP | JSZip | 3.10.1 |
| Crypto | Web SubtleCrypto | natif |

---

## Structure du projet

```
d:\Eval-v1-05-2026/
├── newApp/                          ← Application Vue 3 + Vite
│   ├── src/
│   │   ├── api/                     ← Clients API PrestaShop (XML)
│   │   │   ├── xmlClient.js         ← Client Axios singleton + intercepteurs
│   │   │   ├── xmlParser.js         ← Parse XML → JSON
│   │   │   ├── products.js          ← CRUD produits WebService
│   │   │   ├── categories.js        ← Catégories
│   │   │   ├── combinations.js      ← Déclinaisons/variantes
│   │   │   ├── customers.js         ← Clients
│   │   │   ├── orders.js            ← Commandes
│   │   │   ├── addresses.js         ← Adresses
│   │   │   ├── attributes.js        ← Attributs produits
│   │   │   └── import.js            ← API import générique
│   │   ├── components/
│   │   │   ├── layout/              ← AdminSidebar, AdminHeader, AdminFooter
│   │   │   ├── import/              ← Wizard: FileUploader, DataPreview, ImportProgress, ImportLog, ImportWizard
│   │   │   └── products/            ← ProductList, FilterComponent
│   │   ├── composables/
│   │   │   └── auth/useAuth.js      ← Façade auth (wraps store)
│   │   ├── config/
│   │   │   └── runtimeEnv.js        ← Lecture variables Vite
│   │   ├── router/
│   │   │   └── routes.js            ← Définition routes + guard auth
│   │   ├── services/
│   │   │   ├── auth/                ← authService.js (WebService) + adminAuthService.js (BO)
│   │   │   ├── import/              ← csvParser, csvImportService, imageUploader, passwordHasher, zipExtractor, mapper, taxMapper
│   │   │   └── reset/               ← resourceDiscovery, dependencyResolver, batchProcessor, resetOrchestrator, apiClient, retry
│   │   ├── stores/
│   │   │   ├── auth/auth.js         ← Store Pinia auth global
│   │   │   └── import.js            ← Store Pinia import (fichiers, progress, logs, résultats)
│   │   ├── utils/
│   │   │   └── xml.js               ← Utilitaires XML → JSON
│   │   └── views/
│   │       ├── auth/LoginView.vue   ← Page login
│   │       ├── products/ProductsView.vue ← Gestion catalogue
│   │       ├── import/ImportView.vue     ← Wizard import
│   │       ├── reset/ResetView.vue       ← Réinitialisation
│   │       └── DashboardView.vue         ← Tableau de bord
│   ├── .env.local                   ← Config PrestaShop (URL, clé API, admin dir)
│   ├── vite.config.js               ← Proxy vers PrestaShop
│   └── package.json
│
├── api-prestashop/                  ← Doc endpoints PrestaShop (api.xml)
├── csv/                             ← Données import (3 fichiers CSV + images ZIP)
│   ├── import-data-mai-26 - fichier1.csv   ← Produits
│   ├── import-data-mai-26 - fichier2.csv   ← Déclinaisons
│   └── import-data-mai-26 - fichier3.csv   ← Commandes clients
├── img/                             ← Images produits (T_01.png, P_01.png, C_03.png, M_02.jpeg + images.zip)
└── docs/                            ← Documentation (summary.md, reset-feature.md)
```

---

## Routage

| Route | Vue | Auth | Description |
|-------|-----|------|-------------|
| `/login` | LoginView | Non | Authentification admin |
| `/` | — | — | Redirect → `/dashboard` |
| `/dashboard` | DashboardView | Oui | Stats produits |
| `/products` | ProductsView | Oui | Catalogue produits |
| `/reset` | ResetView | Oui | Réinitialisation données |
| `/import-csv` | CsvImportView | Oui | Import CSV générique |
| `/import` | ImportView | Oui | Wizard import complet |

Guard: toutes les routes ont `requiresAuth: true` par défaut → redirect `/login` si non authentifié.

---

## Authentification (double)

### 1. Back Office (adminAuthService.js)
- **Endpoint**: `POST /ps/{ADMIN_DIR}/index.php?controller=AdminLogin&ajax=1&action=login`
- **Payload**: FormData (email, passwd, submitLogin=1, stay_logged_in=1)
- **Réponse**: redirect contenant `token=...` (CSRF)
- **Stockage**: `localStorage` → `ps-admin-session` (email + adminToken)
- **Logout**: `GET /ps/{ADMIN_DIR}/index.php?controller=AdminLogin&logout=1&token=...`

### 2. WebService API (authService.js)
- **Endpoint**: `GET /ps/api/` avec Basic Auth (`base64("API_KEY:")`)
- **Permissions**: parse enfants XML du nœud `/prestashop/api`
- **Employé**: `GET /ps/api/employees?display=full&limit=1`
- **Stockage**: `sessionStorage` → `ps-session` (base64, TTL 8h)
- **Intercepteur Axios**: 401/403/503 → `clearAuthState()` + redirect `/login`

### 3. Flux complet login
1. `loginAdmin()` → obtient token BO
2. `validateApiKey()` → valide clé WebService + récupère employé + permissions
3. `initXmlClient()` → initialise client Axios singleton
4. Store Pinia auth mis à jour → `isAuthenticated = true`

---

## Fonctionnalités

### Gestion des produits
- Listing avec filtres (nom, référence, catégorie, actif, visibilité, prix min/max)
- Pagination (offset/limit, hasMore)
- Tri (field, direction ASC/DESC)
- Stats calculées (total, actifs, prix moyen)
- Rafraîchissement et affichage XML brut

**API produits** (src/api/products.js):
```
getProducts({ filters, page, pageSize, sort }) → { items[], rawXml, page, hasMore }
createProduct(productData)
createProductWithTax(productData)      ← calcul HT depuis TTC + taxe
updateProductStock(productId, quantity)
```

### Import multifiles (Wizard)

**3 fichiers CSV source + 1 ZIP d'images:**

| Fichier | Contenu | Colonnes clés |
|---------|---------|---------------|
| Fichier 1 | Produits de base | nom, reference, prix_ttc, taxe, categorie, prix_achat |
| Fichier 2 | Déclinaisons | reference, specificite, karazany, stock_initial, prix_vente_ttc |
| Fichier 3 | Commandes clients | nom, email, pwd(sha256), adresse, achat[], etat |
| images.zip | Images produits | T_01.png, P_01.png, C_03.png, M_02.jpeg |

**Données de test:**
```
Produits: T_01 (Tshirt 12.50€), P_01 (Pantalon 18.99€), C_03 (Casquette 5€), M_02 (Montre 56€)
Déclinaisons: T_01 en tailles (ngoza/kely), P_01 en couleurs (mainty/fotsy)
Clients: Rakoto, Rajao, Rakoto (doublon) — commandes en attente/acceptées/erreur
```

**Format spécial champ achat** (Fichier 3):
```
[("T_01";3;"ngoza"),("C_03";1;"")]
```

**Étapes du Wizard:**
1. Upload des 4 fichiers (FileUploader.vue)
2. Aperçu des données (DataPreview.vue)
3. Import en cours (ImportProgress.vue + ImportLog.vue)
4. Résultat avec statistiques

**Services d'import** (src/services/import/):
- `csvParser.js` → parseurs propriétaires (gestion guillemets, décimales virgule)
- `csvImportService.js` → import générique via PapaParse + mapping + schema blank
- `imageUploader.js` → upload images en FormData `POST /api/images/products/{id}`
- `passwordHasher.js` → SHA256 via `crypto.subtle.digest`
- `zipExtractor.js` → extraction ZIP avec pattern `[A-Z]_\d{2}` pour références
- `mapper.js` / `taxMapper.js` → normalisation et mapping des données

### Réinitialisation (Reset)

Suppression intelligente par dépendances avec dry-run préalable.

**Ressources ciblées** (16 entités):
`categories, products, images, combinations, stock_availables, product_options, product_option_values, tax_rule_groups, customers, addresses, carts, orders, order_details, order_histories, ...`

**Services** (src/services/reset/):
- `resourceDiscovery.js` → découvre ressources via `/api` et schémas
- `dependencyResolver.js` → analyse dépendances (associations)
- `batchProcessor.js` → suppression par batch avec retries et concurrence
- `resetOrchestrator.js` → orchestration (plan → dry run → execution)
- `retry.js` → retry exponentiel

**Workflow:**
1. Dry run → calcule plan, détecte risques, estime temps
2. Execution → suppression batch avec logs temps réel
3. Pause/reprise disponible

---

## Configuration

### .env.local (à créer à partir de cet exemple)
```env
VITE_PRESTASHOP_API_BASE_URL=/ps/api
VITE_API_URL=http://localhost/ps/api
VITE_PRESTASHOP_API_KEY=<votre_clé_webservice>
VITE_PRESTASHOP_PROXY_TARGET=https://localhost/ps
VITE_PRESTASHOP_ADMIN_DIR=<dossier_admin_aléatoire>
VITE_PRESTASHOP_ADMIN_BASE_PATH=/ps/<dossier_admin_aléatoire>
```

### vite.config.js — Proxy
```
/ps/api         → PROXY_TARGET (WebService XML)
/ps/{ADMIN_DIR} → PROXY_TARGET (Back Office, avec cookieDomainRewrite: 'localhost')
```

**Note**: Si `PROXY_TARGET` contient déjà `/ps`, le rewrite enlève `/ps` du chemin pour éviter la duplication.

---

## Sidebar — Navigation

| Groupe | Items activés | Items désactivés |
|--------|--------------|-----------------|
| Principal | Dashboard | — |
| Catalogue | Produits | Catégories, Marques, Fournisseurs |
| Ventes | — | Paniers, Factures |
| Clients | — | Clients, Adresses |
| Stock | — | Inventaire, Mouvements |
| Maintenance | Réinitialisation, Import Wizard, Import CSV | — |

---

## Store Pinia — Import (src/stores/import.js)

```javascript
State:
  files: { fichier1, fichier2, fichier3, images }
  progress: { currentStep, currentItem, percentage, totalItems, processedItems }
  logs: [{ id, message, type, timestamp }]
  status: 'idle' | 'loading' | 'success' | 'error'
  results: { products, combinations, images, customers, orders }
```

---

## Lancer le projet

```bash
cd newApp
npm install
npm run dev    # http://localhost:5173
```

**Prérequis**: Instance PrestaShop accessible sur `https://localhost/ps` avec WebService activé.

---

## Limites actuelles

- Pas de tests automatisés
- Plusieurs routes sidebar sont encore désactivées (catégories, clients, commandes, etc.)
- Le login pré-remplit les credentials en dur dans LoginView.vue (dev only)
- HTTPS localhost avec certificat auto-signé → peut nécessiter `secure: false` dans le proxy

---

## Approche pour étendre le projet

- Respecter la structure modulaire : `views/{module}/`, `services/{module}/`, `components/{module}/`
- Partager les clients HTTP via `src/api/xmlClient.js` (singleton)
- Ajouter les routes dans `src/router/routes.js` avec `meta.permission` si besoin
- Brancher sur le store auth via `useAuth()` composable
- Pour un nouveau module import, réutiliser `csvImportService.js` (mapping dynamique + schema blank)
