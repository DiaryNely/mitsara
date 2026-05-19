# Backoffice — Liste des commandes

## Rôle

Affiche la liste des commandes PrestaShop (et des paniers ouverts associés) avec leurs statuts. Permet à l'administrateur de changer le statut d'une commande via un menu déroulant. Fournit également des statistiques agrégées sur le nombre total de commandes, de commandes payées et d'annulations.

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/orders/OrdersView.vue` | Page principale — charge les données, gère les actions |
| `src/components/orders/OrdersList.vue` | Composant tableau — affichage + interactions utilisateur |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `getOrdersWithOpenCarts(limit)` | `src/api/orders.js` | Commandes + paniers ouverts fusionnés |
| `getOrderStates()` | `src/api/orders.js` | Liste des états disponibles (cache interne) |
| `resolveOrderStateIdByLabel(label)` | `src/api/orders.js` | Résolution label → ID d'état |
| `updateOrderStatus(orderId, stateId)` | `src/api/orders.js` | Mise à jour du statut d'une commande |

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/orders` | `orders` | `requiresAuth: true` |

---

## Appels API

### Chargement initial

```
loadOrders()
  └── Promise.all([
        getOrdersWithOpenCarts(80),    → orders[] (commandes + paniers)
        getOrderStates()               → orderStates[] { id, name }
      ])
  → orders.value = list
  → orderStates.value = states
```

`getOrdersWithOpenCarts(80)` retourne au maximum 80 entrées. Les paniers ouverts sans commande associée sont inclus avec un indicateur `isCart: true`.

### Mise à jour de statut

```
handleUpdateStatus({ orderId, statusValue })
  ├── resolveOrderStateIdByLabel(statusValue)
  │     → Résolution floue label → stateId
  │     → Algorithme : substring exact → heuristiques → fallback
  └── updateOrderStatus(orderId, stateId)
        → PUT /api/orders/{id} avec nouveau currentState
```

---

## Logique métier

### Refs déclarées dans `<script setup>` (OrdersView)

```js
const orders       = ref([])           // liste des commandes chargées
const orderStates  = ref([])           // états disponibles PS
const loading      = ref(false)
const error        = ref('')
const actionMessage = ref('')          // message succès après update
const actionError   = ref('')          // message erreur après update
const updatingIds   = ref(new Set())   // IDs en cours de mise à jour (pour spinners)
```

### Computed (OrdersView)

```js
statusLabelById
// { [stateId]: labelNormalisé }
// Construit depuis orderStates[] pour affichage dans le tableau

stats
// Agrège orders[] en :
// { total, paid (status 'paiement effectue'), cancelled (status 'annule') }
```

### `normalize(str)`

Convertit en minuscules et supprime les diacritiques via `str.normalize('NFD').replace(/\p{Diacritic}/gu, '')`. Utilisé pour la comparaison des statuts.

### `classifyStatus(label)`

Catégorise un statut normalisé :

| Pattern | Catégorie |
|---|---|
| contient "paiement effectue" / "paiement accepte" | `paid` |
| contient "annule" | `cancelled` |
| contient "erreur" / "echec" | `failed` |
| (autres) | `other` |

### Algorithme `resolveOrderStateIdByLabel`

Résolution en 3 passes :
1. **Substring exact** sur label normalisé → premier match
2. **Heuristiques** : patterns spécifiques ("non commande", "panier", "paiement accepte", "erreur paiement", etc.)
3. **Fallback** → lance une erreur si aucun match

### `handleUpdateStatus({ orderId, statusValue })`

```
1. Ajoute orderId dans updatingIds (spinner)
2. Appelle resolveOrderStateIdByLabel(statusValue)
3. Appelle updateOrderStatus(orderId, stateId)
4. En succès : actionMessage = "Statut mis à jour" + reload après 1s
5. En erreur : actionError = message d'erreur
6. finally : retire orderId de updatingIds
```

---

## Composant OrdersList

### Props reçues

```js
items        // commandes[]
statusLabels // { [id]: label }
statusOptions // ['paiement effectue', 'annule'] (options dropdown)
loading      // Boolean
error        // string
updatingIds  // Set<string>
```

### Emits

```
reload         // demande de rechargement complet
update-status  // { orderId, statusValue }
```

### Logique interne

**`sortedItems`** (computed) : trie les commandes par date DESC, puis par ID DESC.

**`getStatusLabel(stateId)`** : résout l'ID vers le libellé lisible.

**`getStatusTone(stateId)`** : retourne une classe CSS (`tone-paid`, `tone-cancelled`, `tone-failed`, `tone-other`) selon `classifyStatus`.

**`formatCurrency(value)`** : `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`.

**`formatDate(dateStr)`** : `Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })`.

**`handleUpdate(order)`** : émet `update-status` avec `{ orderId: order.id, statusValue: selectedStatus }`.

### Cas paniers (isCart: true)

Les entrées `isCart: true` sont affichées dans le tableau mais :
- Le menu déroulant de statut est **désactivé**
- Libellé affiché : "Panier ouvert"
- Pas de bouton de mise à jour

---

## Dépendances importantes

- `useRouter()` — pas utilisé dans la logique (pas de navigation depuis cette page)
- Composant `OrdersList` — séparation claire vue/composant pour réutilisabilité
- Statuts hardcodés dans `statusOptions` : `['paiement effectue', 'annule']` — seuls ces deux changements sont proposés à l'admin

---

## Points critiques

1. **Limite de 80 commandes** : `getOrdersWithOpenCarts(80)` ne charge que les 80 premières entrées. Sur une boutique active, les commandes plus anciennes ne sont pas visibles.
2. **Résolution de statut fragile** : l'algorithme `resolveOrderStateIdByLabel` dépend de correspondances textuelles. Si les libellés d'états PS sont personnalisés différemment, les résolutions peuvent échouer.
3. **Mise à jour optimiste** : après un `updateOrderStatus`, la liste est rechargée via `loadOrders()` (pas de mutation locale) — potentiel clignotement UI.
4. **Paniers vs commandes mélangés** : les paniers ouverts apparaissent dans la même liste, ce qui peut créer de la confusion.
5. **Pas de pagination** : toutes les commandes chargées sont affichées d'un coup dans le tableau.

---

## Améliorations possibles

- Ajouter une pagination serveur (offset + limit) pour gérer les boutiques avec beaucoup de commandes.
- Permettre de filtrer par statut, date ou client dans le tableau.
- Ajouter un filtre pour masquer les paniers ouverts.
- Implémenter une mise à jour locale optimiste plutôt que de recharger toute la liste.
- Étendre les `statusOptions` avec tous les états disponibles dans `orderStates` plutôt qu'une liste hardcodée.
