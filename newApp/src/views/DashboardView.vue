<script setup>
import { computed, onMounted, ref } from 'vue'
import { getCategories } from '../api/categories'
import { getOrderRows, getOrders, getOrdersByDateRangePage, getShippedOrPaidOrderStateIds } from '../api/orders'
import { getFrontProductById } from '../services/frontoffice/products'
import { computePriceTtc, getTaxRateForGroup } from '../services/frontoffice/taxService'
import { getXmlClient } from '../api/xmlClient'

const pad2 = (value) => String(value).padStart(2, '0')

const getTodayDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

const parseAmount = (value) => {
  const normalized = String(value ?? '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

const formatCurrency = (value) => {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0,00 €'
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

const summarizeOrders = (orders) => {
  const list = Array.isArray(orders) ? orders : []
  return list.reduce(
    (acc, order) => {
      acc.count += 1
      acc.total += parseAmount(order?.total)
      return acc
    },
    { count: 0, total: 0 }
  )
}

const dailyDate = ref(getTodayDate())
const dailyStats = ref({ count: 0, total: 0 })
const totalStats = ref({ count: 0, total: 0 })
const dailyLoading = ref(false)
const totalLoading = ref(false)
const dailyError = ref('')
const totalError = ref('')
const dailyDetailRows = ref([])
const dailyDetailLoading = ref(false)
const dailyDetailError = ref('')
const categories = ref([])
const paidOrShippedStateIds = ref(null)
const statesLoadError = ref('')

const categoryMap = computed(() => {
  const map = new Map()
  categories.value.forEach((category) => {
    const id = String(category.id || '').trim()
    if (id) {
      map.set(id, category.name || `Categorie #${id}`)
    }
  })
  return map
})

const getCategoryName = (categoryId) => {
  const key = String(categoryId || '').trim()
  if (!key) {
    return '-'
  }
  return categoryMap.value.get(key) || `Categorie #${key}`
}

const fetchSummary = async (fetchPage) => {
  const batchSize = 200
  let offset = 0
  let summary = { count: 0, total: 0 }

  while (true) {
    const result = (await fetchPage({ limit: batchSize, offset })) || {}
    const items = Array.isArray(result.items) ? result.items : []
    const partial = summarizeOrders(items)
    summary = {
      count: summary.count + partial.count,
      total: summary.total + partial.total,
    }

    if (result.shouldStop || items.length < batchSize) {
      break
    }

    offset += batchSize
  }

  return summary
}

const loadPaymentStates = async () => {
  try {
    const client = getXmlClient()
    paidOrShippedStateIds.value = await getShippedOrPaidOrderStateIds(client)
  } catch (err) {
    statesLoadError.value = err instanceof Error ? err.message : String(err)
    paidOrShippedStateIds.value = []
    console.error('Erreur chargement états paiement/livraison:', err)
  }
}

const loadDailyStats = async () => {
  if (!dailyDate.value) {
    dailyStats.value = { count: 0, total: 0 }
    return
  }

  dailyLoading.value = true
  dailyError.value = ''

  try {
    dailyStats.value = await fetchSummary(({ limit, offset }) =>
      getOrdersByDateRangePage(dailyDate.value, { limit, offset }, paidOrShippedStateIds.value)
    )
  } catch (err) {
    dailyError.value = err instanceof Error ? err.message : String(err)
    dailyStats.value = { count: 0, total: 0 }
  } finally {
    dailyLoading.value = false
  }
}

const loadTotalStats = async () => {
  totalLoading.value = true
  totalError.value = ''

  try {
    totalStats.value = await fetchSummary(async ({ limit, offset }) => {
      const items = await getOrders({ limit, offset })
      let filtered = items
      if (paidOrShippedStateIds.value && Array.isArray(paidOrShippedStateIds.value) && paidOrShippedStateIds.value.length > 0) {
        filtered = items.filter(order =>
          paidOrShippedStateIds.value.includes(String(order.statusId || '').trim())
        )
      }
      return { items: filtered, shouldStop: items.length < limit }
    })
  } catch (err) {
    totalError.value = err instanceof Error ? err.message : String(err)
    totalStats.value = { count: 0, total: 0 }
  } finally {
    totalLoading.value = false
  }
}

const fetchOrdersForDate = async () => {
  const batchSize = 120
  let offset = 0
  let orders = []

  while (true) {
    const result = await getOrdersByDateRangePage(dailyDate.value, { limit: batchSize, offset }, paidOrShippedStateIds.value)
    const items = Array.isArray(result.items) ? result.items : []
    orders = orders.concat(items)

    if (result.shouldStop || items.length < batchSize) {
      break
    }
    offset += batchSize
  }

  return orders
}

const loadDailyDetails = async () => {
  if (!dailyDate.value) {
    dailyDetailRows.value = []
    return
  }

  dailyDetailLoading.value = true
  dailyDetailError.value = ''

  try {
    const orders = await fetchOrdersForDate()
    
    const filteredOrders = orders.filter(order => {
      if (!paidOrShippedStateIds.value || paidOrShippedStateIds.value.length === 0) {
        return true
      }
      return paidOrShippedStateIds.value.includes(String(order.statusId || '').trim())
    })
    
    const productCache = new Map()
    const taxCache = new Map()

    const getProduct = async (productId) => {
      const key = String(productId || '').trim()
      if (!key) return null
      if (productCache.has(key)) return productCache.get(key)
      const product = await getFrontProductById(key)
      productCache.set(key, product || null)
      return product
    }

    const getTaxRate = async (taxRulesGroupId) => {
      const key = String(taxRulesGroupId || '').trim()
      if (!key) return 0
      if (taxCache.has(key)) return taxCache.get(key)
      const rate = await getTaxRateForGroup(key)
      taxCache.set(key, rate)
      return rate
    }

    const rows = []

    for (const order of filteredOrders) {
      const orderId = order?.id
      if (!orderId) {
        continue
      }
      const orderRows = await getOrderRows(orderId)

      for (const row of orderRows) {
        const product = await getProduct(row.productId)
        const taxRate = await getTaxRate(product?.taxRulesGroupId)
        const unitPriceHt = parseAmount(row.productPrice)
        const unitPriceTtc = computePriceTtc(unitPriceHt, taxRate)
        const quantity = Number(row.quantity || 0)

        rows.push({
          orderId: orderId,
          orderReference: row.orderReference || order.reference || '',
          productId: row.productId,
          productName: row.productName || product?.name || '',
          categoryId: product?.categoryId || '',
          quantity,
          unitPriceTtc,
          lineTotalTtc: Number((unitPriceTtc * quantity).toFixed(2)),
        })
      }
    }

    dailyDetailRows.value = rows
  } catch (err) {
    dailyDetailError.value = err instanceof Error ? err.message : String(err)
    dailyDetailRows.value = []
  } finally {
    dailyDetailLoading.value = false
  }
}

const detailSummary = computed(() => {
  const total = dailyDetailRows.value.reduce((sum, row) => sum + row.lineTotalTtc, 0)
  return {
    count: dailyDetailRows.value.length,
    total,
  }
})

const refreshAll = () => {
  loadDailyStats()
  loadDailyDetails()
  loadTotalStats()
}

const setToday = () => {
  dailyDate.value = getTodayDate()
  loadDailyStats()
  loadDailyDetails()
}

const handleDailyDateChange = () => {
  loadDailyStats()
  loadDailyDetails()
}

const loadCategories = async () => {
  try {
    categories.value = await getCategories()
  } catch {
    categories.value = []
  }
}

onMounted(async () => {
  await loadPaymentStates()
  loadDailyStats()
  loadDailyDetails()
  loadTotalStats()
  loadCategories()
})
</script>

<template>
  <div class="dashboard animate-fade-in">
    <!-- Header Repensé -->
    <header class="ds-header">
      <div class="ds-header-content">
        <h1 class="ds-title">Bonjour, voici l'état des ventes 👋</h1>
        <p class="ds-subtitle">Connecté aux webservices PrestaShop. Données en temps réel.</p>
      </div>
      <button class="ds-btn ds-btn-refresh" @click="refreshAll" :disabled="dailyLoading || totalLoading">
        <svg :class="['ds-icon', { 'is-spinning': dailyLoading || totalLoading }]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>Rafraîchir</span>
      </button>
    </header>

    <!-- Cartes KPI sous forme de Grid (plus aéré qu'une Strip) -->
    <div class="ds-kpi-grid">
      <!-- KPI 1 -->
      <div class="ds-card kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-title">Commandes Aujourd'hui</span>
          <div class="ds-badge ds-badge-indigo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="ds-icon-sm">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
        </div>
        <div class="kpi-card-body">
          <div v-if="dailyLoading" class="skeleton ds-skeleton-value"></div>
          <div v-else class="kpi-val">{{ dailyStats.count }}</div>
        </div>
      </div>

      <!-- KPI 2 -->
      <div class="ds-card kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-title">Chiffre d'Affaires Jour</span>
          <div class="ds-badge ds-badge-emerald">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="ds-icon-sm">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div class="kpi-card-body">
          <div v-if="dailyLoading" class="skeleton ds-skeleton-value"></div>
          <div v-else class="kpi-val kpi-green">{{ formatCurrency(dailyStats.total) }}</div>
        </div>
      </div>

      <!-- KPI 3 -->
      <div class="ds-card kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-title">Total Commandes</span>
          <div class="ds-badge ds-badge-amber">
            <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>
        <div class="kpi-card-body">
          <div v-if="totalLoading" class="skeleton ds-skeleton-value"></div>
          <div v-else class="kpi-val">{{ totalStats.count }}</div>
        </div>
      </div>

      <!-- KPI 4 -->
      <div class="ds-card kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-card-title">CA Global</span>
          <div class="ds-badge ds-badge-blue">
            <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
        </div>
        <div class="kpi-card-body">
          <div v-if="totalLoading" class="skeleton ds-skeleton-value"></div>
          <div v-else class="kpi-val kpi-blue">{{ formatCurrency(totalStats.total) }}</div>
        </div>
      </div>
    </div>

    <!-- Layout principal : Détails -->
    <div class="ds-main-grid">
      <div class="ds-card detail-card">
        
        <div class="detail-card-header">
          <div class="header-left">
            <h2 class="ds-section-title">Analyse Journalière</h2>
            <span class="ds-pill">{{ detailSummary.count }} ligne(s) produit</span>
          </div>
          <div class="header-right">
            <div class="ds-date-picker-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="calendar-icon">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input type="date" class="ds-input" v-model="dailyDate" @change="handleDailyDateChange" :disabled="dailyLoading" />
            </div>
            <button class="ds-btn ds-btn-outline" @click="setToday" :disabled="dailyLoading">Aujourd'hui</button>
          </div>
        </div>

        <div class="detail-card-body">
          <p v-if="dailyDetailError" class="ds-alert ds-alert-error">{{ dailyDetailError }}</p>

          <!-- Skeleton Loader pour le tableau -->
          <div v-if="dailyDetailLoading" class="ds-table-skeleton">
            <div class="skeleton-row" v-for="i in 5" :key="i"></div>
          </div>

          <!-- Empty State -->
          <div v-else-if="!dailyDetailRows.length" class="ds-empty-state">
            <div class="empty-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3>Aucune donnée trouvée</h3>
            <p>Il n'y a pas de ligne de commande expédiée/payée pour cette journée.</p>
          </div>

          <!-- Tableau Modernisé -->
          <div v-else class="ds-table-container">
            <table class="ds-table">
              <thead>
                <tr>
                  <th>Ref/Cmd</th>
                  <th>Produit</th>
                  <th>Catégorie</th>
                  <th>Qté</th>
                  <th class="text-right">Prix U. (TTC)</th>
                  <th class="text-right">Total (TTC)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in dailyDetailRows" :key="`${row.orderId}-${row.productId}-${idx}`" class="ds-table-row">
                  <td>
                    <span class="ds-txt-bold">#{{ row.orderReference || row.orderId }}</span>
                  </td>
                  <td class="ds-txt-medium">{{ row.productName || 'Produit' }}</td>
                  <td>
                    <span class="ds-category-tag">{{ getCategoryName(row.categoryId) }}</span>
                  </td>
                  <td>
                    <span class="ds-qty-badge">{{ row.quantity }}</span>
                  </td>
                  <td class="text-right ds-txt-muted">{{ formatCurrency(row.unitPriceTtc) }}</td>
                  <td class="text-right ds-txt-bold ds-txt-dark">{{ formatCurrency(row.lineTotalTtc) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Design System (DS) Dashboard ───────────────────── */

.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  max-width: 1400px;
  margin: 0 auto;
}

/* ── Header ─────────────────────────────────────────── */
.ds-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--space-md) 0;
}

.ds-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 var(--space-xs) 0;
  letter-spacing: -0.02em;
}

.ds-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
}

.ds-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.ds-btn-refresh {
  background: var(--surface);
  color: var(--text);
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
}

.ds-btn-refresh:hover:not(:disabled) {
  background: var(--bg);
  border-color: var(--accent);
  color: var(--accent);
}

.ds-btn-outline {
  background: transparent;
  border-color: var(--border);
  color: var(--text-secondary);
}

.ds-icon {
  width: 18px;
  height: 18px;
}

.ds-icon-sm {
  width: 16px;
  height: 16px;
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* ── KPI Grid ───────────────────────────────────────── */
.ds-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg);
}

