# Backoffice — Dashboard

## Rôle

Page d'accueil du back-office. Affiche des indicateurs clés de performance (KPI) en temps réel : commandes du jour, chiffre d'affaires du jour, total commandes, chiffre d'affaires global. Propose aussi un tableau de détail des ventes par produit et par catégorie pour une date donnée.

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/DashboardView.vue` | Page principale — KPIs + tableau de détail |
| `src/components/layout/AdminSidebar.vue` | Navigation (lien Dashboard actif) |
| `src/components/layout/AdminHeader.vue` | En-tête avec bouton actualiser + info employé |

---

## Services utilisés

| Service / API | Fichier | Rôle |
|---|---|---|
| `getOrdersByDateRangePage` | `src/api/orders.js` | Commandes filtrées par date (paginées) |
| `getOrders` | `src/api/orders.js` | Toutes les commandes (paginées, sans filtre date) |
| `getOrderRows` | `src/api/orders.js` | Lignes de commande (produits) d'une commande |
| `getCategories` | `src/api/categories.js` | Liste des catégories pour le tableau de détail |
| `getFrontProductById` | `src/services/frontoffice/products.js` | Données produit (nom, image, catégorie) |
| `getTaxRateForGroup` | `src/services/frontoffice/taxService.js` | Taux de TVA par groupe fiscal |

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/dashboard` | `dashboard` | `requiresAuth: true` |

---

## Appels API

### Chargement des stats journalières

```
loadDailyStats()
  └── fetchSummary(fetchPage)  [boucle paginée, 200 items/page]
        └── getOrdersByDateRangePage(dailyDate, { limit: 200, offset })
              → Retourne les commandes du jour en cours
              → Boucle jusqu'à hasMore = false
        → Calcule : ordersDay (count), revenueDay (sum totalPaid)
```

### Chargement des stats globales

```
loadTotalStats()
  └── fetchSummary(fetchPage)  [boucle paginée, 200 items/page]
        └── getOrders({ limit: 200, offset })
              → Retourne toutes les commandes
        → Calcule : totalOrders (count), totalRevenue (sum totalPaid)
```

### Chargement du tableau de détail

```
loadDailyDetails()
  ├── getOrdersByDateRangePage(dailyDate, { limit: 200 })
  │     → Commandes du jour
  ├── Pour chaque commande :
  │     └── getOrderRows(orderId)
  │           → Lignes (produitId, qty, prixUnit, total)
  │     └── getFrontProductById(productId)
  │           → Nom, catégorie, taxGroup
  │     └── getTaxRateForGroup(taxRulesGroupId)
  │           → Taux TVA → prix TTC
  └── Construit dailyDetailRows[] avec : ref, nomProduit, catégorie, qté, prixUnit TTC, total TTC
```

### Chargement des catégories

```
getCategories()
  → Retourne { id, name }[]
  → Stocké dans categories[]
  → categoryMap computed : { [id]: name }
```

---

## Logique métier

### Refs déclarées dans `<script setup>`

```js
const dailyDate          = ref(today)       // date filtre YYYY-MM-DD
const dailyStats         = ref(null)        // { ordersDay, revenueDay }
const totalStats         = ref(null)        // { totalOrders, totalRevenue }
const dailyLoading       = ref(false)
const totalLoading       = ref(false)
const dailyError         = ref('')
const totalError         = ref('')
const dailyDetailRows    = ref([])          // lignes tableau détail
const dailyDetailLoading = ref(false)
const dailyDetailError   = ref('')
const categories         = ref([])
```

### Computed

```js
categoryMap    // { [id]: categoryName } — map pour affichage dans le tableau
detailSummary  // { count: n, total: sumTotal } — totaux du tableau de détail
```

### `fetchSummary(fetchPage)`

Boucle de pagination générique :
- Appelle `fetchPage(offset)` avec offset croissant par 200
- Continue tant que la page retourne 200 items
- Accumule toutes les commandes en mémoire
- Retourne le tableau complet

### `handleDailyDateChange()`

Déclenché sur changement de `dailyDate` : recharge `loadDailyStats()` + `loadDailyDetails()`.

### `setToday()`

Réinitialise `dailyDate` à la date du jour puis recharge.

### `refreshAll()`

Recharge les 4 sources en parallèle (`Promise.all`) : stats journalières, stats globales, détails, catégories.

### Hooks

```js
onMounted(() => {
  loadDailyStats()
  loadTotalStats()
  loadDailyDetails()
  getCategories().then(...)
})
```

---

## KPI Cards

| Card | Valeur | Couleur |
|---|---|---|
| Commandes aujourd'hui | `dailyStats.ordersDay` | Indigo |
| CA aujourd'hui | `dailyStats.revenueDay` (formaté €) | Emeraude |
| Total commandes | `totalStats.totalOrders` | Ambre |
| CA global | `totalStats.totalRevenue` (formaté €) | Bleu |

---

## Tableau de détail

Colonnes : **Référence commande** · **Produit** · **Catégorie** · **Quantité** · **Prix unit. TTC** · **Total TTC**

- Trié par référence de commande
- Prix calculés avec TVA appliquée (`prixHT × (1 + tauxTVA)`)
- Catégorie résolue via `categoryMap[categoryId]`

---

## Dépendances importantes

- `useRoute()`, `useRouter()` — navigation
- Auth store — lecture de `employeeFullName` pour l'en-tête
- `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })` — formatage monétaire
- Client XML global initialisé lors du login (requis pour tous les appels API)

---

## Points critiques

1. **Pagination boucle N×200** : si la boutique a des milliers de commandes, `loadTotalStats()` fait autant de requêtes que nécessaire — potentiellement lent et gourmand en mémoire.
2. **Chargement en cascade pour le détail** : `loadDailyDetails()` fait `getOrderRows()` + `getFrontProductById()` + `getTaxRateForGroup()` pour chaque commande du jour — N commandes = 3N requêtes. Aucun batch.
3. **Pas de cache** : chaque `refreshAll()` recharge tout depuis PS, sans mémoisation.
4. **Date du jour en local** : `dailyDate` est calculée côté client. Si le serveur PS est dans un fuseau différent, les commandes "du jour" peuvent être décalées.
5. **Erreurs indépendantes** : `dailyError` et `totalError` sont séparées, l'une n'empêche pas l'autre de s'afficher.

---

## Améliorations possibles

- Mettre en cache les résultats `getTaxRateForGroup` (même groupe fiscal souvent répété) pour réduire les requêtes.
- Paginer le tableau de détail côté client pour ne pas bloquer le rendu sur de gros volumes.
- Ajouter une sélection de période (semaine, mois) en plus du filtre par jour.
- Utiliser `Promise.allSettled` pour le chargement parallèle des détails (évite qu'une seule erreur bloque tout).
- Afficher un graphique d'évolution sur 7 jours en complément des KPIs.
