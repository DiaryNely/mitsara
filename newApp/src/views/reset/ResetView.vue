<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RESET_STEPS, runReset } from '../../services/reset/importResetService'

// ─── État ──────────────────────────────────────────────────────────────────────
// phase : 'idle' | 'confirm' | 'running' | 'done'
const phase = ref('idle')
const currentStep = ref(null)       // { key, label } de l'étape en cours
const currentStepIndex = ref(-1)
const currentProgress = ref({ done: 0, total: 0 })
const stepHistory = ref([])         // résultats des étapes terminées
const logs = ref([])
const logContainer = ref(null)

let cancelFn = null

// ─── Calculés ──────────────────────────────────────────────────────────────────
const totalDeleted = computed(() => stepHistory.value.reduce((s, r) => s + (r.deleted || 0), 0))
const totalErrors  = computed(() => stepHistory.value.reduce((s, r) => s + (r.errors  || 0), 0))

const globalPercent = computed(() => {
  const done = currentStepIndex.value + 1
  return Math.min(100, Math.round((done / RESET_STEPS.length) * 100))
})

const stepProgressPercent = computed(() => {
  const { done, total } = currentProgress.value
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
})

// ─── Logs ──────────────────────────────────────────────────────────────────────
const addLog = (message, level = 'info') => {
  logs.value.push({ message, level, time: new Date().toISOString() })
  if (logs.value.length > 500) logs.value.shift()
}

watch(logs, async () => {
  await nextTick()
  if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight
}, { deep: true })

// ─── Transitions ───────────────────────────────────────────────────────────────
const handleStart = () => {
  phase.value = 'confirm'
}

const handleConfirmCancel = () => {
  phase.value = 'idle'
}

const handleRunReset = async () => {
  phase.value = 'running'
  currentStep.value = null
  currentStepIndex.value = -1
  currentProgress.value = { done: 0, total: 0 }
  stepHistory.value = []
  logs.value = []

  const { execute, cancel } = await runReset({
    onStepStart: (step, index) => {
      currentStep.value = step
      currentStepIndex.value = index
      currentProgress.value = { done: 0, total: 0 }
    },
    onStepProgress: (_step, done, total) => {
      currentProgress.value = { done, total }
    },
    onStepDone: (result) => {
      stepHistory.value.push(result)
    },
    onLog: addLog,
  })

  cancelFn = cancel

  await execute()
  phase.value = 'done'
}

const handleCancel = () => {
  cancelFn?.()
}

const handleBack = () => {
  phase.value = 'idle'
}
</script>

