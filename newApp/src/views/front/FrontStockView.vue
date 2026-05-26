<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchCategories, reduceStockByCategory } from '../../services/frontoffice/stockService'

/* ── Form state ──────────────────────────────────────── */
const quantity = ref('')
const selectedCategory = ref('')
const categories = ref([])
const categoriesLoading = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const report = ref(null)

const loadCategories = async () => {
  categoriesLoading.value = true
  try {
    categories.value = await fetchCategories()
  } catch {
    errorMessage.value = 'Impossible de charger les catégories. Vérifiez la connexion à PrestaShop.'
  } finally {
    categoriesLoading.value = false
  }
}

onMounted(loadCategories)

const validate = () => {
  const qty = Number(quantity.value)
  if (!qty || !Number.isInteger(qty) || qty <= 0) {
    errorMessage.value = 'Veuillez entrer une quantité entière valide (supérieure à 0).'
    return false
  }
  if (!selectedCategory.value) {
    errorMessage.value = 'Veuillez sélectionner une catégorie.'
    return false
  }
  return true
}

const reportByProduct = computed(() => {
  if (!report.value?.details) return []
  const qty = report.value.quantity
  const map = new Map()
  for (const row of report.value.details) {
    if (!map.has(row.productId)) {
      map.set(row.productId, { productId: row.productId, name: row.name, before: 0, reduced: 0, after: 0, theorique: 0, lignes: 0 })
    }
    const entry = map.get(row.productId)
    entry.before += row.before
    entry.reduced += row.reduced
    entry.after += row.after
    entry.lignes += 1
    entry.theorique += qty
  }
  return Array.from(map.values())
})

