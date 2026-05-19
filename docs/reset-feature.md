# Fonctionnalité de réinitialisation des données

Ce document décrit le fonctionnement de la fonctionnalité de réinitialisation via l'API Webservice PrestaShop. Le système utilise uniquement des appels HTTP sur l'API (pas d'accès SQL ni filesystem).

## Vue d'ensemble

La page `/reset` prépare la base PrestaShop pour un import complet à partir des 3 fichiers CSV. La logique a été simplifiée :

- **Plus de choix d'entités** : la liste est figée, basée sur ce que les CSV vont écrire.
- **Plus de bouton "Dry run" séparé** : l'analyse se lance automatiquement à l'ouverture de la page.
- **Confirmation explicite** : la suppression réelle nécessite un clic sur "Confirmer la réinitialisation".
- **Données système PrestaShop préservées** : employés, langues, devises, taxes, transporteurs, configurations, groupes, états de commande, modules, et catégories Root (id=1) + Home (id=2).

## Modules

- `apiClient.js` : communication HTTP avec l'API PrestaShop (listResourceIds, deleteResourceItem).
- `batchProcessor.js` : suppression par batch, concurrence, retries, annulation.
- `importResetService.js` : **nouveau** — orchestrateur dédié à la préparation d'import, avec liste figée et IDs protégés.
- `ResetView.vue` : interface, dry-run automatique, bouton Confirmer, logs et progression.

Les modules `resourceDiscovery.js`, `dependencyResolver.js`, `resetOrchestrator.js` (ancienne orchestration) restent disponibles mais ne sont plus utilisés par `/reset`.

## Étapes de fonctionnement

### 1) Ouverture de la page → dry-run automatique

Au `onMounted()`, `ResetView` appelle `orchestrator.buildPlan(settings)` qui :

1. Itère sur la liste figée `IMPORT_RESET_RESOURCES` (22 ressources).
2. Pour chaque ressource, appelle `GET /ps/api/{resource}?display=[id]&limit=offset,taille` pour lister les IDs.
3. Filtre les IDs protégés (catégories id ≤ 2).
4. Construit le plan : `idsByResource`, `counts`, `skippedByResource`, `total`, `errors`.

L'utilisateur voit alors le détail entité par entité avec :
- Nombre d'éléments à supprimer
- Nombre d'éléments protégés (badge vert)
- Total agrégé

### 2) Confirmation et exécution

L'utilisateur clique sur **"Confirmer la réinitialisation"**.

L'orchestrateur exécute la suppression dans l'ordre figé (FK-safe) :

```
order_histories → order_cart_rules → order_carriers → order_invoices
→ order_payments → order_details → orders → carts
→ addresses → customer_messages → customer_threads → customers
→ images → stock_availables → combinations
→ product_option_values → product_options
→ specific_prices → product_suppliers → product_feature_values
→ products → categories (sauf id ≤ 2)
```

Chaque ressource est traitée par `batchProcessor` :
- IDs découpés en lots (`batchSize`, défaut 25)
- Suppression `DELETE /ps/api/{resource}/{id}` avec concurrence (défaut 4)
- Retries automatiques en cas d'échec (défaut 2)
- Progression mise à jour en temps réel

### 3) Boutons disponibles

| Bouton | Action |
|--------|--------|
| Confirmer la réinitialisation | Lance la suppression (actif uniquement si plan prêt) |
| Relancer l'analyse | Réinitialise les logs et relance le dry-run |
| Annuler | Arrête la suppression en cours |

## Liste figée des entités

Définie dans `importResetService.js` → constante `IMPORT_RESET_RESOURCES`. Cette liste est calquée sur ce que les 3 CSV vont écrire :

| CSV | Impacte |
|-----|---------|
| Fichier 1 (produits) | `products`, `categories`, `images` |
| Fichier 2 (déclinaisons) | `combinations`, `product_options`, `product_option_values`, `stock_availables` |
| Fichier 3 (commandes) | `customers`, `addresses`, `orders`, `order_details`, `order_histories`, `carts` |

Les ressources liées (FK satellites) sont aussi vidées pour éviter les orphelins : `order_carriers`, `order_payments`, `order_invoices`, `order_cart_rules`, `customer_messages`, `customer_threads`, `specific_prices`, `product_suppliers`, `product_feature_values`.

## IDs protégés

Définis dans `importResetService.js` → constante `PROTECTED_IDS`.

```javascript
PROTECTED_IDS = {
  categories: new Set(['1', '2']),  // Root + Home
}
```

Ces IDs sont filtrés du plan : ils ne sont **jamais** envoyés en DELETE. Ils apparaissent dans l'UI avec un badge vert "protégé(s)".

## Données système jamais touchées

Les ressources suivantes ne figurent pas dans `IMPORT_RESET_RESOURCES` et restent intactes :

- `employees` (admins)
- `configurations`
- `languages`, `currencies`, `countries`, `zones`, `states`
- `carriers`, `manufacturers`, `suppliers`
- `groups` (groupes clients par défaut)
- `order_states` (états de commande de référence)
- `tax_rule_groups`, `taxes`, `tax_rules` (configs admin)
- `modules`, `hooks`, `shops`, `shop_groups`

## Tester rapidement

1. `npm run dev` dans `newApp/`
2. Se logger dans l'app
3. Ouvrir `/reset` → l'analyse démarre automatiquement
4. Vérifier les counts par entité
5. Cliquer sur "Confirmer la réinitialisation"
6. Suivre la progression dans le terminal

## Points d'attention

- Si une ressource n'existe pas (API), elle est ignorée et un warning est logué.
- Les images PrestaShop peuvent nécessiter un endpoint spécifique selon la version.
- La pagination des IDs est gérée automatiquement (`pageSize`, défaut 200).
- L'API est appelée via `/ps/api` (proxy Vite) pour éviter les problèmes CORS.
- En cas d'erreur sur une entité, le reset continue avec les suivantes ; les échecs sont visibles dans la barre de progression (`X échec(s)`).
