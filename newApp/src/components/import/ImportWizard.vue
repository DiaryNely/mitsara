<template>
  <div class="import-wizard">

    <!-- ── En-tête ── -->
    <div class="wizard-header">
      <div class="wizard-header-icon">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 3v11M7.5 10l3.5 4 3.5-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 17h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="wizard-header-text">
        <h2>Import des données</h2>
        <p>Suivez les étapes pour importer les produits, déclinaisons, images et commandes</p>
      </div>
    </div>

    <!-- ── Stepper ── -->
    <div class="wizard-stepper">
      <div
        v-for="(step, index) in steps"
        :key="step.id"
        class="wstep"
        :class="{ 'wstep--active': currentStep === step.id, 'wstep--done': step.completed }"
      >
        <div class="wstep-bullet">
          <svg v-if="step.completed" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 6.5l3 3 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span v-else>{{ index + 1 }}</span>
        </div>
        <span class="wstep-label">{{ step.label }}</span>
      </div>
    </div>

    <!-- ── Corps ── -->
    <div class="wizard-body">

      <!-- Étape 1 : Upload -->
      <div v-if="currentStep === 'upload'" class="step-content">
        <div class="step-intro">
          <h3>Téléchargez les fichiers</h3>
          <p>Sélectionnez les 3 fichiers CSV et l'archive ZIP des images.</p>
        </div>

        <div class="uploads-grid">
          <FileUploader
            title="Fichier 1 - Produits"
            accept=".csv"
            @file-selected="files.fichier1 = $event"
          />
          <FileUploader
            title="Fichier 2 - Déclinaisons"
            accept=".csv"
            @file-selected="files.fichier2 = $event"
          />
          <FileUploader
            title="Fichier 3 - Commandes"
            accept=".csv"
            @file-selected="files.fichier3 = $event"
          />
          <FileUploader
            title="Images ZIP"
            accept=".zip"
            @file-selected="files.images = $event"
          />
        </div>

        <div class="step-actions">
          <button class="btn btn--primary" type="button" :disabled="!allFilesSelected" @click="startImport">
            Suivant
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2.5 6.5h8M7 3.5l3 3-3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Étape 2 : Aperçu -->
      <div v-if="currentStep === 'preview'" class="step-content">
        <div class="step-intro">
          <h3>Aperçu des données</h3>
          <p>Vérifiez les données avant de lancer l'import.</p>
        </div>

        <DataPreview
          :products="previewProducts"
          :variants="previewVariants"
          :orders="previewOrders"
        />

        <div class="step-actions">
          <button class="btn btn--ghost" type="button" @click="goBack">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M10.5 6.5h-8M6 3.5L3 6.5l3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Précédent
          </button>
          <button class="btn btn--success" type="button" @click="runImport">
            Confirmer l'import
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Étape 3 : Import en cours -->
      <div v-if="currentStep === 'importing'" class="step-content">
        <div class="step-intro">
          <h3>Import en cours…</h3>
          <p>Veuillez patienter pendant le traitement des données.</p>
        </div>

        <div v-if="importStore.status === 'rolling_back'" class="rollback-banner">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8A5 5 0 014.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M3 4.5v3.5H6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Rollback automatique en cours — annulation des données créées...
        </div>

        <ImportProgress :progress="importStore.progress" />
        <ImportLog :logs="importStore.logs" />
      </div>

      <!-- Étape 4 : Résultat -->
      <div v-if="currentStep === 'result'" class="step-content">

        <div v-if="importStore.status === 'success'" class="result-panel result-panel--success">
          <div class="result-icon">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="23" stroke="currentColor" stroke-width="2.5"/>
              <path d="M15 26l8 8 14-14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="result-title">Import terminé avec succès !</p>
          <div class="result-stats">
            <div class="result-stat">
              <span class="result-stat-emoji">📦</span>
              <span class="result-stat-value">{{ importStore.results.products }}</span>
              <span class="result-stat-label">Produits</span>
            </div>
            <div class="result-stat">
              <span class="result-stat-emoji">🎨</span>
              <span class="result-stat-value">{{ importStore.results.combinations }}</span>
              <span class="result-stat-label">Déclinaisons</span>
            </div>
            <div class="result-stat">
              <span class="result-stat-emoji">🖼️</span>
              <span class="result-stat-value">{{ importStore.results.images }}</span>
              <span class="result-stat-label">Images</span>
            </div>
            <div class="result-stat">
              <span class="result-stat-emoji">👥</span>
              <span class="result-stat-value">{{ importStore.results.customers }}</span>
              <span class="result-stat-label">Clients</span>
            </div>
            <div class="result-stat">
              <span class="result-stat-emoji">📋</span>
              <span class="result-stat-value">{{ importStore.results.orders }}</span>
              <span class="result-stat-label">Commandes</span>
            </div>
          </div>
        </div>

        <div v-else class="result-panel result-panel--error">
          <div class="result-icon">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="23" stroke="currentColor" stroke-width="2.5"/>
              <path d="M18 18l20 20M38 18L18 38" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="result-title">Import annulé — rollback effectué</p>
          <p class="rollback-info">Toutes les données créées ont été supprimées automatiquement. Aucune insertion partielle n'a été conservée.</p>
          <ImportLog :logs="importStore.logs" />
        </div>

        <div class="step-actions">
          <button class="btn btn--ghost" type="button" @click="resetImport">
            Nouvel import
          </button>
          <button v-if="importStore.status === 'success'" class="btn btn--primary" type="button" @click="$router.push('/orders')">
            Voir les commandes
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2.5 6.5h8M7 3.5l3 3-3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useImportStore } from '../../stores/import'
import FileUploader from './FileUploader.vue'
import ImportProgress from './ImportProgress.vue'
import ImportLog from './ImportLog.vue'
import DataPreview from './DataPreview.vue'
import { parseFichier1, parseFichier2, parseFichier3 } from '../../services/import/csvParser'
import { runTransactionalImport } from '../../api/import'

