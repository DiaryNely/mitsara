# Fonctionnalité Bénéfice — Guide d'intégration

> ⚠️ **Statut : implémentée mais non branchée.**
> Tous les fichiers du package `benefice` existent et sont fonctionnels, mais
> aucune route, aucun lien dans la sidebar et aucun import depuis une vue
> existante ne les active. Suivre ce guide pour brancher la fonctionnalité.

---

## 1. Vue d'ensemble

La fonctionnalité **Bénéfice** calcule et affiche :

- le **bénéfice journalier** pour une date sélectionnée ;
- le **bénéfice total** cumulé sur l'ensemble des commandes ;
- une architecture **extensible** (stratégies enregistrables) pour ajouter
  facilement de futurs calculs (mensuel, par catégorie, par produit, etc.).

**Formule** :
`bénéfice ligne = (salePriceHt - wholesalePriceHt) × quantity`

- `salePriceHt` : `order_details.product_price` (PrestaShop)
- `wholesalePriceHt` : `products.wholesale_price` (PrestaShop)

---

## 2. Architecture des fichiers

Un sous-dossier `benefice/` a été créé dans chaque couche du projet pour
isoler la fonctionnalité :

```
newApp/src/
├── api/benefice/
│   ├── index.js                 ← barrel exports
│   └── beneficeApi.js           ← fetch commandes + wholesale_price (cache)
├── services/benefice/
│   ├── index.js
│   ├── beneficeCalculator.js    ← logique pure + registre de stratégies
│   └── beneficeService.js       ← orchestration fetch + calcul
├── stores/benefice/
│   ├── index.js
│   └── beneficeStore.js         ← Pinia store
├── composables/benefice/
│   ├── index.js
│   └── useBenefice.js           ← composable Vue 3 (refs + actions)
├── components/benefice/
│   ├── index.js
│   ├── BeneficeCard.vue         ← composant réutilisable
│   └── BeneficeSummary.vue      ← daily + total + sélecteur de date
└── views/benefice/
    ├── index.js
    ├── BeneficeView.vue         ← page dédiée
    └── beneficeRoute.js         ← définition de route exportable
```

---

## 3. Étapes de branchement

### 3.1 — Ajouter la route

Dans [newApp/src/router/routes.js](../newApp/src/router/routes.js) :

```js
import { beneficeRoute } from '../views/benefice/beneficeRoute'

const routes = [
  // ...routes existantes
  beneficeRoute, // ← ajoute /benefice (requiresAuth: true)
]
```

Ou, si l'on préfère définir la route inline :

```js
import BeneficeView from '../views/benefice/BeneficeView.vue'

{
  path: '/benefice',
  name: 'benefice',
  component: BeneficeView,
  meta: { requiresAuth: true },
}
```

### 3.2 — Ajouter le lien dans la sidebar

Dans [newApp/src/components/layout/AdminSidebar.vue](../newApp/src/components/layout/AdminSidebar.vue),
ajouter une entrée pointant vers `{ name: 'benefice' }` (suivre le pattern
des entrées existantes — `dashboard`, `orders`, `import`, etc.).

### 3.3 — (Optionnel) Intégrer le composant dans le Dashboard

Pour afficher les cartes directement dans
[DashboardView.vue](../newApp/src/views/DashboardView.vue) sans créer de page
dédiée :

```vue
<script setup>
import { BeneficeSummary } from '../components/benefice'
</script>

<template>
  <!-- ... -->
  <BeneficeSummary auto-fetch />
</template>
```

### 3.4 — (Optionnel) Carte unique standalone

Pour afficher uniquement le **bénéfice total** dans un widget existant :

```vue
<script setup>
import { onMounted } from 'vue'
import { BeneficeCard } from '../components/benefice'
import { useBenefice } from '../composables/benefice'

const { total, loading, errors, fetchTotal } = useBenefice()
onMounted(fetchTotal)
</script>

<template>
  <BeneficeCard
    label="Bénéfice total"
    :value="total.benefice"
    :loading="loading.total"
    :error="errors.total"
    variant="auto"
  />
</template>
```

---

## 4. Composants à importer

| Composant | Import | Usage |
|---|---|---|
| `BeneficeCard` | `import { BeneficeCard } from '@/components/benefice'` | Affichage d'un montant unique (réutilisable partout) |
| `BeneficeSummary` | `import { BeneficeSummary } from '@/components/benefice'` | Affichage daily + total + sélecteur de date |
| `BeneficeView` | `import { BeneficeView } from '@/views/benefice'` | Page complète (utilisée par la route `/benefice`) |

### Props de `BeneficeCard`

| Prop | Type | Défaut | Description |
|---|---|---|---|
| `label` | String | *requis* | Libellé affiché en en-tête |
| `value` | Number/String | `0` | Montant à afficher |
| `loading` | Boolean | `false` | Affiche un skeleton |
| `error` | String | `''` | Message d'erreur sous la carte |
| `description` | String | `''` | Sous-titre |
| `variant` | String | `'default'` | `'default'`, `'positive'`, `'negative'`, `'auto'` |
| `currency` | String | `'EUR'` | Code devise |
| `locale` | String | `'fr-FR'` | Locale pour le formatage |

Slot `footer` disponible.

