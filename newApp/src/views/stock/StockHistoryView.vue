<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getProducts } from '../../api/products'
import { getStockMovements } from '../../api/stockMovements'
import { getStockAvailable, getProductCombinations, getReservedQuantity } from '../../api/stock'
import { computeDailyStats } from '../../services/stock/stockService'

// ─── Produits (pour le select) ────────────────────────────────────────────────
const products        = ref([])
const productsLoading = ref(false)

async function loadProducts() {
  productsLoading.value = true
  try {
    const result = await getProducts({ page: 1, pageSize: 200, sort: { field: 'name', direction: 'ASC' } })
    products.value = result.items
  } catch { /* non bloquant */ }
  finally { productsLoading.value = false }
}

// ─── Sélection produit ────────────────────────────────────────────────────────
const selectedProductId   = ref('')
const selectedAttributeId = ref('0')
const activeProductId     = ref('')
const activeAttributeId   = ref('0')

// ─── Déclinaisons ─────────────────────────────────────────────────────────────
const combinations        = ref([])
const combinationsLoading = ref(false)
const hasCombinations     = computed(() => combinations.value.length > 0)

watch(selectedProductId, async (newId) => {
  selectedAttributeId.value = '0'
  combinations.value = []
  if (!newId) return
  combinationsLoading.value = true
  try {
    combinations.value = await getProductCombinations(newId)
  } catch { /* non-bloquant */ }
  finally { combinationsLoading.value = false }
})

const selectedProduct = computed(() =>
  products.value.find((p) => String(p.id) === String(selectedProductId.value)) || null
)

const selectedCombination = computed(() => {
  if (!selectedAttributeId.value || selectedAttributeId.value === '0') return null
  return combinations.value.find((c) => String(c.id) === String(selectedAttributeId.value)) || null
})

function handleValider() {
  activeProductId.value   = selectedProductId.value
  activeAttributeId.value = selectedAttributeId.value
  page.value = 1
  if (activeProductId.value) load()
}

function handleReset() {
  selectedProductId.value   = ''
  selectedAttributeId.value = '0'
  activeProductId.value     = ''
  activeAttributeId.value   = '0'
  combinations.value        = []
  currentStock.value        = 0
  page.value                = 1
  load()
}

// ─── Mouvements ───────────────────────────────────────────────────────────────
const movements    = ref([])
const loading      = ref(false)
const error        = ref('')
const total        = ref(0)
const currentStock = ref(0)
const currentReserved = ref(0)
const PAGE_SIZE    = 100   // module gère jusqu'à 500 côté PS

// Pagination client-side sur les données chargées (module retourne tout d'un coup)
const page      = ref(1)
const PAGE_DISPLAY = 25
const totalPages = computed(() => Math.max(1, Math.ceil(movements.value.length / PAGE_DISPLAY)))
const hasMore    = computed(() => page.value < totalPages.value)
const pagedMovements = computed(() => {
  const start = (page.value - 1) * PAGE_DISPLAY
  return movements.value.slice(start, start + PAGE_DISPLAY)
})

async function load() {
  if (!activeProductId.value) {
    movements.value = []
    total.value     = 0
    currentStock.value = 0
    return
  }

  loading.value = true
  error.value   = ''
  try {
    const attrId = activeAttributeId.value !== '0' ? parseInt(activeAttributeId.value, 10) : undefined
    const [result, stock, reserved] = await Promise.all([
      getStockMovements({
        id_product: activeProductId.value,
        ...(attrId ? { id_product_attribute: attrId } : {}),
        limit:      PAGE_SIZE,
      }),
      getStockAvailable(activeProductId.value, attrId || 0),
      getReservedQuantity(activeProductId.value, attrId || 0),
    ])

    movements.value    = result.movements
    total.value        = result.total
    currentStock.value = stock?.quantity ?? 0
    currentReserved.value = reserved
    page.value         = 1
  } catch (err) {
    error.value = err?.message || 'Erreur lors du chargement.'
  } finally {
    loading.value = false
  }
}

