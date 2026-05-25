# Backoffice — Historique des mouvements de stock

## Rôle

Consulte l'historique complet des mouvements de stock pour un produit donné (avec ou sans déclinaison). Présente les données sous deux formes : un **tableau paginé** des mouvements bruts, et un **graphique SVG en ligne unique** reconstituant l'évolution du niveau de stock dans le temps (montée = ajout, descente = sortie).

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/stock/StockHistoryView.vue` | Page unique — sélecteur produit + tableau + graphique |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `getProducts({ page, pageSize, sort })` | `src/api/products.js` | Liste des produits pour le sélecteur |
| `getProductCombinations(productId)` | `src/api/stock.js` | Déclinaisons du produit sélectionné |
| `getStockMovementsFromModule({ id_product, id_product_attribute, limit })` | `src/api/stockModule.js` | Mouvements de stock depuis le module PS |
| `getStockAvailable(productId, attributeId)` | `src/api/stock.js` | Stock actuel (point de départ reconstitution) |
| `computeDailyStats(movements, currentStock)` | `src/services/stock/stockService.js` | Agrégation journalière pour le graphique |

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/stock-history` | `stock-history` | `requiresAuth: true` |

---

## Appels API

### Chargement des produits

```
loadProducts()
  └── getProducts({ page: 1, pageSize: 200, sort: { field: 'name', direction: 'ASC' } })
  → products[] pour le <select> de filtrage
```

### Chargement des déclinaisons (watch)

```
watch(selectedProductId, async (newId) => {
  combinations = await getProductCombinations(newId)
})
```

### Chargement des mouvements

```
load()
  └── Promise.all([
        getStockMovementsFromModule({
          id_product: activeProductId,
          id_product_attribute: attrId || undefined,
          limit: 100
        }),
        getStockAvailable(activeProductId, attrId || 0)
      ])
  → movements[]     : liste brute des mouvements
  → currentStock    : stock actuel (pour reconstitution historique)
```

---

## Logique métier

### Refs déclarées dans `<script setup>`

**Sélection produit**
```js
const products            = ref([])
const productsLoading     = ref(false)
const selectedProductId   = ref('')
const selectedAttributeId = ref('0')
const activeProductId     = ref('')         // ID validé après clic "Valider"
const activeAttributeId   = ref('0')
const combinations        = ref([])
const combinationsLoading = ref(false)
```

**Données**
```js
const movements    = ref([])
const loading      = ref(false)
const error        = ref('')
const total        = ref(0)
const currentStock = ref(0)
const PAGE_SIZE    = 100        // module gère jusqu'à 500 côté PS
```

**Pagination côté client**
```js
const page         = ref(1)
const PAGE_DISPLAY = 25         // 25 mouvements par page affichée
```

**Onglets**
```js
const activeTab = ref('table')  // 'table' | 'chart'
```

### Computed

```js
totalPages      // Math.ceil(movements.length / PAGE_DISPLAY)
hasMore         // page.value < totalPages.value
pagedMovements  // slice de movements[] pour la page courante
globalStats     // { count, totalIn (delta > 0), totalOut (abs delta < 0) }
dailyStats      // computeDailyStats(movements, currentStock)
chartData       // coordonnées SVG calculées depuis dailyStats
```

### `handleValider()`

```
activeProductId   = selectedProductId
activeAttributeId = selectedAttributeId
page = 1
load()
```

### `handleReset()`

Réinitialise toute la sélection et recharge sans filtre (tous mouvements).

### `computeDailyStats(movements, currentStock)`

Algorithme de reconstitution du stock historique :

```
1. Trie les mouvements par date ASC
2. Calcule le stock de départ :
   stockDépart = max(0, currentStock - Σ(tous les deltas))
3. Pour chaque jour :
   - stock_start = stock courant avant les mouvements du jour
   - entries     = Σ(delta > 0)
   - exits       = Σ(abs(delta < 0))
   - stock_end   = stock_start + entries - exits
4. Retourne [{ day, stock_start, entries, exits, stock_end }]
```