<template>
  <div class="reset-page animate-fade-in">

    <!-- ── IDLE ──────────────────────────────────────────────────────────── -->
    <template v-if="phase === 'idle'">
      <div class="reset-hero">
        <div class="reset-hero-text">
          <span class="reset-eyebrow">Reset Engine</span>
          <h1 class="reset-title">Réinitialisation des données</h1>
          <p class="reset-subtitle">
            Supprime les données de la boutique PrestaShop dans un ordre sécurisé,
            sans toucher aux configurations système (langues, devises, taxes, transporteurs, catégories racines).
          </p>
        </div>
      </div>

      <div class="danger-zone">
        <div class="danger-header">
          <span class="danger-icon">⚠️</span>
          <div>
            <h2>Zone de danger</h2>
            <p>Cette opération est <strong>irréversible</strong>. Les entités suivantes seront supprimées :</p>
          </div>
        </div>

        <ul class="entity-list">
          <li v-for="step in RESET_STEPS" :key="step.key">
            <span class="entity-dot"></span>
            {{ step.label }}
          </li>
        </ul>

        <div class="danger-actions">
          <button class="btn btn--danger" @click="handleStart">
            Réinitialiser toutes les données
          </button>
        </div>
      </div>
    </template>

    <!-- ── CONFIRM ───────────────────────────────────────────────────────── -->
    <template v-else-if="phase === 'confirm'">
      <div class="confirm-overlay">
        <div class="confirm-box">
          <h2 class="confirm-title">Êtes-vous sûr ?</h2>
          <p class="confirm-message">
            Cette action supprimera <strong>toutes les commandes, produits, clients et données associées</strong>.
            Elle est <strong>irréversible</strong> et ne peut pas être annulée.
          </p>
          <div class="confirm-actions">
            <button class="btn btn--ghost" @click="handleConfirmCancel">Annuler</button>
            <button class="btn btn--danger" @click="handleRunReset">Oui, tout supprimer</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ── RUNNING ───────────────────────────────────────────────────────── -->
    <template v-else-if="phase === 'running'">
      <div class="reset-hero">
        <div class="reset-hero-text">
          <span class="reset-eyebrow">En cours</span>
          <h1 class="reset-title">Réinitialisation en cours…</h1>
          <p class="reset-subtitle" v-if="currentStep">
            Étape {{ currentStepIndex + 1 }} / {{ RESET_STEPS.length }} — {{ currentStep.label }}
          </p>
        </div>
        <button class="btn btn--ghost" @click="handleCancel">Annuler</button>
      </div>

      <div class="running-grid">
        <!-- Progression globale -->
        <section class="panel">
          <div class="panel-header">
            <h2>Progression globale</h2>
          </div>
          <div class="panel-body">
            <div class="progress-block">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: globalPercent + '%' }"></div>
              </div>
              <div class="progress-meta">
                <span>{{ currentStepIndex + 1 }} / {{ RESET_STEPS.length }} étapes</span>
                <span>{{ globalPercent }}%</span>
              </div>
            </div>

            <div class="progress-block" v-if="currentStep">
              <p class="progress-label">{{ currentStep.label }}</p>
              <div class="progress-bar">
                <div class="progress-fill progress-fill--step" :style="{ width: stepProgressPercent + '%' }"></div>
              </div>
              <div class="progress-meta">
                <span>{{ currentProgress.done }} / {{ currentProgress.total }}</span>
                <span>{{ stepProgressPercent }}%</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Historique des étapes -->
        <section class="panel">
          <div class="panel-header">
            <h2>Étapes terminées</h2>
          </div>
          <div class="panel-body">
            <div v-if="!stepHistory.length" class="empty-state">
              <p>En attente des premières étapes…</p>
            </div>
            <div class="step-history">
              <div
                v-for="result in stepHistory"
                :key="result.key"
                class="step-result"
                :class="'step-result--' + result.status"
              >
                <span class="step-result-icon">
                  {{ result.status === 'ok' ? '✅' : result.status === 'partial' ? '⚠️' : '❌' }}
                </span>
                <div class="step-result-info">
                  <span class="step-result-label">{{ result.label }}</span>
                  <span class="step-result-detail">
                    {{ result.deleted }} supprimé(s)
                    <span v-if="result.errors"> · {{ result.errors }} erreur(s)</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Logs -->
        <section class="panel panel--logs">
          <div class="panel-header">
            <h2>Journal temps réel</h2>
          </div>
          <div class="panel-body">
            <div ref="logContainer" class="log-terminal">
              <div v-if="!logs.length" class="log-empty">En attente des logs…</div>
              <div v-for="(item, idx) in logs" :key="idx" class="log-row" :class="'log-' + item.level">
                <span class="log-time">{{ item.time.slice(11, 19) }}</span>
                <span class="log-message">{{ item.message }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- ── DONE ──────────────────────────────────────────────────────────── -->
    <template v-else-if="phase === 'done'">
      <div class="reset-hero" :class="totalErrors ? 'reset-hero--warn' : 'reset-hero--success'">
        <div class="reset-hero-text">
          <span class="reset-eyebrow">Terminé</span>
          <h1 class="reset-title">
            {{ totalErrors ? 'Réinitialisation partielle' : 'Réinitialisation terminée' }}
          </h1>
          <p class="reset-subtitle">
            {{ totalDeleted }} élément(s) supprimé(s) au total
            <span v-if="totalErrors"> · {{ totalErrors }} erreur(s)</span>
          </p>
        </div>
        <button class="btn btn--outline" @click="handleBack">Retour</button>
      </div>

      <!-- Résumé par étape -->
      <section class="panel">
        <div class="panel-header">
          <h2>Résultat par étape</h2>
        </div>
        <div class="panel-body">
          <div class="summary-table">
            <div class="summary-row summary-row--header">
              <span>Étape</span>
              <span>Total</span>
              <span>Supprimés</span>
              <span>Erreurs</span>
              <span>Statut</span>
            </div>
            <div
              v-for="result in stepHistory"
              :key="result.key"
              class="summary-row"
              :class="'summary-row--' + result.status"
            >
              <span>{{ result.label }}</span>
              <span>{{ result.total }}</span>
              <span>{{ result.deleted }}</span>
              <span>{{ result.errors }}</span>
              <span class="status-badge" :class="'status-badge--' + result.status">
                {{ result.status === 'ok' ? '✅ OK' : result.status === 'partial' ? '⚠️ Partiel' : '❌ Erreur' }}
              </span>
            </div>
          </div>

          <!-- Message d'erreur si présent -->
          <div v-for="result in stepHistory.filter(r => r.message)" :key="result.key + '-msg'" class="error-block">
            <strong>{{ result.label }}</strong> : {{ result.message }}
          </div>
        </div>
      </section>

      <!-- Logs -->
      <section class="panel panel--logs">
        <div class="panel-header">
          <h2>Journal complet</h2>
        </div>
        <div class="panel-body">
          <div ref="logContainer" class="log-terminal">
            <div v-for="(item, idx) in logs" :key="idx" class="log-row" :class="'log-' + item.level">
              <span class="log-time">{{ item.time.slice(11, 19) }}</span>
              <span class="log-message">{{ item.message }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>

  </div>
</template>

<style scoped>
/* ── Page ─────────────────────────────────────────── */
.reset-page {
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── Hero ─────────────────────────────────────────── */
.reset-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 28px 32px;
  border-radius: var(--radius-xl);
  background: linear-gradient(120deg, rgba(99,102,241,.1) 0%, rgba(139,92,246,.07) 100%);
  border: 1px solid rgba(99,102,241,.18);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}

.reset-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top right, rgba(99,102,241,.12), transparent 55%);
  pointer-events: none;
}

