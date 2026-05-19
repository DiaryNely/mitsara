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

    <!-- ── En-tête ── -->
    <div class="page-header">
      <div class="page-title-group">
        <h1>Tableau de bord</h1>
        <p class="page-desc">Suivi des commandes via les webservices PrestaShop.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn--outline" type="button" @click="refreshAll" :disabled="dailyLoading || totalLoading">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" :class="{ spinning: dailyLoading || totalLoading }">
            <path d="M12 7A5 5 0 113.4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M3.5 1.5l.2 2.8L6.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ dailyLoading || totalLoading ? 'Actualisation...' : 'Actualiser' }}
        </button>
      </div>
    </div>

    <!-- ── Bande KPI ── -->
    <div class="kpi-strip animate-fade-in-up" style="animation-delay: 80ms;">
      <!-- Commandes du jour -->
      <div class="kpi-block kpi-block--orders">
        <div class="kpi-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2.5" y="2.5" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 7h8M5 10h8M5 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-label">Commandes du jour</span>
          <span v-if="dailyLoading" class="kpi-value skeleton" style="width:52px;height:30px;"></span>
          <span v-else class="kpi-value">{{ dailyStats.count }}</span>
        </div>
      </div>

      <div class="kpi-sep"></div>

      <!-- CA du jour -->
      <div class="kpi-block kpi-block--revenue">
        <div class="kpi-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2v14M12.5 5.5C12.5 4.12 10.99 3 9 3S5.5 4.12 5.5 5.5 7.01 8 9 8s3.5 1.12 3.5 2.5S10.99 13 9 13s-3.5-1.12-3.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-label">CA du jour</span>
          <span v-if="dailyLoading" class="kpi-value skeleton" style="width:100px;height:30px;"></span>
          <span v-else class="kpi-value kpi-value--money">{{ formatCurrency(dailyStats.total) }}</span>
        </div>
      </div>

      <div class="kpi-sep"></div>

      <!-- Total commandes -->
      <div class="kpi-block kpi-block--total">
        <div class="kpi-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2L2 7v9h14V7L9 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M6.5 16v-5h5v5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-label">Total commandes</span>
          <span v-if="totalLoading" class="kpi-value skeleton" style="width:52px;height:30px;"></span>
          <span v-else class="kpi-value">{{ totalStats.count }}</span>
        </div>
      </div>

      <div class="kpi-sep"></div>

      <!-- CA global -->
      <div class="kpi-block kpi-block--global">
        <div class="kpi-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 12.5l3.5-4 2.5 2.5 3.5-4.5L15 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-label">CA global</span>
          <span v-if="totalLoading" class="kpi-value skeleton" style="width:100px;height:30px;"></span>
          <span v-else class="kpi-value kpi-value--money">{{ formatCurrency(totalStats.total) }}</span>
        </div>
      </div>
    </div>

    <!-- Erreurs globales -->
    <p v-if="dailyError" class="inline-error">{{ dailyError }}</p>
    <p v-if="totalError" class="inline-error">{{ totalError }}</p>

    <!-- ── Section détail ── -->
    <div class="period-section animate-fade-in-up" style="animation-delay: 160ms;">

      <!-- Toolbar période -->
      <div class="period-toolbar">
        <div class="period-info">
          <h2>Détail journalier</h2>
          <p class="period-desc">Lignes produits des commandes pour la date sélectionnée.</p>
        </div>
        <div class="period-controls">
          <input
            class="date-input"
            type="date"
            v-model="dailyDate"
            @change="handleDailyDateChange"
            :disabled="dailyLoading"
          />
          <button class="btn btn--ghost" type="button" @click="setToday" :disabled="dailyLoading">
            Aujourd'hui
          </button>
        </div>
      </div>

      <!-- Barre de résumé -->
      <div class="detail-summary-bar">
        <span class="dsb-count">{{ detailSummary.count }} ligne{{ detailSummary.count !== 1 ? 's' : '' }}</span>
      </div>

      <p v-if="dailyDetailError" class="inline-error">{{ dailyDetailError }}</p>

      <!-- Skeleton -->
      <div v-if="dailyDetailLoading" class="detail-skeleton">
        <div class="skeleton" style="width: 100%; height: 14px;"></div>
        <div class="skeleton" style="width: 91%; height: 14px;"></div>
        <div class="skeleton" style="width: 85%; height: 14px;"></div>
        <div class="skeleton" style="width: 95%; height: 14px;"></div>
      </div>

      <!-- Vide -->
      <div v-else-if="!dailyDetailRows.length" class="detail-empty">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" opacity="0.3">
          <rect x="4" y="4" width="24" height="24" rx="4" stroke="currentColor" stroke-width="2"/>
          <path d="M10 12h12M10 16h12M10 20h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>Aucune ligne de commande pour cette date.</p>
      </div>

      <!-- Table -->
      <div v-else class="detail-table-wrapper">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Commande</th>
              <th>Produit</th>
              <th>Categorie</th>
              <th>Quantite</th>
              <th>Prix TTC</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in dailyDetailRows" :key="`${row.orderId}-${row.productId}-${idx}`">
              <td><span class="order-ref">#{{ row.orderReference || row.orderId }}</span></td>
              <td class="cell-product">{{ row.productName || 'Produit' }}</td>
              <td>{{ getCategoryName(row.categoryId) }}</td>
              <td><span class="qty-pill">{{ row.quantity }}</span></td>
              <td>{{ formatCurrency(row.unitPriceTtc) }}</td>
              <td class="cell-total">{{ formatCurrency(row.lineTotalTtc) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Dashboard shell ─────────────────────────────────── */
.dashboard {
  max-width: 1280px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── En-tête ─────────────────────────────────────────── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-title-group h1 {
  margin-bottom: 4px;
}

.page-desc {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 600;
  transition: all var(--transition-fast);
  white-space: nowrap;
  border: 1px solid transparent;
}

.btn--outline {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
  box-shadow: var(--shadow-xs);
}

.btn--outline:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent);
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

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

/* ── Bande KPI ───────────────────────────────────────── */
.kpi-strip {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  align-items: stretch;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.kpi-block {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  transition: background var(--transition-fast);
}

.kpi-block:hover {
  background: var(--bg);
}

.kpi-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-block--orders .kpi-icon {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.kpi-block--revenue .kpi-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.kpi-block--total .kpi-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.kpi-block--global .kpi-icon {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.kpi-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.kpi-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.kpi-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.03em;
  line-height: 1;
}

.kpi-value--money {
  font-size: 20px;
}

.kpi-sep {
  width: 1px;
  background: var(--border-light);
  margin: 12px 0;
}

/* ── Section période ─────────────────────────────────── */
.period-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.period-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-light);
}

.period-info h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 3px;
}

.period-desc {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 0;
}

.period-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.date-input {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  min-width: 150px;
  transition: border-color var(--transition-fast);
}

.date-input:focus {
  outline: none;
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-light);
}