### Props de `BeneficeSummary`

| Prop | Type | Défaut | Description |
|---|---|---|---|
| `autoFetch` | Boolean | `true` | Charge automatiquement les données au montage |
| `initialDate` | String | `''` | Date initiale (YYYY-MM-DD). Aujourd'hui par défaut |
| `showDailySelector` | Boolean | `true` | Affiche le sélecteur de date |

Slot `extras` avec `{ daily, total }` exposés.

Méthodes exposées via `defineExpose` : `refresh()`, `fetchDaily(date)`,
`fetchTotal()`, `fetchAll()`.

---

## 5. Services et store

### Composable `useBenefice` (recommandé pour les vues)

```js
import { useBenefice } from '@/composables/benefice'

const {
  // état (refs réactives)
  daily, total, loading, errors, lastUpdated,
  // valeurs dérivées
  dailyBenefice, totalBenefice,
  dailyFormatted, totalFormatted,
  isLoading,
  // actions
  fetchDaily, fetchTotal, fetchAll, setDate, reset, applyStrategy,
  // utils
  formatCurrency,
} = useBenefice({
  autoFetch: false,      // optionnel
  initialDate: '2026-05-17', // optionnel
})
```

### Store Pinia direct

```js
import { useBeneficeStore } from '@/stores/benefice'

const store = useBeneficeStore()
await store.fetchAll()
console.log(store.daily.benefice, store.total.benefice)
```

### Services bas niveau

```js
import { loadDailyBenefice, loadTotalBenefice } from '@/services/benefice'

const daily = await loadDailyBenefice('2026-05-17')
const total = await loadTotalBenefice()
```

---

## 6. Extension — Ajouter une stratégie de calcul

Le calculator expose un registre de stratégies enregistrables.
Stratégies natives : `'total'`, `'daily'`, `'byDay'`.

Exemple : ajouter une stratégie mensuelle :

```js
import { registerStrategy } from '@/services/benefice'

registerStrategy('monthly', (lines) => {
  const map = {}
  for (const line of lines) {
    const month = (line.dateAdd || '').slice(0, 7) // 'YYYY-MM'
    if (!month) continue
    const benefice = (line.salePriceHt - line.wholesalePriceHt) * line.quantity
    map[month] = (map[month] || 0) + benefice
  }
  return map
})
```

Utilisation depuis une vue :

```js
const { applyStrategy } = useBenefice()
const monthlyMap = applyStrategy('monthly')
```

L'enregistrement peut se faire au démarrage de l'app (dans `main.js`),
dans un plugin Vue, ou à la volée depuis un composant.

---

## 7. Dépendances

Toutes les dépendances utilisées sont déjà présentes dans le projet :

- **`vue` 3** — composition API (`ref`, `computed`, `onMounted`)
- **`pinia`** — store
- **`axios`** (via `xmlClient` existant) — appels HTTP
- API internes réutilisées :
  - `api/orders.js` — `getOrders`, `getOrderRows`, `getOrdersByDateRangePage`
  - `api/xmlClient.js` — client XML pour PrestaShop
  - `utils/xml.js` — `readText`, `xmlToJson`, `asArray`

**Aucun ajout de dépendance npm n'est nécessaire.**

---

## 8. Données PrestaShop requises

| Donnée | Source | Détail |
|---|---|---|
| Liste des commandes | `GET /api/orders` | Pagination via `limit=offset,size` |
| Lignes de commande | `GET /api/orders/{id}?display=full` | Champ `order_rows` |
| Prix d'achat HT | `GET /api/products/{id}?display=[wholesale_price]` | Mis en cache mémoire |

Le champ `wholesale_price` doit être renseigné côté produit pour que le calcul
soit pertinent. Sinon le bénéfice = montant de vente complet (pas de coût d'achat).

---

## 9. Checklist de branchement

- [ ] Ajouter `beneficeRoute` dans `src/router/routes.js`
- [ ] Ajouter le lien dans `AdminSidebar.vue` (libellé "Bénéfices", icône au choix)
- [ ] (Optionnel) Embarquer `<BeneficeSummary />` dans `DashboardView.vue`
- [ ] Vérifier que les produits ont bien `wholesale_price` renseigné
- [ ] (Optionnel) Enregistrer des stratégies custom dans `main.js` si besoin

---

## 10. Points d'attention

- **Performance** : le chargement du bénéfice total appelle
  `GET /api/products/{id}` pour chaque produit distinct. Un cache mémoire
  (`wholesalePriceCache`) évite les requêtes redondantes mais le premier
  chargement peut prendre quelques secondes sur un catalogue volumineux.
  Pour vider le cache manuellement :
  ```js
  import { clearWholesalePriceCache } from '@/api/benefice'
  clearWholesalePriceCache()
  ```

- **Statut des commandes** : actuellement *toutes* les commandes (peu importe
  leur statut) sont prises en compte. Si l'on veut exclure les commandes
  annulées, filtrer dans `beneficeService.js` avant de retourner les lignes,
  ou ajouter un paramètre `statusFilter` à `loadTotalBenefice`.

- **Devise et locale** : `BeneficeCard` accepte les props `currency` et
  `locale` pour s'adapter (par défaut EUR / fr-FR).