.reset-hero--success {
  background: linear-gradient(120deg, rgba(16,185,129,.1) 0%, rgba(16,185,129,.05) 100%);
  border-color: rgba(16,185,129,.22);
}

.reset-hero--success::before {
  background: radial-gradient(circle at top right, rgba(16,185,129,.1), transparent 55%);
}

.reset-hero--warn {
  background: linear-gradient(120deg, rgba(245,158,11,.1) 0%, rgba(239,68,68,.06) 100%);
  border-color: rgba(245,158,11,.22);
}

.reset-hero-text {
  position: relative;
  z-index: 1;
  max-width: 720px;
}

.reset-eyebrow {
  display: block;
  text-transform: uppercase;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .14em;
  color: var(--accent);
  margin-bottom: 6px;
}

.reset-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
  color: var(--text);
}

.reset-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
}

/* ── Zone de danger ────────────────────────────────── */
.danger-zone {
  background: var(--surface);
  border: 1.5px solid rgba(239,68,68,.28);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.danger-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 20px 24px;
  background: rgba(239,68,68,.03);
  border-bottom: 1px solid rgba(239,68,68,.1);
}

.danger-icon {
  font-size: 26px;
  line-height: 1;
  flex-shrink: 0;
}

.danger-header h2 {
  font-size: 16px;
  font-weight: 700;
  color: var(--danger);
  margin: 0 0 4px;
}

.danger-header p {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin: 0;
}

.entity-list {
  list-style: none;
  padding: 16px 24px;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid rgba(239,68,68,.07);
}

.entity-list li {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.entity-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--danger);
  flex-shrink: 0;
}

.danger-actions {
  display: flex;
  justify-content: flex-end;
  padding: 16px 24px;
}