const router = useRouter()
const importStore = useImportStore()
const logImport = (message, type) => importStore.addLog(message, type)

const files = reactive({
  fichier1: null,
  fichier2: null,
  fichier3: null,
  images: null
})

// Cache des contenus CSV lus une seule fois (réutilisés en preview ET en import).
const csvContents = reactive({
  fichier1: null,
  fichier2: null,
  fichier3: null,
})

const currentStep = ref('upload')
const previewProducts = ref([])
const previewVariants = ref([])
const previewOrders = ref([])

const steps = ref([
  { id: 'upload', label: 'Upload', completed: false },
  { id: 'preview', label: 'Aperçu', completed: false },
  { id: 'importing', label: 'Import', completed: false },
  { id: 'result', label: 'Résultat', completed: false }
])

const allFilesSelected = computed(() => {
  return files.fichier1 && files.fichier2 && files.fichier3 && files.images
})

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible'))
    reader.readAsText(file)
  })

const startImport = async () => {
  // Lecture parallèle, mise en cache pour réutilisation à l'import (évite la double lecture).
  const [content1, content2, content3] = await Promise.all([
    readFileAsText(files.fichier1),
    readFileAsText(files.fichier2),
    readFileAsText(files.fichier3),
  ])

  csvContents.fichier1 = content1
  csvContents.fichier2 = content2
  csvContents.fichier3 = content3

  previewProducts.value = parseFichier1(content1)
  previewVariants.value = parseFichier2(content2)
  previewOrders.value = parseFichier3(content3)

  steps.value[0].completed = true
  currentStep.value = 'preview'
}

const runImport = async () => {
  currentStep.value = 'importing'
  importStore.status = 'loading'
  importStore.clearLogs()

  // Réutilise le contenu déjà lu en phase preview ; relit uniquement si vidé.
  const ensureContent = async (cacheKey, fileKey) => {
    if (csvContents[cacheKey] != null) return csvContents[cacheKey]
    const content = await readFileAsText(files[fileKey])
    csvContents[cacheKey] = content
    return content
  }

  const [csvProduits, csvDeclinaisons, csvCommandes] = await Promise.all([
    ensureContent('fichier1', 'fichier1'),
    ensureContent('fichier2', 'fichier2'),
    ensureContent('fichier3', 'fichier3'),
  ])

  const onProgress = (step, item, processed, total) => {
    if (step === 'rollback') {
      importStore.status = 'rolling_back'
    }
    importStore.updateProgress(step, item, processed, total)
  }

  try {
    const results = await runTransactionalImport(
      { csvProduits, csvDeclinaisons, csvCommandes, zipImages: files.images },
      onProgress,
      logImport
    )

    importStore.results.products = results.products
    importStore.results.combinations = results.combinations
    importStore.results.images = results.images
    importStore.results.customers = results.customers
    importStore.results.orders = results.orders

    importStore.status = 'success'
    steps.value[2].completed = true
    currentStep.value = 'result'

  } catch (error) {
    importStore.status = 'error'
    if (!error.__logged) {
      importStore.addLog(`❌ ${error.message}`, 'error')
    }
    currentStep.value = 'result'
  }
}