### Graphique SVG (chartData computed)

Dimensions constantes (issues du script, non modifiables) :
```js
const CHART_W = 720
const CHART_H = 260
const PAD     = { left: 44, right: 20, top: 18, bottom: 90 }
// innerW = 656, innerH = 152, STOCK_BOT = 170
```

Calculs :
```js
xStep     = innerW / (days.length - 1)
toX(i)    = PAD.left + i * xStep
yMax      = max(stock_end) × 1.2
toY(v)    = PAD.top + innerH - (v / yMax) × innerH

stockPath = path "M x0,y0 L x1,y1 ..."  (ligne droite entre points)
areaPath  = stockPath + fermeture vers base
```

**Gradients** :
- Ligne : `#a5b4fc → #6366f1` (horizontal)
- Remplissage : `#6366f1` opacité 22% → 0% (vertical)

**Animations** :
- `.sc-line` : `stroke-dasharray: 1; stroke-dashoffset: 1` → `scDraw` (1.4s)
- `.sc-area` : opacity 0 → 1 (`scFade`, 0.8s, delay 0.7s)
- `.sc-dot` : scale 0.2 → 1 (`scPop`, 0.32s, delay `0.5 + i × 0.045s`)

**Tooltip SVG** (au survol des points) :
```js
showTooltip(pt) { tooltip = pt.d; tooltipX = pt.x; tooltipY = pt.y }
// Affiche : date, stock_end (grand), entries ↑ + exits ↓
// Flip automatique si tooltipX > CHART_W - 182
```

### Tableau mouvements

Colonnes : **Date** · **Produit** · **Référence** · **Mouvement** (badge ±) · **Motif** · **Employé**

`deltaClass(delta)` : retourne `delta-pos` (vert), `delta-neg` (rouge), `delta-zero` (gris).

### Tableau journalier (sous le graphique)

Colonnes : **Jour** · **Stock début** · **Entrées** · **Sorties** · **Stock fin** · **Variation**

Affiché en ordre chronologique inverse (`[...dailyStats].reverse()`).

---

## Dépendances importantes

- Module PS **stockapi** obligatoire — sans lui, `getStockMovementsFromModule` retourne une erreur
- `computeDailyStats` exige que `movements` soient triés ou triables par `date_add` (string ISO)
- Deux onglets partagent le même jeu de données : le tableau et le graphique affichent les **mêmes** mouvements, simplement présentés différemment

---

## Points critiques

1. **Limite de 100 mouvements** : `PAGE_SIZE = 100` dans la requête module. Sur des produits très actifs, l'historique complet n'est pas chargé — les stats globales et le graphique sont partiels.
2. **Reconstitution rétrospective** : le niveau de stock historique est calculé en remontant depuis `currentStock`. Si des mouvements existent en dehors de la fenêtre de 100, la reconstitution sera erronée.
3. **Pagination purement client** : tous les 100 mouvements sont chargés en mémoire, la pagination (`PAGE_DISPLAY = 25`) ne fait que découper l'affichage.
4. **Distinction "validé" vs "sélectionné"** : deux états (`selectedProductId` ≠ `activeProductId`) — le filtre n'est appliqué qu'après clic sur "Valider", pas en temps réel.
5. **Pas de filtre par date** : impossible de restreindre l'historique à une plage de dates.

---

## Améliorations possibles

- Augmenter ou rendre paramétrable la limite de mouvements chargés (actuellement 100).
- Ajouter un filtre par plage de dates sur les mouvements.
- Exporter l'historique en CSV.
- Afficher un indicateur de chargement partiel si `movements.length === PAGE_SIZE` (indique que la limite a été atteinte).
- Permettre la navigation entre produits sans avoir à cliquer "Valider" à chaque fois (mode "instant apply").
