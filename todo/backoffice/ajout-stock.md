# Backoffice — Ajout de stock

## Rôle

Permet à l'administrateur d'ajouter ou retirer des quantités de stock pour n'importe quel produit (avec ou sans déclinaison). Chaque opération crée un mouvement de stock dans PrestaShop (`ps_stock_mvt`) et met à jour la table `stock_available`. L'opération est tracée avec un type de mouvement, un commentaire et le nom de l'employé.

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/stock/StockAddView.vue` | Page principale — layout deux colonnes (liste produits + formulaire) |
| `src/components/layout/AdminSidebar.vue` | Lien "Ajout stock" dans le groupe Stock |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `getProducts({ filters, page, pageSize, sort })` | `src/api/products.js` | Liste paginée de produits avec filtres |
| `getProductCombinations(productId)` | `src/api/stock.js` | Déclinaisons d'un produit |
| `getAllStockAvailables(productId)` | `src/api/stock.js` | Stock de toutes les déclinaisons d'un produit |
| `getStockAvailable(productId, attributeId)` | `src/api/stock.js` | Stock d'une déclinaison précise (refresh post-submit) |
| `addStock(params)` | `src/services/stock/stockService.js` | Logique complète d'ajout/retrait de stock |
| `updateStockViaModule(productId, attributeId, delta, employee)` | `src/api/stockModule.js` | Appel HTTP vers le module PS pour créer le mouvement |

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/stock` | `stock-add` | `requiresAuth: true` |

---

## Appels API

### Chargement de la liste produits

```
loadProducts(page)
  └── getProducts({
        filters: { name: filterQuery, active: filterActive },
        page,
        pageSize: 20,
        sort: { field: 'name', direction: 'ASC' }
      })
  → { items[], hasMore }
  → Pour chaque produit : lecture du stock global (optionnel)
```

### Sélection d'un produit

```
selectProduct(product)
  └── Promise.all([
        getProductCombinations(product.id),   → combinations[]
        getAllStockAvailables(product.id)      → allStocks[]
      ])
  → Sélectionne la déclinaison "0" (produit simple) par défaut
  → Lit currentStock depuis allStocks[0].quantity
```

### Soumission du formulaire

```
handleSubmit()
  └── addStock({
        product,
        attributeId: selectedAttrId || 0,
        delta,                          // positif = ajout, négatif = retrait
        movementType,                   // 'supply' | 'correction' | 'return' | 'other'
        comment,
        employeeId,
        employeeFirstname,
        employeeLastname
      })
      │
      ├── [dans addStock service]
      │     ├── getStockAvailable(productId, attributeId)
      │     │     → Vérifie le stock actuel
      │     │     → Lève une erreur si retrait > stock disponible
      │     │
      │     └── updateStockViaModule(productId, attributeId, delta, employee)
      │           → POST vers module stockapi PS
      │           → Crée ps_stock_mvt + met à jour stock_available
      │           → Retourne { new_quantity }
      │
      └── Retourne { quantityBefore, quantityAfter, delta }

  Post-submit :
  └── getStockAvailable(productId, attrId)
        → Actualise currentStock affiché
```

---

## Logique métier

### Refs déclarées dans `<script setup>`

**Colonne gauche (liste produits)**
```js
const products       = ref([])
const listLoading    = ref(false)
const listError      = ref('')
const page           = ref(1)
const hasMore        = ref(false)
const PAGE_SIZE      = 20
const filterQuery    = ref('')         // filtre textuel nom produit
const filterActive   = ref(true)      // filtre produits actifs uniquement
```

**Colonne droite (sélection + formulaire)**
```js
const selectedProduct       = ref(null)
const combinations          = ref([])
const combinationsLoading   = ref(false)
const allStocks             = ref([])
const selectedAttrId        = ref('0')    // '0' = produit simple
const currentStock          = ref(0)

const delta           = ref(0)        // quantité à ajouter/retirer
const movementType    = ref('supply') // type de mouvement
const comment         = ref('')
const employeeName    = ref('')       // chargé depuis authStore au montage

const submitting      = ref(false)
const submitError     = ref('')
const successInfo     = ref(null)     // { quantityBefore, quantityAfter, delta }
```

### Computed

```js
hasCombinations         // combinations.length > 0
currentQty              // currentStock (alias lisible)
selectedCombinationLabel // Libellé de la déclinaison sélectionnée
formValid               // delta !== 0 && selectedProduct !== null
```

### `onFilterInput()`

Debounce de 350ms sur `filterQuery` → relance `loadProducts(1)`.

### `prevPage()` / `nextPage()`

Pagination côté client sur la liste produits (20 items/page).

### `handleSubmit()`

```
1. Vérifie formValid (guard)
2. submitting = true
3. Appelle addStock(params)
4. En succès :
   - successInfo = { quantityBefore, quantityAfter, delta }
   - Actualise currentStock via getStockAvailable()
   - Remet delta = 0, comment = ''
5. En erreur : submitError = message
6. finally : submitting = false
```

### MOVEMENT_TYPES (constante service)

| Valeur | Libellé |
|---|---|
| `supply` | Approvisionnement |
| `correction` | Correction |
| `return` | Retour produit |
| `other` | Autre |

### Validation dans `addStock` service

```js
if (!delta || delta === 0) throw Error('La quantité doit être différente de zéro.')
if (expectedAfter < 0) throw Error(`Stock insuffisant : actuel=${qty}, retrait=${Math.abs(delta)}.`)
```

---

## Dépendances importantes

- `useAuthStore()` — lit `employee.firstname` + `employee.lastname` au `onMounted` pour pré-remplir `employeeName`
- `filterActive = ref(true)` — seuls les produits actifs sont listés par défaut
- `selectedAttrId = '0'` — convention : `'0'` = pas de déclinaison (produit simple)
- Le module PS `stockapi` doit être installé et actif pour que `updateStockViaModule` fonctionne

---

## Points critiques

1. **Validation stock insuffisant** : le service lit le stock **avant** d'envoyer la requête. Entre cette lecture et l'écriture, le stock peut changer (race condition en cas d'accès concurrent).
2. **Dépendance au module PS** : `updateStockViaModule` appelle un endpoint custom (`/modules/stockapi/...`). Si le module n'est pas installé, toutes les opérations échouent silencieusement ou avec une erreur réseau.
3. **Delta négatif = retrait** : il n'y a pas de champ "type d'opération" séparé pour ajout/retrait — le signe de `delta` détermine le sens. L'UI doit clairement communiquer cela.
4. **Pas de confirmation** : la soumission est immédiate sans modal de confirmation. Une saisie erronée est appliquée directement.
5. **employeeName en texte libre** : le nom de l'employé est pré-rempli mais modifiable — pas de vérification d'identité côté PS.

---

## Améliorations possibles

- Ajouter une modale de confirmation avant soumission (surtout pour les retraits).
- Permettre de saisir un delta négatif directement (retrait) ou séparer en deux boutons +/-.
- Afficher l'historique récent des mouvements du produit sélectionné directement dans la page.
- Ajouter la recherche par référence produit en plus du nom.
- Implémenter un import en masse de corrections de stock via CSV.