/* ── Barre résumé ─────────────────────────────────────── */
.detail-summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 24px;
  background: var(--bg);
  border-bottom: 1px solid var(--border-light);
}

.dsb-count {
  font-size: 12.5px;
  color: var(--text-muted);
  font-weight: 500;
}

.dsb-total {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--accent);
}

/* ── États detail ─────────────────────────────────────── */
.detail-skeleton {
  display: grid;
  gap: 10px;
  padding: 20px 24px;
}

.detail-empty {
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13.5px;
}

.detail-empty p {
  margin: 0;
}

/* ── Table ────────────────────────────────────────────── */
.detail-table-wrapper {
  overflow-x: auto;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.detail-table thead {
  background: var(--bg);
  position: sticky;
  top: 0;
}

.detail-table th {
  padding: 10px 16px;
  text-align: left;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.detail-table td {
  padding: 11px 16px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
}

.detail-table tbody tr:last-child td {
  border-bottom: none;
}

.detail-table tbody tr:hover td {
  background: var(--bg);
}

.order-ref {
  font-weight: 600;
  color: var(--accent);
  font-family: 'SF Mono', monospace;
  font-size: 12px;
}

.cell-product {
  font-weight: 500;
  color: var(--text);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-total {
  font-weight: 700;
  color: var(--text);
}

.qty-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 2px 8px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

/* ── Erreurs ──────────────────────────────────────────── */
.inline-error {
  font-size: 12.5px;
  color: var(--danger);
  padding: 10px 14px;
  background: var(--danger-light);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--danger);
}

/* ── Responsive ──────────────────────────────────────── */
@media (max-width: 1024px) {
  .kpi-strip {
    grid-template-columns: 1fr 1fr;
  }

  .kpi-sep {
    display: none;
  }

  .kpi-block--orders,
  .kpi-block--total {
    border-right: 1px solid var(--border-light);
  }

  .kpi-block--orders,
  .kpi-block--revenue {
    border-bottom: 1px solid var(--border-light);
  }
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .period-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .kpi-strip {
    grid-template-columns: 1fr;
  }

  .kpi-block--orders,
  .kpi-block--total {
    border-right: none;
    border-bottom: 1px solid var(--border-light);
  }

  .kpi-block--global {
    border-bottom: none;
  }
}
</style>
