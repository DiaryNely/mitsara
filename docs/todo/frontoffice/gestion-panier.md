# Front-office — Gestion du panier

## Rôle

Gère le cycle de vie complet du panier d'achat depuis l'ajout d'un produit jusqu'à la validation de la commande. Supporte deux modes : **panier anonyme** (visiteur non connecté, stocké uniquement en localStorage) et **panier authentifié** (synchronisé en temps réel avec PrestaShop). Le transfert du panier anonyme vers le client lors de la connexion est automatique.

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/front/FrontCartView.vue` | Page panier — liste des articles + résumé + CTA |
| `src/views/front/FrontProductDetailView.vue` | Fiche produit — ajout au panier (qty + déclinaison) |
| `src/views/front/FrontCheckoutView.vue` | Checkout — sync finale + passage de commande |
| `src/components/front/FrontHeader.vue` | Badge compteur articles dans la nav |
| `src/stores/front/cart.js` | Store Pinia — état + actions (490 lignes) |
| `src/composables/front/useCart.js` | Composable — interface publique du store |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `upsertCart({ cartId, customerId, addressId, items })` | `src/services/frontoffice/cartService.js` | POST (nouveau) ou PUT (existant) panier PS |
| `emptyCart({ cartId, customerId, addressId })` | `src/services/frontoffice/cartService.js` | Vide les lignes d'un panier |
| `deleteCart(cartId)` | `src/services/frontoffice/cartService.js` | Supprime un panier (DELETE) |
| `verifyCartId(cartId)` | `src/services/frontoffice/cartService.js` | Vérifie qu'un cartId existe encore dans PS |
| `getLatestOpenCustomerCart(customerId)` | `src/services/frontoffice/cartService.js` | Récupère le dernier panier ouvert d'un client |
| `getFrontProductById(productId)` | `src/services/frontoffice/products.js` | Données produit pour hydratation des lignes |
| `getCombinationById(comboId)` | `src/services/frontoffice/products.js` | Données déclinaison |
| `getTaxRateForGroup(taxRulesGroupId)` | `src/services/frontoffice/taxService.js` | Taux TVA pour calcul TTC |
| `getStockAvailable(productId, attributeId)` | `src/api/stock.js` | Vérification stock avant ajout |

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/front/cart` | `front-cart` | `layout: 'front'` |
| `/front/products/:id` | `front-product-detail` | `layout: 'front'` (ajout au panier depuis ici) |

---

## Appels API

### Initialisation du panier

```
cartStore.initialize({ customerId, skipLoad })
  ├── _resolveOwnerId(customerId)      → 'cust-{id}' | 'anon'
  ├── _loadLocal(ownerId)              → Lit localStorage
  │
  ├── Si cartId en localStorage :
  │     verifyCartId(cartId)
  │       → GET /api/carts/{id}
  │       → { valid: bool, reason: string }
  │     Si invalide → cartId = '', _persist()
  │
  └── Si customer + pas de cartId local :
        _hydrateFromRemote(customerId)
          └── getLatestOpenCustomerCart(customerId)
                → GET /api/carts?filter[id_customer]={id}&sort=[id_DESC]
                → Retourne le dernier panier ouvert
              └── _buildItemsFromRows(cart.rows)
                    └── Pour chaque ligne :
                          getFrontProductById(productId)
                          getCombinationById(comboId)  [si déclinaison]
                          getTaxRateForGroup(taxGroupId)
```

### Ajout d'un article

```
cartStore.addItem({ productId, attributeId, name, price, image, quantity })
  ├── getStockAvailable(productId, attributeId)
  │     → Vérifie que qty demandée ≤ stock disponible
  │     → Lance Error si insuffisant
  ├── Cherche item existant (même productId + attributeId)
  │     → Si trouvé : quantity += qty
  │     → Si non trouvé : push nouveau item
  ├── _persist(ownerId)                 → Sauvegarde localStorage
  └── _syncIfPossible()                 → Sync PS si customerId
```

### Synchronisation avec PrestaShop

```
_syncIfPossible()   [auto après chaque mutation si authentifié]
  └── upsertCart({ cartId, customerId, addressId, items })
        ├── Si cartId vide → POST /api/carts    → récupère nouvel ID
        └── Si cartId défini → PUT /api/carts/{id}
              Body : { id_customer, id_address_delivery, associations: { cart_rows[] } }
        → Retourne { cartId }
        → Si 404 → cartId = '', retry (crée nouveau)
```

### Transfert panier anonyme → client

```
cartStore.claimForCustomer(customerId)   [appelé post-login]
  └── _claimAnonymousCart(customerId)
        └── Si cartId anonyme existe + customer n'a pas de panier :
              PUT /api/carts/{cartId}
                Body : { id_customer: customerId }
              → Associe le panier au client
              → Toutes les lignes sont préservées
```

### Suppression du panier

```
cartStore.clearCart()
  ├── Tentative DELETE /api/carts/{cartId}
  └── Si erreur → emptyCart() : PUT /api/carts/{id} avec cart_rows vide
  → items = [], cartId = '', _persist()
```

### Post-commande