const goBack = () => {
  steps.value[1].completed = false
  currentStep.value = 'upload'
}

const resetImport = () => {
  importStore.resetState()
  files.fichier1 = null
  files.fichier2 = null
  files.fichier3 = null
  files.images = null
  csvContents.fichier1 = null
  csvContents.fichier2 = null
  csvContents.fichier3 = null
  steps.value.forEach(step => step.completed = false)
  currentStep.value = 'upload'
}
</script>

<style scoped>
/* ── Wizard shell ─────────────────────────────────── */
.import-wizard {
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

/* ── En-tête ──────────────────────────────────────── */
.wizard-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border-light);
}

.wizard-header-icon {
  width: 44px;
  height: 44px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.wizard-header-text h2 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 3px;
}

.wizard-header-text p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

/* ── Stepper ──────────────────────────────────────── */
.wizard-stepper {
  display: flex;
  align-items: stretch;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0 8px;
}

.wstep {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  position: relative;
  transition: color var(--transition-fast);
}

.wstep + .wstep::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 20px;
  background: var(--border);
}

.wstep--active {
  color: var(--accent);
}

.wstep--done {
  color: var(--success);
}

.wstep-bullet {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--border-light);
  color: var(--text-muted);
  border: 1.5px solid var(--border);
  transition: all var(--transition-fast);
}

.wstep--active .wstep-bullet {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent);
}

.wstep--done .wstep-bullet {
  background: var(--success);
  color: white;
  border-color: var(--success);
}

.wstep-label {
  font-weight: 600;
}

/* ── Corps ────────────────────────────────────────── */
.wizard-body {
  background: var(--surface);
  padding: 28px;
  flex: 1;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.step-intro h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
}

.step-intro p {
  font-size: 13.5px;
  color: var(--text-muted);
  margin: 0;
}

/* ── Upload grid ──────────────────────────────────── */
.uploads-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

/* ── Actions ──────────────────────────────────────── */
.step-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--border-light);
}

/* ── Boutons ──────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 18px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 600;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
}

.btn--primary {
  background: var(--accent);
  color: white;
  box-shadow: 0 2px 10px rgba(99,102,241,.3);
}

.btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
  box-shadow: 0 4px 14px rgba(99,102,241,.4);
}

.btn--ghost {
  background: var(--bg);
  color: var(--text-secondary);
  border-color: var(--border);
}

.btn--ghost:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent);
}

.btn--success {
  background: var(--success);
  color: white;
  box-shadow: 0 2px 10px rgba(16,185,129,.28);
}

.btn--success:hover:not(:disabled) {
  filter: brightness(1.08);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Rollback banner ──────────────────────────────── */
.rollback-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(245,158,11,.08);
  border: 1px solid rgba(245,158,11,.28);
  border-radius: var(--radius-md);
  color: #b45309;
  font-size: 13.5px;
  font-weight: 600;
  padding: 12px 16px;
}

.rollback-info {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

/* ── Résultat ─────────────────────────────────────── */
.result-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 36px 28px;
  border-radius: var(--radius-lg);
  text-align: center;
}

.result-panel--success {
  background: rgba(16,185,129,.05);
  border: 1px solid rgba(16,185,129,.18);
  color: var(--success);
}

.result-panel--error {
  background: rgba(239,68,68,.05);
  border: 1px solid rgba(239,68,68,.18);
  color: var(--danger);
  align-items: stretch;
  text-align: left;
}

.result-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
}

.result-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}

.result-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid rgba(16,185,129,.15);
  border-radius: var(--radius-lg);
  min-width: 90px;
}

.result-stat-emoji {
  font-size: 22px;
}

.result-stat-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--success);
  letter-spacing: -0.03em;
  line-height: 1;
}

.result-stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@media (max-width: 768px) {
  .uploads-grid { grid-template-columns: 1fr; }
  .wizard-stepper { padding: 0; }
  .wstep { padding: 12px 14px; font-size: 12px; }
  .wizard-body { padding: 20px 16px; }
  .wizard-header { padding: 18px 16px; }
  .result-stats { gap: 8px; }
}
</style>