function prevPage() { if (page.value > 1)         page.value-- }
function nextPage() { if (page.value < totalPages.value) page.value++ }

onMounted(() => { loadProducts() })

// ─── Onglets ──────────────────────────────────────────────────────────────────
const activeTab = ref('table')

// ─── Stats (sur tous les mouvements chargés) ─────────────────────────────────
const globalStats = computed(() => {
  const all      = movements.value
  const totalIn  = all.reduce((s, m) => s + (m.quantity_delta > 0 ?  m.quantity_delta : 0), 0)
  const totalOut = all.reduce((s, m) => s + (m.quantity_delta < 0 ? -m.quantity_delta : 0), 0)
  return { count: all.length, totalIn, totalOut }
})

// ─── Graphique ────────────────────────────────────────────────────────────────
const dailyStats = computed(() => computeDailyStats(movements.value, currentStock.value))

const movementSeries = computed(() => {
  const list = Array.isArray(movements.value) ? movements.value : []
  if (!list.length) {
    return { points: [] }
  }

  const sorted = [...list].sort((a, b) => {
    const aTime = Date.parse(a?.date_add || '')
    const bTime = Date.parse(b?.date_add || '')

    const aValid = Number.isFinite(aTime)
    const bValid = Number.isFinite(bTime)

    if (aValid && bValid && aTime !== bTime) {
      return aTime - bTime
    }
    if (aValid && !bValid) return -1
    if (!aValid && bValid) return 1

    const aStr = String(a?.date_add || '')
    const bStr = String(b?.date_add || '')
    if (aStr !== bStr) {
      return aStr.localeCompare(bStr)
    }

    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })

  const totalDelta = sorted.reduce((sum, m) => sum + (Number(m?.quantity_delta) || 0), 0)
  let runningStock = (Number(currentStock.value) || 0) - totalDelta

  const points = sorted.map((m, i) => {
    const delta = Number(m?.quantity_delta) || 0
    runningStock += delta

    return {
      i,
      date: m?.date_add || '',
      delta,
      stockAfter: runningStock,
      movement: m,
    }
  })

  return { points }
})

// ─── Constantes graphique (style simple, ligne unique) ──────────────────────
const CHART_W    = 720
const CHART_H    = 260
const PAD        = { left: 44, right: 20, top: 18, bottom: 90 }
const innerW     = CHART_W - PAD.left - PAD.right
const innerH     = CHART_H - PAD.top - PAD.bottom
const STOCK_BOT  = PAD.top + innerH

