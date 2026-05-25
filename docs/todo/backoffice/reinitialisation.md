# Backoffice — Réinitialisation des données

## Rôle

Supprime l'ensemble des données importées dans PrestaShop (produits, commandes, clients, stocks, etc.) afin de remettre la boutique dans un état propre. L'opération est irréversible, séquentielle, et s'exécute étape par étape avec suivi de progression en temps réel. Protège certains éléments système (catégories racine, devises, langues, transporteurs) contre la suppression.

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/reset/ResetView.vue` | Page unique — machine à états avec 4 phases |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `runReset({ callbacks })` | `src/services/reset/importResetService.js` | Orchestrateur de la suppression étape par étape |

Le service expose aussi `cancel()` pour interrompre l'opération en cours.

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/reset` | `reset` | `requiresAuth: true`, `permission: 'products'` |

La permission `products` est vérifiée par `authGuard` — seul un admin avec accès aux produits peut accéder à cette page.

---

## Appels API

Le service `runReset` orchestre les suppressions dans l'ordre suivant :

```
RESET_STEPS (ordre fixe) :
  1. Imports (métadonnées d'import)
  2. Commandes (ps_orders + ps_order_detail)
  3. Paniers (ps_cart + lignes)
  4. Produits (ps_product + images)
  5. Déclinaisons (ps_product_attribute)
  6. Clients (ps_customer, sauf ID=35 anonyme)
  7. Adresses (ps_address)
  8. Taxes (ps_tax_rule, sauf valeurs système)
  9. Attributs (ps_attribute_group + ps_attribute)

Callbacks exposés :
  onStepStart(stepKey, stepLabel)
  onStepProgress(stepKey, processed, total)
  onStepDone(stepKey, { deleted, errors })
  onLog(message, level)   // level: 'info' | 'success' | 'error'
```

---

## Logique métier

### Machine à états (`phase`)

```
'idle'    → Affiche la liste des entités à supprimer + bouton "Lancer la réinitialisation"
'confirm' → Modal de confirmation (avertissement irréversible)
'running' → Exécution en cours — 3 panneaux : progression globale + étapes + logs
'done'    → Résumé des suppressions avec tableau récapitulatif + logs complets
```

### Refs déclarées dans `<script setup>`

```js
const phase            = ref('idle')
const currentStep      = ref('')        // clé de l'étape en cours
const currentStepIndex = ref(0)         // index (0..N-1) pour la barre globale
const currentProgress  = ref(0)         // progression dans l'étape (0-100)
const stepHistory      = ref([])        // { key, label, deleted, errors, done }[]
const logs             = ref([])        // { message, level, ts }[] (max 500)
const logContainer     = ref(null)      // ref DOM pour auto-scroll
```

### Computed

```js
totalDeleted    // Σ(stepHistory[].deleted)
totalErrors     // Σ(stepHistory[].errors)
globalPercent   // (currentStepIndex / RESET_STEPS.length) × 100
stepProgressPercent // currentProgress (0-100, fourni par onStepProgress)
```

### `addLog(message, level)`

```js
// Limite à 500 entrées (évite la saturation mémoire)
if (logs.value.length >= 500) logs.value.shift()
logs.value.push({ message, level, ts: Date.now() })
```

### `handleStart()`

```
phase = 'confirm'
```

### `handleConfirmCancel()`

```
phase = 'idle'
```

### `handleRunReset()`

```
phase = 'running'
stepHistory = []
logs = []

const { execute } = runReset({
  onStepStart(key, label) {
    currentStep = key
    currentStepIndex = RESET_STEPS.findIndex(s => s.key === key)
    currentProgress = 0
    stepHistory.push({ key, label, deleted: 0, errors: 0, done: false })
  },
  onStepProgress(key, processed, total) {
    currentProgress = Math.round((processed / total) × 100)
    // Met à jour les compteurs dans stepHistory[key]
  },
  onStepDone(key, { deleted, errors }) {
    // Marque l'étape done=true dans stepHistory
    // Incrémente totalDeleted / totalErrors
  },
  onLog(message, level) {
    addLog(message, level)
  }
})

await execute()
phase = 'done'
```

### `handleCancel()`

```
cancel()     // interrompt l'exécution du service
phase = 'idle'
```

### Watch logs

```js
watch(logs, () => {
  nextTick(() => logContainer.scrollTop = logContainer.scrollHeight)
}, { deep: true })
```

### Protections intégrées dans le service

| Entité | Protection |
|---|---|
| Client ID=35 | Jamais supprimé (compte anonyme GDPR) |
| Catégorie racine (ID=1,2) | Préservée |
| Devises, langues, pays | Non touchés |
| Transporteurs système | Non touchés |
| Taxes système | Non touchées |

---

## Affichage durant l'exécution (`running`)

**Panneau 1 — Progression globale**
- Barre de progression : `globalPercent`%
- Étape en cours : `currentStep` label

**Panneau 2 — Historique des étapes**
- Tableau avec : étape, statut (✓/en cours/en attente), supprimés, erreurs

**Panneau 3 — Logs temps réel**
- Terminal sombre, police monospace
- Couleurs : info (slate), success (vert), error (rouge)
- Auto-scroll activé

---

## Affichage après exécution (`done`)

- Tableau récapitulatif : étape · supprimés · erreurs
- Totaux globaux
- Accès aux logs complets
- Bouton retour vers l'accueil

---

## Dépendances importantes

- Permission `products` requise dans les métadonnées de route — l'accès non autorisé est redirigé vers `/dashboard?forbidden=1`
- `RESET_STEPS` est une constante figée dans le service — l'ordre des suppressions est intentionnel (dépendances FK : commandes avant produits, etc.)
- Le service expose `{ execute, cancel }` — `cancel` doit être appelé **avant** `execute()` complète pour avoir un effet

---

## Points critiques

1. **Irréversible** : aucun rollback après confirmation. Une fois lancé, les données supprimées ne peuvent pas être restaurées sans sauvegarde externe.
2. **Pas de sauvegarde automatique** : l'application ne propose pas d'export avant la réinitialisation.
3. **Protection ID=35** : le client anonyme (utilisé pour le front-office) n'est jamais supprimé — critical pour le fonctionnement du front-office post-reset.
4. **Dépendance FK PS** : l'ordre des suppressions est critique. Supprimer les produits avant les commandes casserait les contraintes de clés étrangères PS.
5. **Logs limités à 500** : sur une boutique avec beaucoup de données, les premiers logs peuvent être perdus.
6. **Pas de test à blanc** : l'ancienne version avait un "dry-run" — vérifier si le service actuel le supporte encore.

---

## Améliorations possibles

- Ajouter un export CSV de toutes les données avant réinitialisation.
- Implémenter un mode "dry-run" qui simule la suppression sans l'exécuter.
- Permettre une réinitialisation sélective (seulement les commandes, seulement les produits, etc.).
- Augmenter la limite de logs (500 → configurable) ou implémenter une pagination des logs.
- Ajouter une confirmation en deux étapes (saisie manuelle de "RESET" dans un champ texte) pour éviter les clics accidentels.