const handleSubmit = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  report.value = null

  if (!validate()) return

  loading.value = true
  try {
    const result = await reduceStockByCategory(selectedCategory.value, Number(quantity.value))
    report.value = result

    if (result.productCount === 0) {
      errorMessage.value = 'Aucun produit trouvé dans cette catégorie.'
    } else {
      successMessage.value = `Stocks mis à jour avec succès pour ${result.productCount} produit(s).`
      quantity.value = ''
      selectedCategory.value = ''
    }
  } catch (e) {
    errorMessage.value = 'Une erreur est survenue lors de la mise à jour des stocks. Réessayez.'
    console.error(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="stock-page">
    <div class="stock-container">


      <header class="page-header">
        <div class="header-eyebrow">
          <span class="eyebrow-dot"></span>
          Gestion des stocks — Front Office
        </div>
        <h1 class="page-title">Réduction de stock par catégorie</h1>
        <p class="page-subtitle">
          Réduisez le stock de tous les produits d'une catégorie en une seule opération.
          Si le stock devient négatif, il est automatiquement ramené à 0.
        </p>
      </header>


      <section class="form-card">
        <div class="form-card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Formulaire de réduction
        </div>

        <form class="stock-form" novalidate @submit.prevent="handleSubmit">
          <div class="form-row">
            <!-- Quantity field -->
            <div class="form-group">
              <label for="qty" class="form-label">
                Quantité à réduire
                <span class="form-required">*</span>
              </label>
              <div class="input-wrap">
                <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                <input
                  id="qty"
                  v-model.number="quantity"
                  type="number"
                  min="1"
                  step="1"
                  class="form-input"
                  placeholder="Ex : 10"
                  :disabled="loading"
                />
              </div>
            </div>

            <!-- Category field -->
            <div class="form-group">
              <label for="category" class="form-label">
                Catégorie
                <span class="form-required">*</span>
              </label>
              <div class="input-wrap">
                <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 10h16M4 14h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                <select
                  id="category"
                  v-model="selectedCategory"
                  class="form-select"
                  :disabled="loading || categoriesLoading"
                >
                  <option value="" disabled>
                    {{ categoriesLoading ? 'Chargement…' : '— Sélectionner une catégorie —' }}
                  </option>
                  <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                    {{ cat.name }}
                  </option>
                </select>
                <svg class="select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          <!-- Alerts -->
          <Transition name="slide-down">
            <div v-if="errorMessage" class="alert alert-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
                <path d="M8 5v3.5M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              {{ errorMessage }}
            </div>
          </Transition>

          <Transition name="slide-down">
            <div v-if="successMessage" class="alert alert-success" role="status">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ successMessage }}
            </div>
          </Transition>

          <div class="form-footer">
            <button type="submit" class="submit-btn" :disabled="loading || categoriesLoading">
              <span v-if="loading" class="btn-spinner"></span>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ loading ? 'Mise à jour en cours…' : 'Valider la réduction' }}
            </button>

            <p class="form-hint">
              Les stocks négatifs seront automatiquement ramenés à 0.
            </p>
          </div>
        </form>
      </section>

      <!-- Report section -->
      <Transition name="slide-up">
        <section v-if="report && report.productCount > 0" class="report-section">
          <div class="report-header">
            <div class="report-header-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M14 21l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Rapport de mise à jour
            </div>
          </div>

          <!-- Summary cards -->
          <div class="summary-grid">
            <div class="summary-card">
              <span class="summary-value">{{ report.productCount }}</span>
              <span class="summary-label">Produits concernés</span>
            </div>
            <div class="summary-card summary-card--neutral">
              <span class="summary-value">{{ report.totalTheorique }}</span>
              <span class="summary-label">Total théorique</span>
              <span class="summary-hint">qté × nb déclinaisons</span>
            </div>
            <div class="summary-card summary-card--accent">
              <span class="summary-value">{{ report.totalReallyReduced }}</span>
              <span class="summary-label">Total réellement réduit</span>
              <span class="summary-hint">stock disponible pris en compte</span>
            </div>
            <div class="summary-card summary-card--info">
              <span class="summary-value">{{ report.totalTheorique - report.totalReallyReduced }}</span>
              <span class="summary-label">Écart (stocks trop bas)</span>
              <span class="summary-hint">remis à 0 automatiquement</span>
            </div>
          </div>

          <!-- Detail table -->
          <div class="table-wrap">
            <table class="report-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Déclinaison</th>
                  <th class="col-num">Stock avant</th>
                  <th class="col-num">Réduit</th>
                  <th class="col-num">Stock après</th>
                  <th class="col-status">Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, idx) in report.details"
                  :key="`${row.productId}-${row.combinationId ?? idx}`"
                  :class="{ 'row-zeroed': row.after === 0 && row.before > 0, 'row-empty': row.before === 0 }"
                >
                  <td class="td-name">{{ row.name || `Produit #${row.productId}` }}</td>
                  <td class="td-variant">
                    <span v-if="row.combinationLabel" class="variant-badge">{{ row.combinationLabel }}</span>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="col-num">{{ row.before }}</td>
                  <td class="col-num td-reduced">
                    <span v-if="row.reduced > 0">−{{ row.reduced }}</span>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="col-num td-after" :class="{ 'td-zero': row.after === 0 }">{{ row.after }}</td>
                  <td class="col-status">
                    <span v-if="row.before === 0" class="badge badge-empty">Stock vide</span>
                    <span v-else-if="row.after === 0" class="badge badge-zero">Remis à 0</span>
                    <span v-else class="badge badge-ok">OK</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </Transition>

      <!-- Tableau récapitulatif par produit -->
      <Transition name="slide-up">
        <section v-if="reportByProduct.length > 0" class="report-section">
          <div class="report-header">
            <div class="report-header-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16M4 10h16M4 14h10M4 18h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              Récapitulatif par produit
            </div>
          </div>

          <div class="table-wrap">
            <table class="report-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th class="col-num">Stock avant</th>
                  <th class="col-num">Théorique</th>
                  <th class="col-num">Réel réduit</th>
                  <th class="col-num">Stock après</th>
                  <th class="col-status">Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in reportByProduct"
                  :key="row.productId"
                  :class="{ 'row-zeroed': row.after === 0 && row.before > 0, 'row-empty': row.before === 0 }"
                >
                  <td class="td-name">{{ row.name || `Produit #${row.productId}` }}</td>
                  <td class="col-num">{{ row.before }}</td>
                  <td class="col-num td-theorique">{{ row.theorique }}</td>
                  <td class="col-num td-reduced">
                    <span v-if="row.reduced > 0">−{{ row.reduced }}</span>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="col-num td-after" :class="{ 'td-zero': row.after === 0 }">{{ row.after }}</td>
                  <td class="col-status">
                    <span v-if="row.before === 0" class="badge badge-empty">Stock vide</span>
                    <span v-else-if="row.after === 0" class="badge badge-zero">Remis à 0</span>
                    <span v-else class="badge badge-ok">OK</span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td class="td-name total-label">Total</td>
                  <td class="col-num total-val">{{ reportByProduct.reduce((s, r) => s + r.before, 0) }}</td>
                  <td class="col-num total-val total-theorique">{{ reportByProduct.reduce((s, r) => s + r.theorique, 0) }}</td>
                  <td class="col-num total-val total-reduced">{{ reportByProduct.reduce((s, r) => s + r.reduced, 0) }}</td>
                  <td class="col-num total-val">{{ reportByProduct.reduce((s, r) => s + r.after, 0) }}</td>
                  <td class="col-status"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </Transition>

    </div>
  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────── */
.stock-page {
  min-height: calc(100vh - 68px);
  background: var(--front-bg, #f8fafc);
  padding: 32px clamp(16px, 4vw, 48px) 80px;
}

.stock-container {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── Page header ─────────────────────────────────────── */
.page-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.header-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #6366f1;
}

.eyebrow-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6366f1;
  flex-shrink: 0;
}

