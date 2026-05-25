# Backoffice — Import de fichiers

## Rôle

Assistant de type wizard en 4 étapes permettant d'importer en masse des produits, des déclinaisons et des commandes depuis des fichiers CSV, accompagnés d'images depuis un fichier ZIP. L'import est tout-ou-rien (rollback automatique en cas d'erreur). Les règles de validation sont strictes sur les formats attendus.

---

## Composants / Pages concernés

| Fichier | Rôle |
|---|---|
| `src/views/import/ImportView.vue` | Page wrapper (monte l'assistant) |
| `src/components/import/ImportWizard.vue` | Wizard 4 étapes — orchestrateur principal |
| `src/components/import/FileUploader.vue` | Zone de dépôt/sélection pour un fichier unique |
| `src/components/import/ImportProgress.vue` | Barre de progression animée |
| `src/components/import/ImportLog.vue` | Terminal de logs temps réel |
| `src/components/import/DataPreview.vue` | Prévisualisation des données parsées |

---

## Services utilisés

| Fonction | Fichier | Rôle |
|---|---|---|
| `parseCsvFile(file)` | `src/services/import/csvImportService.js` | Parse un fichier CSV → { headers, rows } |
| `loadMappingHistory(headers)` | `src/services/import/csvImportService.js` | Charge le mapping colonnes mémorisé |
| `saveMappingHistory(headers, mapping)` | `src/services/import/csvImportService.js` | Sauvegarde le mapping en localStorage |
| `runImport(files, callbacks)` | `src/services/import/importService.js` | Orchestrateur de l'import complet |

---

## Routes

| Path | Name | Meta |
|---|---|---|
| `/import` | `import` | `requiresAuth: true` |

---

## Appels API (via importService)

L'import s'effectue en plusieurs phases internes au service `runImport` :

```
Phase 1 — Validation
  ├── Vérification des en-têtes CSV (correspondance exacte attendue)
  ├── Vérification des formats (dates DD/MM/YYYY, montants > 0)
  └── Si erreur : throw → rollback total, logs d'erreur

Phase 2 — Produits
  └── Pour chaque ligne CSV produits :
        POST /api/products (WebService PS)
        POST /api/images/products/{id} (upload image depuis ZIP)

Phase 3 — Déclinaisons
  └── Pour chaque ligne CSV déclinaisons :
        POST /api/combinations
        POST /api/stock_availables

Phase 4 — Commandes / Clients
  └── Pour chaque ligne CSV commandes :
        POST /api/customers (si nouveau client)
        POST /api/addresses
        POST /api/carts
        POST /api/orders
        POST /api/order_details

Callbacks exposés :
  onStepStart(step, label)
  onProgress(step, processed, total)
  onStepDone(step, results)
  onLog(message, level)
  onRollback(step, reason)
```

---

## Logique métier

### Store Pinia `useImportStore()`

```js
state = {
  files: {
    fichier1: null,    // CSV produits
    fichier2: null,    // CSV déclinaisons
    fichier3: null,    // CSV commandes
    images: null       // ZIP images
  },
  progress: {
    currentStep: '',
    currentItem: '',
    percentage: 0,
    totalItems: 0,
    processedItems: 0
  },
  logs: [],            // { message, level, ts }[]
  status: 'idle',      // 'idle' | 'loading' | 'rolling_back' | 'success' | 'error'
  results: {
    products: 0,
    combinations: 0,
    images: 0,
    customers: 0,
    orders: 0
  }
}
```

### Les 4 étapes du wizard

#### Étape 1 — Upload

```
Affiche 4 composants FileUploader :
  [fichier1] CSV Produits
  [fichier2] CSV Déclinaisons
  [fichier3] CSV Commandes
  [images]   ZIP Images

allFilesSelected (computed) :
  = fichier1 && fichier2 && fichier3 && images
  → active le bouton "Suivant"
```

#### Étape 2 — Prévisualisation

```
parseCsvFiles() :
  ├── csvImportService.parseCsvFile(fichier1) → previewProducts
  ├── csvImportService.parseCsvFile(fichier2) → previewVariants
  └── csvImportService.parseCsvFile(fichier3) → previewOrders

DataPreview affiche :
  - En-têtes détectés
  - Première ligne de données
  - Nombre de lignes total

Bouton "Lancer l'import" → Étape 3
```

#### Étape 3 — Importation

```
runImport(files, {
  onStepStart  → importStore.updateProgress(step, 0, total)
  onProgress   → importStore.updateProgress(step, processed, total)
  onStepDone   → importStore.results[step] = count
  onLog        → importStore.addLog(message, level)
  onRollback   → importStore.status = 'rolling_back'
})

Affiche :
  - ImportProgress : barre indigo animée + pourcentage
  - ImportLog : terminal sombre avec logs couleur
  - Bannière "Rollback en cours" si erreur
```

#### Étape 4 — Résultat

```
Si succès (status = 'success') :
  - Icône SVG check indigo (52px)
  - Cards résumé : produits / déclinaisons / images / clients / commandes
  - Bouton "Nouvel import"

Si erreur (status = 'error') :
  - Icône SVG X rouge (52px)
  - Message d'erreur
  - Logs complets accessibles
  - Bouton "Réessayer"
```

### `parseCsvFile(file)` — csvImportService

```js
// Utilise PapaParse
const result = Papa.parse(file, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim()
})
// Filtre les lignes entièrement vides
// Retourne { headers: string[], rows: Record<string, string>[] }
```

### Mémorisation du mapping colonnes

```js
buildHeadersKey(headers)   // sha ou join des headers → clé unique
loadMappingHistory(headers) // localStorage → mapping précédent pour ces en-têtes
saveMappingHistory(headers, mapping) // sauvegarde après import réussi
```

---

## Règles de validation CSV (critiques)

| Règle | Détail |
|---|---|
| En-têtes exacts | Les colonnes CSV doivent correspondre exactement aux attendus |
| Dates format DD/MM/YYYY | Toute autre format est rejeté |
| Montants > 0 | Prix et totaux doivent être strictement positifs |
| Mono-déclinaison | Un produit ne peut avoir qu'un seul niveau de déclinaison |
| Tout-ou-rien | Si une ligne échoue, tout l'import est annulé (rollback) |

---

## Composant FileUploader

**Props** : `label`, `accept` (MIME), `modelValue` (fichier sélectionné)

**Emits** : `update:modelValue`

**États visuels** :
- Défaut : bordure pointillée + icône upload
- Sélectionné : bordure verte solide + icône check + nom du fichier
- Drag & drop supporté

---

## Composant ImportLog

**Affichage terminal** :
- Fond sombre (`#0f172a`), police monospace
- Colonnes grille : horodatage | message
- Couleurs : `info` (slate), `success` (vert `#34d399`), `error` (rouge `#f87171`)
- Badge indigo avec le nombre de lignes

---

## Dépendances importantes

- **PapaParse** : bibliothèque de parsing CSV (seule dépendance externe ajoutée pour l'import)
- **JSZip** (ou équivalent) : extraction des images depuis le ZIP
- Variables d'environnement : `VITE_PRESTASHOP_API_BASE_URL` + `VITE_PRESTASHOP_API_KEY` requis
- Le rollback dépend du maintien en mémoire des IDs créés — si le processus est interrompu brutalement (fermeture onglet), le rollback ne s'exécute pas

---

## Points critiques

1. **Tout-ou-rien strict** : la moindre erreur sur une ligne de CSV déclenche l'annulation complète. Sur de grands fichiers, cela peut être frustrant.
2. **Rollback en mémoire** : les IDs à supprimer lors du rollback sont gardés en RAM. Un crash navigateur pendant l'import laissera des données partielles dans PS.
3. **Limite de taille** : pas de limite explicite sur la taille des fichiers CSV/ZIP — de très grands imports peuvent saturer la mémoire du navigateur.
4. **Séquentiel** : l'import est mono-thread, ligne par ligne. Aucun batch ou parallélisme.
5. **Mapping memorisé** : si les en-têtes CSV changent légèrement, l'ancien mapping peut être invalide silencieusement.

---

## Améliorations possibles

- Ajouter un mode "import partiel" qui continue même en cas d'erreur sur quelques lignes (avec rapport des lignes ignorées).
- Implémenter un rollback persistant (écrire les IDs créés dans localStorage dès leur création).
- Afficher une progression par pourcentage précis plutôt qu'un compteur ligne/ligne.
- Permettre l'import uniquement de certains types (produits seuls, sans commandes).
- Valider le format des fichiers avant même de lancer le parsing (vérification MIME + extension).