// Construit un path en lignes droites (style simple comme l'exemple)
function linePath(pts) {
  if (!pts.length) return ''
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`
  }
  return d
}

const chartData = computed(() => {
  const series = movementSeries.value
  if (!series.points.length) return null

  const deltas = series.points.map((p) => p.delta)
  const stocks = series.points.map((p) => p.stockAfter)

  let minDelta = Math.min(...deltas, 0)
  let maxDelta = Math.max(...deltas, 0)
  let minStock = Math.min(...stocks, 0)
  let maxStock = Math.max(...stocks, 0)

  if (minDelta === maxDelta) {
    minDelta -= 1
    maxDelta += 1
  }
  if (minStock === maxStock) {
    minStock -= 1
    maxStock += 1
  }

  const xRange = maxDelta - minDelta
  const yRange = maxStock - minStock
  const toX = (value) => {
    const ratio = (value - minDelta) / xRange
    return PAD.left + (1 - ratio) * innerW
  }
  const toY = (value) => PAD.top + ((maxStock - value) / yRange) * innerH
  const zeroX = toX(0)

  const movementPoints = series.points.map((pt) => ({
    ...pt,
    x: toX(pt.delta),
    y: toY(pt.stockAfter),
  }))

  const stockPath = linePath(movementPoints)

  const yTicks = 5
  const yLines = Array.from({ length: yTicks }, (_, i) => {
    const value = minStock + (yRange / (yTicks - 1)) * i
    return { y: toY(value), label: Math.round(value), value }
  })

  const xTicks = 5
  const xLines = Array.from({ length: xTicks }, (_, i) => {
    const value = minDelta + (xRange / (xTicks - 1)) * i
    const label = value > 0 ? `+${Math.round(value)}` : String(Math.round(value))
    return { x: toX(value), label, value }
  })

  return { stockPath, movementPoints, yLines, xLines, zeroX }
})

const tooltip  = ref(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
function showTooltip(pt) { tooltip.value = pt; tooltipX.value = pt.x; tooltipY.value = pt.y }
function hideTooltip()   { tooltip.value = null }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—'
  try {
    return new Date(str).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return str }
}

function deltaClass(delta) {
  return Number(delta) > 0 ? 'delta-pos' : Number(delta) < 0 ? 'delta-neg' : 'delta-zero'
}

function deltaColor(delta) {
  if (Number(delta) > 0) return '#16a34a'
  if (Number(delta) < 0) return '#dc2626'
  return '#6366f1'
}
</script>

<template>
  <div class="stock-history-page animate-fade-in">

    <!-- En-tête -->
    <div class="page-header">
      <div>
        <h1>Historique des Mouvements</h1>
      </div>
      <button class="btn btn--outline btn--sm" @click="load" :disabled="loading">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" :class="{ spinning: loading }">
          <path d="M12 7A5 5 0 114.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M4 1l.5 3L7 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Actualiser
      </button>
    </div>

    <!-- Sélecteur produit -->
    <div class="card filter-card">
      <div class="filter-row">
        <div class="select-wrap">
          <label class="label">Produit</label>
          <select v-model="selectedProductId" class="input select product-select" :disabled="productsLoading">
            <option value="">— Tous les produits —</option>
            <option v-for="p in products" :key="p.id" :value="String(p.id)">
              {{ p.name }}{{ p.reference ? ` · ${p.reference}` : '' }}
            </option>
          </select>
        </div>

        <div v-if="selectedProductId && (combinationsLoading || hasCombinations)" class="select-wrap select-wrap--combo">
          <label class="label">Déclinaison</label>
          <select v-model="selectedAttributeId" class="input select" :disabled="combinationsLoading">
            <option value="0">{{ combinationsLoading ? 'Chargement…' : 'Toutes les déclinaisons' }}</option>
            <option v-for="c in combinations" :key="c.id" :value="String(c.id)">
              #{{ c.id }}{{ c.reference ? ` — ${c.reference}` : '' }}
            </option>
          </select>
        </div>

        <div class="filter-actions">
          <button class="btn btn--primary" @click="handleValider" :disabled="loading">Valider</button>
          <button class="btn btn--outline" @click="handleReset" :disabled="loading || (!selectedProductId && !activeProductId)">
            Tout afficher
          </button>
        </div>
      </div>

      <div v-if="activeProductId && selectedProduct" class="active-filter">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M5 7l2 2 2-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Filtré sur :
        <strong>{{ selectedProduct.name }}</strong>
        <code v-if="selectedProduct.reference">{{ selectedProduct.reference }}</code>
        <span v-if="selectedCombination" class="combo-badge">
          Décl. #{{ selectedCombination.id }}{{ selectedCombination.reference ? ` — ${selectedCombination.reference}` : '' }}
        </span>
        <span v-if="activeProductId && (activeAttributeId !== '0' || !hasCombinations)" class="stock-badge">
          Stock actuel : {{ currentStock }}
        </span>
      </div>
    </div>

    <!-- Erreur -->
    <div v-if="error" class="alert-error">{{ error }}</div>

    <!-- Chargement -->
    <div v-if="loading && !movements.length" class="loading-state">
      <span class="spinner-dark"></span> Chargement…
    </div>

    <template v-else-if="movements.length || (!loading && !error)">

      <!-- Stats -->
      <div v-if="movements.length" class="stats-row">
        <div class="stat-card">
          <span class="stat-value">{{ globalStats.count }}</span>
          <span class="stat-label">Total mouvements</span>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-card">
          <span class="stat-value stat-green">+{{ globalStats.totalIn }}</span>
          <span class="stat-label">Entrées (page)</span>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-card">
          <span class="stat-value stat-red">-{{ globalStats.totalOut }}</span>
          <span class="stat-label">Sorties (page)</span>
        </div>
        <template v-if="activeProductId">
          <div class="stat-sep"></div>
          <div class="stat-card">
            <span class="stat-value" style="color:var(--accent)">{{ currentStock }}</span>
            <span class="stat-label">Stock actuel</span>
          </div>
          <div class="stat-sep"></div>
          <div class="stat-card">
            <span class="stat-value" style="color:#f59e0b">{{ currentReserved }}</span>
            <span class="stat-label">Stock réservé</span>
          </div>
        </template>
      </div>

      <!-- Onglets -->
      <div v-if="movements.length" class="tabs">
        <button class="tab" :class="{ active: activeTab === 'table' }" @click="activeTab = 'table'">Tableau</button>
        <button class="tab" :class="{ active: activeTab === 'chart' }" @click="activeTab = 'chart'">
          Graphique mouvements
          <span v-if="!activeProductId" class="tab-hint">— sélectionner un produit</span>
        </button>
      </div>

      <!-- Tableau -->
      <div v-if="activeTab === 'table'" class="card table-card">
        <div v-if="!movements.length" class="no-results">Aucun mouvement trouvé.</div>
        <template v-else>
          <div class="table-wrap">
            <table class="mv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th>Référence</th>
                  <th>Mouvement</th>
                  <th>Motif</th>
                  <th>Employé</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in pagedMovements" :key="m.id">
                  <td class="date-cell">{{ formatDate(m.date_add) }}</td>
                  <td class="name-cell">
                    {{ m.product_name }}
                    <span v-if="m.id_product_attribute && m.id_product_attribute !== '0'" class="attr-badge">
                      #{{ m.id_product_attribute }}
                    </span>
                  </td>
                  <td><code class="ref-code">{{ m.reference || '—' }}</code></td>
                  <td class="num-cell">
                    <span class="delta-badge" :class="deltaClass(m.quantity_delta)">
                      {{ Number(m.quantity_delta) > 0 ? '+' : '' }}{{ m.quantity_delta }}
                    </span>
                  </td>
                  <td><span class="reason-badge">{{ m.reason || '—' }}</span></td>
                  <td class="emp-cell">
                    {{ m.employee_firstname || m.employee_lastname
                      ? `${m.employee_firstname} ${m.employee_lastname}`.trim()
                      : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pagination">
            <button class="btn btn--outline btn--sm" @click="prevPage" :disabled="page <= 1">‹ Préc.</button>
            <span class="page-info">Page {{ page }} / {{ totalPages }} — {{ movements.length }} mouvement{{ movements.length > 1 ? 's' : '' }}</span>
            <button class="btn btn--outline btn--sm" @click="nextPage" :disabled="!hasMore">Suiv. ›</button>
          </div>
        </template>
      </div>

      <!-- Graphique évolution de stock -->
      <div v-if="activeTab === 'chart'" class="stock-chart-card">

        <!-- En-tête -->
        <div class="sc-head">
          <div class="sc-head-left">
            <div class="sc-accent-bar"></div>
            <div class="sc-head-text">
              <div class="sc-head-title">
                Évolution du stock
                <span v-if="selectedProduct" class="sc-head-product"> — {{ selectedProduct.name }}</span>
                <span v-if="activeAttributeId !== '0' && selectedCombination" class="sc-head-combo"> · Décl. #{{ selectedCombination.id }}</span>
              </div>
              <div class="sc-head-sub">Axe Y = stock actuel · axe X = delta (+ entree / - sortie)</div>
            </div>
          </div>
          <div v-if="activeProductId && movementSeries.points.length" class="sc-chips">
            <span class="sc-chip sc-chip--in">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              +{{ globalStats.totalIn }} entrées
            </span>
            <span class="sc-chip sc-chip--out">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 2v6M2 5l3 3 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              −{{ globalStats.totalOut }} sorties
            </span>
            <span class="sc-chip sc-chip--now">
              <span class="sc-now-dot"></span>
              {{ currentStock }} en stock
            </span>
          </div>
        </div>

        <!-- États vides -->
        <div v-if="!activeProductId" class="sc-empty">
          <div class="sc-empty-icon">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <rect x="2" y="2" width="30" height="30" rx="7" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
              <path d="M7 25l6-7 5 5 5-7 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p>Sélectionnez un produit pour afficher l'évolution du stock.</p>
        </div>
          <div v-else-if="!movementSeries.points.length" class="sc-empty">
          <div class="sc-empty-icon">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <rect x="2" y="2" width="30" height="30" rx="7" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
              <path d="M10 24h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          </div>
          <p>Aucun mouvement pour ce produit.</p>
        </div>

        <template v-else-if="chartData">
          <!-- SVG -->
          <div class="sc-svg-wrap">
            <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="sc-svg" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="scLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stop-color="#a5b4fc"/>
                  <stop offset="100%" stop-color="#6366f1"/>
                </linearGradient>
              </defs>

              <!-- Grille horizontale pointillée -->
              <line v-for="t in chartData.yLines" :key="'g'+t.y"
                :x1="PAD.left" :y1="t.y"
                :x2="PAD.left + innerW" :y2="t.y"
                stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 6"/>

              <!-- Grille verticale pointillée -->
              <line v-for="t in chartData.xLines" :key="'gx'+t.x"
                :x1="t.x" :y1="PAD.top"
                :x2="t.x" :y2="STOCK_BOT"
                stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 6"/>

              <!-- Axe X (delta) -->
              <line
                :x1="PAD.left" :y1="STOCK_BOT"
                :x2="PAD.left + innerW" :y2="STOCK_BOT"
                stroke="#94a3b8" stroke-width="1.5"/>

              <!-- Axe Y (stock) a x=0 -->
              <line
                :x1="chartData.zeroX" :y1="PAD.top"
                :x2="chartData.zeroX" :y2="STOCK_BOT"
                stroke="#94a3b8" stroke-width="1.5"/>

              <!-- Labels Y -->
              <text v-for="t in chartData.yLines" :key="'yl'+t.y"
                :x="PAD.left - 8" :y="t.y + 4"
                text-anchor="end"
                font-size="10" font-family="Inter, ui-sans-serif, system-ui, sans-serif"
                fill="#94a3b8">{{ t.label }}</text>

              <!-- Ligne continue (chronologie des mouvements) -->
              <path :d="chartData.stockPath" fill="none"
                stroke="url(#scLineGrad)" stroke-width="2.5"
                stroke-linejoin="round" stroke-linecap="round"
                class="sc-line" pathLength="1"/>

              <!-- Points par mouvement -->
              <g v-for="pt in chartData.movementPoints" :key="'pt'+pt.i" class="sc-dot-g">
                <circle :cx="pt.x" :cy="pt.y" r="11" :fill="deltaColor(pt.delta)" class="sc-halo"/>
                <circle :cx="pt.x" :cy="pt.y" r="3.5"
                  fill="white" :stroke="deltaColor(pt.delta)" stroke-width="2"
                  class="sc-dot"
                  :style="{ animationDelay: `${0.5 + pt.i * 0.045}s` }"
                  @mouseenter="showTooltip(pt)" @mouseleave="hideTooltip"/>
              </g>

              <!-- Labels X (delta) -->
              <text v-for="l in chartData.xLines" :key="'xlbl'+l.x"
                :x="l.x" :y="STOCK_BOT + 20"
                text-anchor="middle"
                font-size="10" font-family="Inter, ui-sans-serif, system-ui, sans-serif"
                fill="#94a3b8">{{ l.label }}</text>

              <!-- Tooltip -->
              <g v-if="tooltip" style="pointer-events:none;">
                <rect
                  :x="tooltipX > CHART_W - 182 ? tooltipX - 156 : tooltipX + 12"
                  :y="Math.max(tooltipY - 88, PAD.top + 2)"
                  width="144" height="82" rx="10"
                  fill="white" stroke="#6366f1" stroke-width="1.2"
                  style="filter:drop-shadow(0 8px 22px rgba(99,102,241,0.18));"/>
                <text
                  :x="tooltipX > CHART_W - 182 ? tooltipX - 144 : tooltipX + 24"
                  :y="Math.max(tooltipY - 62, PAD.top + 24)"
                  font-size="10" font-family="Inter, ui-sans-serif, system-ui, sans-serif"
                  fill="#94a3b8">{{ formatDate(tooltip.date) }}</text>
                <text
                  :x="tooltipX > CHART_W - 182 ? tooltipX - 144 : tooltipX + 24"
                  :y="Math.max(tooltipY - 36, PAD.top + 48)"
                  font-family="Inter, ui-sans-serif, system-ui, sans-serif">
                  <tspan font-size="21" font-weight="800" fill="#6366f1">{{ tooltip.stockAfter }}</tspan>
                  <tspan font-size="11" fill="#94a3b8" dx="3">unités</tspan>
                </text>
                <text
                  :x="tooltipX > CHART_W - 182 ? tooltipX - 144 : tooltipX + 24"
                  :y="Math.max(tooltipY - 12, PAD.top + 70)"
                  font-size="10.5" font-family="Inter, ui-sans-serif, system-ui, sans-serif">
                  <tspan :fill="deltaColor(tooltip.delta)">
                    Delta: {{ tooltip.delta > 0 ? '+' : '' }}{{ tooltip.delta }}
                  </tspan>
                </text>
              </g>
            </svg>
          </div>

          <!-- Légende -->
          <div class="sc-legend">
            <span class="sc-leg-item">
              <svg width="26" height="3" style="flex-shrink:0;display:block;vertical-align:middle">
                <line x1="0" y1="1.5" x2="26" y2="1.5" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
              Stock actuel (Y)
            </span>
            <span class="sc-leg-item">
              <svg width="12" height="12" viewBox="0 0 12 12" style="flex-shrink:0">
                <circle cx="6" cy="6" r="3.5" fill="white" stroke="#6366f1" stroke-width="2"/>
              </svg>
              Point (delta, stock)
            </span>
            <span class="sc-leg-sep">·</span>
            <span class="sc-leg-item sc-leg-item--in">→ Delta positif</span>
            <span class="sc-leg-sep">·</span>
            <span class="sc-leg-item sc-leg-item--out">← Delta negatif</span>
          </div>

          <!-- Tableau journalier -->
          <div class="sc-daily-table">
            <div class="sc-daily-head">Détail journalier</div>
            <table class="mv-table">
              <thead>
                <tr><th>Jour</th><th>Stock début</th><th>Entrées</th><th>Sorties</th><th>Stock fin</th><th>Variation</th></tr>
              </thead>
              <tbody>
                <tr v-for="d in [...dailyStats].reverse()" :key="d.day">
                  <td class="date-cell">{{ d.day }}</td>
                  <td class="num-cell">{{ d.stock_start }}</td>
                  <td class="num-cell"><span v-if="d.entries" class="delta-badge delta-pos">+{{ d.entries }}</span><span v-else class="muted">0</span></td>
                  <td class="num-cell"><span v-if="d.exits" class="delta-badge delta-neg">-{{ d.exits }}</span><span v-else class="muted">0</span></td>
                  <td class="num-cell"><strong>{{ d.stock_end }}</strong></td>
                  <td class="num-cell">
                    <span class="delta-badge" :class="deltaClass(d.stock_end - d.stock_start)">
                      {{ d.stock_end - d.stock_start > 0 ? '+' : '' }}{{ d.stock_end - d.stock_start }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>

    </template>
  </div>
</template>

<style scoped>
.stock-history-page { max-width: 1100px; }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.page-header h1 { margin-bottom: 4px; }
.page-desc { font-size: 13px; color: var(--text-muted); }
.page-desc code { font-size: 11.5px; background: var(--bg); padding: 1px 5px; border-radius: 3px; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; margin-bottom: 14px; box-shadow: var(--shadow-xs); }

.filter-card { padding: 16px 20px; }
.filter-row { display: flex; align-items: flex-end; gap: 12px; }
.select-wrap { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.product-select { width: 100%; }

.select-wrap--combo { flex: 0 0 220px; }
.filter-actions { display: flex; gap: 8px; flex-shrink: 0; align-self: flex-end; }

.active-filter { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 8px 12px; background: color-mix(in srgb, var(--accent) 8%, var(--bg)); border: 1px solid var(--accent-border); border-radius: var(--radius-md); font-size: 13px; flex-wrap: wrap; }
.active-filter code { font-size: 11.5px; background: var(--surface); padding: 1px 5px; border-radius: 3px; }
.combo-badge  { font-size: 12px; font-weight: 600; color: var(--accent); background: var(--surface); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--accent-border); }
.stock-badge  { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--accent); background: var(--surface); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--accent-border); }

.alert-error { padding: 12px 16px; background: #fce4ec; border: 1px solid #f48fb1; border-radius: var(--radius-md); color: #c62828; font-size: 13px; margin-bottom: 14px; }

.loading-state { display: flex; align-items: center; gap: 10px; padding: 32px; color: var(--text-muted); font-size: 14px; justify-content: center; }

.stats-row { display: flex; align-items: center; gap: 18px; padding: 12px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 12px; box-shadow: var(--shadow-xs); flex-wrap: wrap; }
.stat-card  { display: flex; align-items: baseline; gap: 8px; }
.stat-value { font-size: 22px; font-weight: 800; color: var(--text); }
.stat-green { color: #2e7d32; }
.stat-red   { color: #c62828; }
.stat-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.stat-sep   { width: 1px; height: 24px; background: var(--border); }

.tabs { display: flex; gap: 2px; margin-bottom: 4px; }
.tab  { padding: 8px 18px; border: 1px solid var(--border); border-bottom: none; border-radius: var(--radius-md) var(--radius-md) 0 0; background: var(--bg); color: var(--text-muted); font-size: 13.5px; font-weight: 600; cursor: pointer; }
.tab.active { background: var(--surface); color: var(--accent); }
.tab-hint   { font-size: 11px; font-weight: 400; color: var(--text-muted); margin-left: 4px; }

.table-card { border-radius: 0 var(--radius-lg) var(--radius-lg); }
.table-wrap { overflow-x: auto; }
.mv-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 600px; }
.mv-table th { padding: 8px 10px; text-align: left; font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); white-space: nowrap; }
.mv-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.mv-table tr:last-child td { border-bottom: none; }
.mv-table tr:hover td { background: var(--bg); }

.date-cell  { white-space: nowrap; font-size: 12px; color: var(--text-muted); }
.name-cell  { font-weight: 500; max-width: 200px; }
.num-cell   { text-align: right; white-space: nowrap; }
.emp-cell   { font-size: 12px; }

.ref-code   { font-size: 11.5px; background: var(--bg); padding: 1px 5px; border-radius: 3px; font-family: monospace; color: var(--text-muted); }
.attr-badge { font-size: 10.5px; background: var(--bg); color: var(--text-muted); padding: 1px 5px; border-radius: 8px; white-space: nowrap; margin-left: 4px; }

.delta-badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 12px; font-weight: 700; }
.delta-pos  { background: #e8f5e9; color: #2e7d32; }
.delta-neg  { background: #fce4ec; color: #c62828; }
.delta-zero { background: var(--bg); color: var(--text-muted); }

.reason-badge { font-size: 11.5px; background: var(--bg); padding: 2px 7px; border-radius: 10px; color: var(--accent); font-weight: 600; white-space: nowrap; }
.muted { color: var(--text-muted); font-size: 12px; }
.no-results { padding: 28px; text-align: center; color: var(--text-muted); font-size: 14px; }

.pagination { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; margin-top: 4px; border-top: 1px solid var(--border); }
.page-info  { font-size: 12px; color: var(--text-muted); font-weight: 600; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: var(--radius-md); font-size: 13.5px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all var(--transition-fast); white-space: nowrap; }
.btn--primary { background: var(--accent); color: #fff; }
.btn--primary:hover:not(:disabled) { filter: brightness(1.1); }
.btn--outline { background: var(--surface); border-color: var(--border); color: var(--text); }
.btn--outline:hover:not(:disabled) { border-color: var(--accent-border); color: var(--accent); }
.btn--sm  { padding: 6px 12px; font-size: 12.5px; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.label  { font-size: 11.5px; font-weight: 600; color: var(--text); }
.input  { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 13.5px; background: var(--bg); color: var(--text); }
.input:focus { outline: none; border-color: var(--accent-border); }
.select { cursor: pointer; }

/* ── Stock Chart ─────────────────────────────────────────────────────────── */
.stock-chart-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 14px;
  box-shadow: var(--shadow-xs);
}

/* Header */
.sc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.sc-head-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.sc-accent-bar {
  width: 4px;
  height: 40px;
  border-radius: 99px;
  background: linear-gradient(180deg, #a5b4fc 0%, #6366f1 100%);
  flex-shrink: 0;
}

.sc-head-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.sc-head-product { color: var(--accent); font-weight: 600; }
.sc-head-combo   { font-size: 12px; font-weight: 500; color: var(--text-muted); }

.sc-head-sub {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 3px;
}

/* Chips */
.sc-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sc-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.sc-chip--in {
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.sc-chip--out {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.sc-chip--now {
  background: rgba(99, 102, 241, 0.08);
  color: var(--accent);
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.sc-now-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  animation: scPulse 2s ease-in-out infinite;
}

/* Empty */
.sc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 58px 24px;
  color: var(--text-muted);
  font-size: 13.5px;
  text-align: center;
}

.sc-empty-icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.07);
  border-radius: 16px;
  color: var(--accent);
  opacity: 0.65;
}

.sc-empty p { margin: 0; }

/* SVG */
.sc-svg-wrap { padding: 14px 16px 0; overflow: hidden; }
.sc-svg      { width: 100%; height: auto; display: block; }

/* Animations */
.sc-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: scDraw 1.4s cubic-bezier(0.65, 0, 0.35, 1) 0.1s forwards;
}

.sc-area {
  opacity: 0;
  animation: scFade 0.8s ease 0.7s forwards;
}

.sc-dot {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: scPop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  cursor: pointer;
}

.sc-dot-g .sc-halo { opacity: 0; transition: opacity 0.18s; }
.sc-dot-g:hover .sc-halo { opacity: 1; }

@keyframes scDraw { to { stroke-dashoffset: 0; } }
@keyframes scFade { to { opacity: 1; } }
@keyframes scPop  { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: scale(1); } }
@keyframes scPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.82); } }

/* Légende */
.sc-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 22px 14px;
  font-size: 11.5px;
  color: var(--text-muted);
  flex-wrap: wrap;
}

.sc-leg-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.sc-leg-item--in  { color: #15803d; font-weight: 600; }
.sc-leg-item--out { color: #b91c1c; font-weight: 600; }
.sc-leg-sep { color: var(--border); }

/* Tableau journalier */
.sc-daily-table { border-top: 1px solid var(--border); }

.sc-daily-head {
  padding: 11px 20px 9px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

/* Spinner (utilisé dans le template hors chart) */
.spinner-dark { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinning     { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .filter-row     { flex-direction: column; align-items: stretch; }
  .filter-actions { justify-content: flex-end; }
  .stats-row      { gap: 10px; }
  .sc-head        { flex-direction: column; align-items: flex-start; }
}
</style>