/* ── Confirmation ─────────────────────────────────── */
.confirm-overlay {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 32px;
}

.confirm-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 36px 32px;
  max-width: 520px;
  width: 100%;
  box-shadow: var(--shadow-xl);
}

.confirm-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 12px;
  color: var(--text);
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.65;
  margin-bottom: 28px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* ── Grille running ────────────────────────────────── */
.running-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.running-grid .panel--logs {
  grid-column: span 2;
}

/* ── Panels ────────────────────────────────────────── */
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.panel-header {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg);
}

.panel-header h2 {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}

.panel-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Progress ──────────────────────────────────────── */
.progress-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.progress-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.progress-bar {
  height: 8px;
  background: var(--border-light);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--info));
  border-radius: var(--radius-full);
  transition: width 220ms ease;
}

.progress-fill--step {
  background: linear-gradient(90deg, #8b5cf6, var(--accent));
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Historique étapes ─────────────────────────────── */
.step-history {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--bg);
  border: 1px solid transparent;
  font-size: 13px;
}

.step-result--ok      { border-color: rgba(16,185,129,.22); }
.step-result--partial { border-color: rgba(245,158,11,.22); }
.step-result--error   { border-color: rgba(239,68,68,.22); }

.step-result-icon { font-size: 15px; }

.step-result-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-result-label  { font-weight: 600; font-size: 13px; }
.step-result-detail { font-size: 11.5px; color: var(--text-muted); }

/* ── Tableau résumé ────────────────────────────────── */
.summary-table {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.summary-row {
  display: grid;
  grid-template-columns: 1fr 80px 100px 80px 120px;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
}

.summary-row--header {
  background: var(--bg);
  font-weight: 700;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--text-muted);
}

.summary-row--ok      { background: rgba(16,185,129,.05); }
.summary-row--partial { background: rgba(245,158,11,.05); }
.summary-row--error   { background: rgba(239,68,68,.05); }

.status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: var(--radius-full);
}

.status-badge--ok      { background: rgba(16,185,129,.12); color: var(--success); }
.status-badge--partial { background: rgba(245,158,11,.12); color: var(--warning); }
.status-badge--error   { background: rgba(239,68,68,.12);  color: var(--danger); }

.error-block {
  padding: 10px 14px;
  background: rgba(239,68,68,.05);
  border: 1px solid rgba(239,68,68,.15);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--danger);
}

/* ── Boutons ───────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  position: relative;
  z-index: 1;
  white-space: nowrap;
}

.btn--danger {
  background: var(--danger);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 14px rgba(239,68,68,.28);
}

.btn--danger:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 6px 18px rgba(239,68,68,.38);
}

.btn--ghost {
  background: var(--bg);
  border-color: var(--border);
  color: var(--text-muted);
}

.btn--ghost:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent);
}

.btn--outline {
  background: var(--surface);
  border-color: var(--border);
}

.btn--outline:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent);
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* ── Terminal logs ─────────────────────────────────── */
.log-terminal {
  background: #0f172a;
  color: #e2e8f0;
  border-radius: var(--radius-md);
  padding: 14px;
  max-height: 320px;
  overflow: auto;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.65;
}

.log-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  padding: 2px 0;
}

.log-time { color: #475569; }
.log-info  .log-message { color: #cbd5e1; }
.log-warn  .log-message { color: #fbbf24; }
.log-error .log-message { color: #f87171; }

.log-empty {
  text-align: center;
  color: #475569;
  padding: 20px 0;
  font-style: italic;
}

/* ── Misc ──────────────────────────────────────────── */
.empty-state {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 20px 0;
}

@media (max-width: 800px) {
  .running-grid { grid-template-columns: 1fr; }
  .running-grid .panel--logs { grid-column: span 1; }
  .summary-row { grid-template-columns: 1fr 60px 70px 60px 90px; }
  .reset-hero { padding: 20px; }
  .danger-header { padding: 16px 18px; }
  .entity-list { padding: 14px 18px; }
  .danger-actions { padding: 12px 18px; }
}
</style>