.ds-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
  transition: box-shadow var(--transition-fast);
}

.ds-card:hover { box-shadow: var(--shadow-md); }

.kpi-card { padding: var(--space-lg); }

.kpi-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.kpi-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.ds-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
}
.ds-badge-indigo { background: var(--accent-light); color: var(--accent); }
.ds-badge-emerald { background: var(--success-light); color: var(--success); }
.ds-badge-amber { background: var(--warning-light); color: var(--warning); }
.ds-badge-blue { background: var(--info-light); color: var(--info); }

.kpi-val { font-size: 28px; font-weight: 800; color: var(--text); }
.kpi-green { color: var(--success); }
.kpi-blue { color: var(--info); }

/* ── Détails & Data Table ───────────────────────────── */
.ds-main-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

.detail-card {
  display: flex;
  flex-direction: column;
}

.detail-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  gap: var(--space-md);
}

.header-left { display: flex; align-items: center; gap: var(--space-md); }

.ds-section-title { font-size: 18px; font-weight: 700; margin: 0; }

.ds-pill {
  font-size: 12px;
  font-weight: 600;
  background: var(--bg);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.header-right { display: flex; align-items: center; gap: var(--space-md); }
.ds-date-picker-wrap { position: relative; display: flex; align-items: center; }

.calendar-icon { position: absolute; left: 12px; width: 16px; height: 16px; color: var(--text-muted); }

.ds-input {
  padding: 9px 12px 9px 36px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 14px;
  color: var(--text);
  background: var(--surface);
}

.ds-input:focus { outline: none; border-color: var(--accent); }

/* Table */
.ds-table-container { overflow-x: auto; }

.ds-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.ds-table th {
  padding: 14px 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.ds-table td {
  padding: 16px 20px;
  font-size: 14px;
  color: var(--text);
  border-bottom: 1px solid var(--border-light);
}

.ds-table-row:last-child td { border-bottom: none; }
.ds-table-row:hover td { background: var(--surface-hover); }

.text-right { text-align: right; }
.ds-txt-bold { font-weight: 700; }
.ds-txt-medium { font-weight: 500; }
.ds-txt-muted { color: var(--text-muted); }
.ds-txt-dark { color: var(--text); }

.ds-category-tag {
  display: inline-block;
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg);
  color: var(--text-secondary);
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
}

.ds-qty-badge {
  display: inline-block;
  min-width: 24px;
  text-align: center;
  padding: 4px;
  font-size: 13px;
  font-weight: 700;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 6px;
}

.ds-alert { margin: var(--space-lg); padding: var(--space-md); border-radius: var(--radius-md); font-weight: 500; }
.ds-alert-error { background: var(--danger-light); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); }

.ds-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(var(--space-xl) * 2);
  text-align: center;
  color: var(--text-muted);
}

.empty-icon-wrap {
  width: 64px;
  height: 64px;
  background: var(--bg);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-md);
  color: var(--text-muted);
}

.empty-icon-wrap svg { width: 32px; height: 32px; }
.ds-empty-state h3 { font-size: 18px; font-weight: 600; color: var(--text); margin: 0 0 var(--space-xs) 0; }

.skeleton-row {
  height: 48px;
  background: var(--bg);
  border-radius: var(--radius-md);
  opacity: 0.7;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}

.animate-fade-in { animation: fadeIn var(--transition-base) forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>