.page-title {
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  margin: 0;
}

.page-subtitle {
  font-size: 14.5px;
  color: #64748b;
  line-height: 1.6;
  margin: 0;
  max-width: 640px;
}

/* ── Form card ───────────────────────────────────────── */
.form-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.form-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 24px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
  font-weight: 700;
  color: #374151;
  background: #f8fafc;
}

.stock-form {
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.form-required {
  color: #ef4444;
  margin-left: 2px;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 13px;
  color: #9ca3af;
  pointer-events: none;
  flex-shrink: 0;
}

.form-input,
.form-select {
  width: 100%;
  height: 46px;
  padding: 0 14px 0 38px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: all 150ms ease;
  appearance: none;
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  border-color: #6366f1;
  background: white;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.form-input:disabled,
.form-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.select-arrow {
  position: absolute;
  right: 13px;
  color: #9ca3af;
  pointer-events: none;
}

/* ── Alerts ──────────────────────────────────────────── */
.alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 16px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.5;
}

.alert svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.alert-error {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #dc2626;
}

.alert-success {
  background: #f0fdf4;
  border: 1px solid #86efac;
  color: #16a34a;
}

/* ── Form footer ─────────────────────────────────────── */
.form-footer {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.submit-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 28px;
  height: 48px;
  border-radius: 999px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-size: 14.5px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
  white-space: nowrap;
}

.submit-btn:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.4);
}

.submit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.form-hint {
  font-size: 12.5px;
  color: #94a3b8;
  margin: 0;
}

/* ── Spinner ─────────────────────────────────────────── */
.btn-spinner {
  display: inline-block;
  width: 15px;
  height: 15px;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

/* ── Report section ──────────────────────────────────── */
.report-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #f1f5f9;
  background: #f8fafc;
}

.report-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #374151;
}

/* ── Summary grid ────────────────────────────────────── */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-bottom: 1px solid #f1f5f9;
}

.summary-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 16px;
  border-right: 1px solid #f1f5f9;
  text-align: center;
}

.summary-card:last-child {
  border-right: none;
}

.summary-value {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.03em;
  line-height: 1;
}

.summary-card--accent .summary-value { color: #6366f1; }
.summary-card--neutral .summary-value { color: #64748b; }
.summary-card--info .summary-value { color: #f59e0b; }

.summary-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  text-align: center;
}

.summary-hint {
  font-size: 10.5px;
  color: #94a3b8;
  text-align: center;
}

/* ── Report table ────────────────────────────────────── */
.table-wrap {
  overflow-x: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.report-table thead tr {
  background: #f8fafc;
}

.report-table th {
  padding: 12px 16px;
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.report-table td {
  padding: 13px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
  vertical-align: middle;
}

.report-table tbody tr:last-child td {
  border-bottom: none;
}

.report-table tbody tr:hover td {
  background: #f8fafc;
}

.row-zeroed td { background: #fffbeb !important; }
.row-empty td { background: #fafafa; }

.col-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.col-status {
  text-align: center;
}

.td-name {
  font-weight: 600;
  color: #0f172a;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-variant {
  max-width: 160px;
}

.variant-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  background: #f0f0ff;
  color: #6366f1;
  border: 1px solid #c7d2fe;
  white-space: nowrap;
}

.td-theorique {
  font-weight: 600;
  color: #64748b;
}

.td-reduced {
  font-weight: 700;
  color: #dc2626;
}

.td-after {
  font-weight: 700;
  color: #16a34a;
}

.td-zero {
  color: #f59e0b !important;
}

.muted {
  color: #cbd5e1;
}

/* ── Ligne total ─────────────────────────────────────── */
.total-row td {
  border-top: 2px solid #e2e8f0;
  background: #f8fafc;
  padding: 14px 16px;
}

.total-label {
  font-weight: 700;
  color: #0f172a;
  font-size: 13.5px;
}

.total-val {
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
}

.total-theorique {
  color: #64748b;
}

.total-reduced {
  color: #dc2626;
}

/* ── Badges ──────────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
}

.badge-ok {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.badge-zero {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fde68a;
}

.badge-empty {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

/* ── Transitions ─────────────────────────────────────── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 200ms ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.slide-up-enter-active {
  transition: all 300ms ease;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

/* ── Keyframes ───────────────────────────────────────── */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Responsive ──────────────────────────────────────── */
@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }

  .summary-card:nth-child(2) {
    border-right: none;
  }

  .form-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .submit-btn {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 400px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .summary-card {
    border-right: none;
    border-bottom: 1px solid #f1f5f9;
  }
}
</style>
