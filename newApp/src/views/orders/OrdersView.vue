<script setup>
import { computed, onMounted, ref } from 'vue'
import OrdersList from '../../components/orders/OrdersList.vue'
import { getOrdersWithOpenCarts, getOrderStates, resolveOrderStateIdByLabel, updateOrderStatusViaModule } from '../../api/orders'

const orders = ref([])
const orderStates = ref([])
const loading = ref(false)
const error = ref('')
const actionMessage = ref('')
const actionError = ref('')
const updatingIds = ref([])

const statusOptions = [
  { value: 'livre', label: 'Livré' },
  { value: 'annule', label: 'Annulé' },
]

const normalize = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const statusLabelById = computed(() => {
  const map = {}
  orderStates.value.forEach((state) => {
    if (state?.id) {
      map[state.id] = state.name || state.labels?.[0] || ''
    }
  })
  map.cart = 'Dans le panier'
  return map
})

const classifyStatus = (label) => {
  const text = normalize(label)
  const isRemote = text.includes('distance') || text.includes('remote')
  if (text.includes('livr') || text.includes('deliver')) return 'delivered'
  if (text.includes('annul')) return 'cancelled'
  if (text.includes('erreur') || text.includes('echec') || text.includes('refuse')) return 'failed'
  if (!isRemote && text.includes('paiement') && (text.includes('accepte') || text.includes('effectue'))) return 'paid'
  return 'other'
}

const stats = computed(() => {
  const summary = { total: 0, paid: 0, delivered: 0, cancelled: 0 }
  const items = orders.value
  summary.total = items.length

  items.forEach((order) => {
    const label = statusLabelById.value[order.statusId] || ''
    const bucket = classifyStatus(label)
    if (bucket === 'paid') summary.paid += 1
    if (bucket === 'delivered') summary.delivered += 1
    if (bucket === 'cancelled') summary.cancelled += 1
  })

  return summary
})

const loadOrders = async () => {
  loading.value = true
  error.value = ''
  actionMessage.value = ''
  actionError.value = ''

  try {
    const [ordersResult, states] = await Promise.all([
      getOrdersWithOpenCarts(80),
      getOrderStates(),
    ])
    orders.value = ordersResult
    orderStates.value = states
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

const handleUpdateStatus = async ({ orderId, statusValue }) => {
  if (!orderId || !statusValue) return
  if (String(orderId).startsWith('cart-')) return

  actionMessage.value = ''
  actionError.value = ''
  updatingIds.value = [...new Set([...updatingIds.value, orderId])]

  try {
    const stateId = await resolveOrderStateIdByLabel(statusValue)
    if (!stateId) {
      throw new Error(`Etat introuvable pour "${statusValue}".`)
    }

    await updateOrderStatusViaModule(orderId, stateId)

    orders.value = orders.value.map((order) => {
      if (order.id === orderId) {
        return { ...order, statusId: stateId }
      }
      return order
    })

    actionMessage.value = `Etat de la commande #${orderId} mis a jour.`
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  } finally {
    updatingIds.value = updatingIds.value.filter((id) => id !== orderId)
  }
}

onMounted(loadOrders)
</script>

<template>
  <div class="orders-page animate-fade-in">

    <!-- ── En-tête ── -->
    <div class="page-header">
      <div class="page-title-group">
        <h1>Commandes</h1>
        <p class="page-desc">Suivre les ventes et mettre a jour les etats de commande.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn--outline" @click="loadOrders" :disabled="loading" id="reload-orders-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" :class="{ spinning: loading }">
            <path d="M12 7A5 5 0 113.4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M3.5 1.5l.2 2.8L6.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ loading ? 'Chargement...' : 'Actualiser' }}
        </button>
      </div>
    </div>

    <!-- ── Cartes stats ── -->
    <div class="stats-grid">
      <div class="stat-card stat-card--total">
        <div class="stat-card-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M6 7h8M6 10h8M6 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="stat-card-body">
          <span class="stat-card-value">{{ stats.total }}</span>
          <span class="stat-card-label">Total commandes</span>
        </div>
      </div>

      <div class="stat-card stat-card--paid">
        <div class="stat-card-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="stat-card-body">
          <span class="stat-card-value">{{ stats.paid }}</span>
          <span class="stat-card-label">Paiements effectués</span>
        </div>
      </div>

      <div class="stat-card stat-card--delivered">
        <div class="stat-card-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="4" y="5" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="stat-card-body">
          <span class="stat-card-value">{{ stats.delivered }}</span>
          <span class="stat-card-label">Livrées</span>
        </div>
      </div>

      <div class="stat-card stat-card--cancelled">
        <div class="stat-card-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8l4 4M12 8l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="stat-card-body">
          <span class="stat-card-value">{{ stats.cancelled }}</span>
          <span class="stat-card-label">Annulées</span>
        </div>
      </div>
    </div>

    <!-- ── Bannières ── -->
    <div v-if="actionMessage" class="status-banner status-banner--success">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/>
        <path d="M5 7.5l2 2 3.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>{{ actionMessage }}</span>
    </div>

    <div v-if="actionError" class="status-banner status-banner--error">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/>
        <path d="M7.5 5v3.5M7.5 10.5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span>{{ actionError }}</span>
    </div>

    <!-- ── Liste commandes ── -->
    <OrdersList
      :items="orders"
      :status-labels="statusLabelById"
      :status-options="statusOptions"
      :loading="loading"
      :error="error"
      :updating-ids="updatingIds"
      @reload="loadOrders"
      @update-status="handleUpdateStatus"
    />

  </div>
</template>

<style scoped>
.orders-page {
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

/* ── Cartes stats ─────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-fast);
}

.stat-card:hover {
  box-shadow: var(--shadow-md);
}

.stat-card-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card--total .stat-card-icon {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.stat-card--paid .stat-card-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.stat-card--cancelled .stat-card-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.stat-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-card-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.03em;
  line-height: 1;
}

.stat-card-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Bannières ────────────────────────────────────────── */
.status-banner {
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: 3px solid currentColor;
}

.status-banner--success {
  background: var(--success-light);
  color: var(--success);
}

.status-banner--error {
  background: var(--danger-light);
  color: var(--danger);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