```
cartStore.onOrderPlaced()
  ├── items = [], cartId = '', addressId = ''
  ├── _persist(ownerId)    → Efface localStorage
  └── initialized = false
```

---

## Logique métier

### État du store `cart.js`

```js
state = {
  cartId:      '',        // ID cart PS ('') si non créé
  addressId:   '',        // ID adresse de livraison
  items:       [],        // [{ key, productId, attributeId, name, price, image, quantity }]
  syncing:     false,
  error:       '',
  initialized: false,
  ownerId:     ''         // 'cust-{id}' | 'anon'
}
```

### Getters

```js
totalItems   // Σ(item.quantity)
subtotal     // Σ(item.price × item.quantity)
isEmpty      // items.length === 0
```

### Clé d'item (`key`)

Format : `'{productId}-{attributeId}'` (attributeId = 0 si produit simple)

Utilisée pour identifier et dédupliquer les items dans le tableau.

### Persistence localStorage

```js
_loadLocal(ownerId)     → clé localStorage : `cart_${ownerId}`
_persist(ownerId)       → JSON.stringify({ cartId, addressId, items })
_removePersisted(ownerId) → localStorage.removeItem(`cart_${ownerId}`)
```

### `_ensureAddressId(customerId)`

Si `addressId` est vide lors d'une sync :
```
getCustomerAddresses(customerId)
→ Prend addresses[0].id comme adresse par défaut
→ Met à jour addressId
```

---

## Page FrontCartView

### Structure affichée

**Colonne gauche — Articles** :
- Miniature 88px + nom + variante + prix unit.
- Contrôle quantité +/−
- Bouton supprimer (X rouge au hover)

**Colonne droite — Résumé sticky** :
- Sous-total HT
- Sous-total TTC
- Badge "Livraison offerte" (fixe, pas de logique carrier)
- Bouton "Passer la commande" → `/front/checkout`

**État vide** :
- Icône SVG + message + bouton "Voir le catalogue" → `/front/products`

### Refs déclarées

```js
const { items, subtotal, totalItems, isEmpty, syncing,
        updateQuantity, removeItem, clearCart } = useCart()
```

### Interactions utilisateur

```
+  bouton → updateQuantity(key, qty + 1)
-  bouton → updateQuantity(key, qty - 1)  [désactivé si qty = 1]
×  bouton → removeItem(key)
Checkout CTA → router.push('/front/checkout')
```

---

## Page FrontProductDetailView — Ajout au panier

### Refs déclarées

```js
const quantity          = ref(1)
const selectedCombination = ref('')   // ID déclinaison
const addingToCart      = ref(false)
const addSuccess        = ref(false)
const addError          = ref('')
```

### Déclinaisons (pill buttons)

```js
watch(selectedCombination, async (newId) => {
  await loadCombination(newId)    // stock + prix de la déclinaison
  await loadStock(newId)
})
```

### `handleAddToCart()`

```
1. addingToCart = true
2. addItem({
     productId, attributeId: selectedCombination || 0,
     name, price, image, quantity
   })
3. En succès : addSuccess = true (3s) → revert
4. En erreur : addError = message
5. finally : addingToCart = false
```

---

## Composable `useCart()`

Expose toutes les refs + actions du store :

```js
{ items, totalItems, subtotal, syncing, error, cartId, addressId, initialized,
  hydrate, initialize, addItem, updateQuantity, removeItem, clearCart,
  setAddressId, syncCart, onOrderPlaced }
```

---

## Dépendances importantes

- **Panier anonyme** : fonctionne sans connexion, stocké uniquement en localStorage, jamais synchronisé avec PS
- **`_syncIfPossible()`** : appelé après chaque mutation si `ownerId !== 'anon'` — nécessite un client connecté
- **TVA** : le prix stocké dans `items[].price` est le prix HT. L'affichage TTC est calculé à la volée
- **Stock** : vérifié avant chaque `addItem` — pas de sur-vente possible côté client (mais pas de lock serveur)

---

## Points critiques

1. **Race condition stock** : la vérification de disponibilité est optimiste (lu avant d'écrire). En forte concurrence, deux utilisateurs peuvent ajouter le dernier article simultanément.
2. **Panier zombi** : si un client ferme l'onglet pendant un `clearCart` partiel, un panier vide peut rester dans PS sans être supprimé.
3. **Pas de gestion des promotions** : prix et totaux ne tiennent pas compte des remises, codes promo ou frais de port variables.
4. **localStorage multi-onglets** : deux onglets ouverts en même temps avec le même compte peuvent créer des états de panier contradictoires.
5. **Retry sur 404** : si le cartId est invalide (expiré dans PS), le store recrée un panier silencieusement — peut perdre des lignes si la re-création échoue.

---

## Améliorations possibles

- Afficher le prix TTC explicitement sur chaque ligne (actuellement affiché dans le résumé uniquement).
- Gérer les frais de port (appel carrier PS pour calculer le montant).
- Implémenter un lock stock serveur (réservation temporaire) pour éviter les sur-ventes.
- Persister le panier anonyme plus longtemps (cookie avec expiration ou backend).
- Ajouter un indicateur "article bientôt épuisé" si stock < seuil configuré.
