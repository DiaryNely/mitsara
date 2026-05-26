<script setup>
import { computed, onMounted, ref } from 'vue'
import OrdersList from '../../components/orders/OrdersList.vue'
import { BeneficeCard } from '../../components/benefice'
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
    <div class="ds-kpi-grid">
      <BeneficeCard
        label="Total commandes"
        :value="stats.total"
        badgeClass="ds-badge-indigo"
        :isStyleCurrency="false"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </template>
      </BeneficeCard>

      <BeneficeCard
        label="Paiements effectués"
        :value="stats.paid"
        badgeClass="ds-badge-emerald"
        :isStyleCurrency="false"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </template>
      </BeneficeCard>

      <BeneficeCard
        label="Livrées"
        :value="stats.delivered"
        badgeClass="ds-badge-blue"
        :isStyleCurrency="false"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="ds-icon-sm">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </template>
      </BeneficeCard>

      <BeneficeCard
        label="Annulées"
        :value="stats.cancelled"
        badgeClass="ds-badge-red"
        :isStyleCurrency="false"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </template>
      </BeneficeCard>
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
.ds-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg, 24px);
}

@media (max-width: 1024px) {
  .ds-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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

  .ds-kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
