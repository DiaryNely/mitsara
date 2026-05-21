<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCustomerAuth } from '../../composables/auth/useCustomerAuth'
import { getCustomerOrders, getOrderStateMap } from '../../services/frontoffice/orderService'

const router = useRouter()
const { customerId } = useCustomerAuth()

const orders = ref([])
const stateMap = ref({})
const loading = ref(false)
const error = ref('')

const openDuplicateId = ref(null)
const nbDuplications = ref(1)

const PAGE_SIZE = 20
const currentPage = ref(1)
const hasMore = ref(false)

const formatPrice = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(value || 0))

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

const toggleDuplicatePanel = (orderId) => {
  if (openDuplicateId.value === orderId) {
    openDuplicateId.value = null
  } else {
    openDuplicateId.value = orderId
    nbDuplications.value = 1
  }
}

const closeDuplicatePanel = () => {
  openDuplicateId.value = null
}

const goToDuplicateConfirm = (orderId) => {
  const nb = Math.max(1, Math.min(999, Number(nbDuplications.value) || 1))
  router.push(`/front/orders/${orderId}/duplicate?nb=${nb}`)
}

const loadOrders = async (page = 1) => {
  loading.value = true
  error.value = ''
  try {
    const [list, states] = await Promise.all([
      getCustomerOrders(customerId.value, { page, pageSize: PAGE_SIZE }),
      getOrderStateMap(),
    ])
    orders.value = list
    stateMap.value = states
    currentPage.value = page
    hasMore.value = list.length === PAGE_SIZE
  } catch (err) {
    error.value = err?.message || 'Impossible de charger les commandes.'
  } finally {
    loading.value = false
  }
}

onMounted(() => loadOrders(1))
</script>

<template>
  <div class="orders-page">
    <div class="orders-inner">

      <!-- En-tête -->
      <div class="orders-header">
        <div>
          <h1>Mes commandes</h1>
          <p>Consultez l'historique et l'état de vos achats.</p>
        </div>
        <button class="btn-catalog" type="button" @click="router.push('/front/products')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="2" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.3"/>
            <rect x="8" y="2" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.3"/>
            <rect x="2" y="8" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.3"/>
            <rect x="8" y="8" width="4" height="4" rx="1" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          Catalogue
        </button>
      </div>

      <!-- Erreur -->
      <div v-if="error" class="error-banner">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.3"/>
          <path d="M7.5 5v4M7.5 10.5h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        {{ error }}
      </div>

      <!-- Skeleton -->
      <div v-if="loading" class="orders-list">
        <div v-for="n in 4" :key="n" class="order-skeleton">
          <div class="skeleton" style="width:80px;height:14px;border-radius:4px;"></div>
          <div class="skeleton" style="width:200px;height:14px;border-radius:4px;"></div>
          <div class="skeleton" style="width:80px;height:22px;border-radius:999px;"></div>
          <div class="skeleton" style="width:60px;height:18px;border-radius:4px;"></div>
        </div>
      </div>

      <!-- Vide -->
      <div v-else-if="!orders.length && currentPage === 1" class="orders-empty">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="6" y="10" width="36" height="28" rx="5" stroke="currentColor" stroke-width="2"/>
            <path d="M6 20h36" stroke="currentColor" stroke-width="2"/>
            <path d="M16 32h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h3>Aucune commande</h3>
        <p>Vous n'avez pas encore passé de commande.</p>
        <button class="btn-primary" type="button" @click="router.push('/front/products')">
          Découvrir le catalogue
        </button>
      </div>

      <!-- Liste -->
      <div v-else class="orders-list">
        <template v-for="order in orders" :key="order.id">
          <article
            class="order-card"
            @click="router.push(`/front/orders/${order.id}`)"
          >
            <!-- Référence & date -->
            <div class="order-id-col">
              <span class="order-ref">{{ order.reference || `#${order.id}` }}</span>
              <span class="order-sub">ID {{ order.id }}</span>
            </div>

            <!-- Date -->
            <div class="order-date-col">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="3" width="10" height="9" rx="2" stroke="currentColor" stroke-width="1.2"/>
                <path d="M5 2v2M9 2v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M2 6h10" stroke="currentColor" stroke-width="1.2"/>
              </svg>
              {{ formatDate(order.dateAdd) }}
            </div>

            <!-- Statut -->
            <div class="order-state-col">
              <span class="order-state">
                {{ stateMap[order.currentState] || `État ${order.currentState}` }}
              </span>
            </div>

            <!-- Total -->
            <div class="order-total-col">
              {{ formatPrice(order.totalPaid) }}
            </div>

            <!-- Actions -->
            <div class="order-action-col">
              <button class="details-btn" type="button" @click.stop="router.push(`/front/orders/${order.id}`)">
                Détails
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M3 6.5h7M7 3.5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
              <button
                class="dup-toggle-btn"
                type="button"
                :class="{ active: openDuplicateId === order.id }"
                @click.stop="toggleDuplicatePanel(order.id)"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M4 4V2.5A1.5 1.5 0 0 1 5.5 1H10.5A1.5 1.5 0 0 1 12 2.5V7.5A1.5 1.5 0 0 1 10.5 9H9" stroke="currentColor" stroke-width="1.3"/>
                </svg>
                Dupliquer
              </button>
            </div>
          </article>

          <!-- Panneau de duplication (hors du grid article) -->
          <div
            v-if="openDuplicateId === order.id"
            class="duplicate-panel"
            @click.stop
          >
            <div class="dup-panel-inner">
              <div class="dup-info">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M4 4V2.5A1.5 1.5 0 0 1 5.5 1H10.5A1.5 1.5 0 0 1 12 2.5V7.5A1.5 1.5 0 0 1 10.5 9H9" stroke="currentColor" stroke-width="1.3"/>
                </svg>
                <span class="dup-label">Multiplicateur de quantité</span>
                <span class="dup-hint">Les quantités de chaque produit seront multipliées par ce nombre.</span>
              </div>
              <div class="dup-controls">
                <div class="dup-input-wrap">
                  <span class="dup-input-prefix">×</span>
                  <input
                    type="number"
                    class="dup-input"
                    v-model.number="nbDuplications"
                    min="1"
                    max="999"
                    @click.stop
                  />
                </div>
                <button class="dup-btn-validate" type="button" @click.stop="goToDuplicateConfirm(order.id)">
                  Vérifier et valider
                </button>
                <button class="dup-btn-cancel" type="button" @click.stop="closeDuplicatePanel()">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Pagination -->
      <div v-if="!loading && (currentPage > 1 || hasMore)" class="pagination">
        <button
          class="page-btn"
          type="button"
          :disabled="currentPage <= 1"
          @click="loadOrders(currentPage - 1)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Précédent
        </button>
        <span class="page-info">Page {{ currentPage }}</span>
        <button
          class="page-btn"
          type="button"
          :disabled="!hasMore"
          @click="loadOrders(currentPage + 1)"
        >
          Suivant
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.orders-page {
  background: var(--front-bg);
  min-height: calc(100vh - 68px);
}

.orders-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 36px clamp(16px, 4vw, 48px) 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── En-tête ──────────────────────────────────────── */
.orders-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.orders-header h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 5px;
}

.orders-header p {
  font-size: 14px;
  color: var(--front-muted);
  margin: 0;
}

.btn-catalog {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-catalog:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

/* ── Erreur ───────────────────────────────────────── */
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--danger-light);
  color: var(--danger);
  border-radius: var(--front-radius);
  font-size: 13.5px;
  border-left: 3px solid var(--danger);
}

/* ── Skeleton ─────────────────────────────────────── */
.order-skeleton {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
}

/* ── Vide ─────────────────────────────────────────── */
.orders-empty {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 60px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.empty-icon {
  color: var(--front-muted);
  opacity: 0.35;
}

.orders-empty h3 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.orders-empty p {
  font-size: 14px;
  color: var(--front-muted);
  margin: 0;
}

.btn-primary {
  padding: 11px 24px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  margin-top: 4px;
  box-shadow: 0 4px 14px rgba(99,102,241,.28);
}

.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* ── Liste ────────────────────────────────────────── */
.orders-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.order-card {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto auto;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: var(--shadow-xs);
}

.order-card:hover {
  border-color: var(--front-accent);
  box-shadow: var(--front-shadow);
  transform: translateX(2px);
}

.order-id-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.order-ref {
  font-size: 15px;
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.01em;
  font-family: 'SF Mono', monospace;
}

.order-sub {
  font-size: 11.5px;
  color: var(--front-muted);
}

.order-date-col {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--front-muted);
}

.order-state-col {
  display: flex;
}

.order-state {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--front-accent-light);
  color: var(--front-accent);
  white-space: nowrap;
}

.order-total-col {
  font-size: 16px;
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.02em;
  text-align: right;
}

.order-action-col {
  display: flex;
  align-items: center;
  gap: 6px;
}

.details-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: transparent;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.details-btn:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
  background: var(--front-accent-light);
}

.dup-toggle-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: transparent;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.dup-toggle-btn:hover,
.dup-toggle-btn.active {
  border-color: var(--front-accent);
  color: var(--front-accent);
  background: var(--front-accent-light);
}

/* ── Panneau de duplication ───────────────────────── */
.duplicate-panel {
  background: var(--front-surface);
  border: 1px solid var(--front-accent);
  border-top: none;
  border-radius: 0 0 var(--front-radius) var(--front-radius);
  padding: 16px 20px;
  margin-top: -4px;
}

.dup-panel-inner {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.dup-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--front-muted);
  flex: 1;
  min-width: 200px;
}

.dup-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--front-text);
}

.dup-hint {
  font-size: 12px;
  color: var(--front-muted);
}

.dup-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.dup-input-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--front-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--front-bg);
}

.dup-input-prefix {
  padding: 0 10px;
  font-size: 15px;
  font-weight: 700;
  color: var(--front-accent);
  background: var(--front-accent-light);
  line-height: 36px;
  height: 36px;
  display: flex;
  align-items: center;
}

.dup-input {
  width: 64px;
  height: 36px;
  padding: 0 10px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
  background: transparent;
  outline: none;
  text-align: center;
}

.dup-input::-webkit-inner-spin-button,
.dup-input::-webkit-outer-spin-button {
  opacity: 1;
}

.dup-btn-validate {
  padding: 8px 18px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 3px 10px rgba(99,102,241,.25);
  white-space: nowrap;
}

.dup-btn-validate:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.dup-btn-cancel {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.dup-btn-cancel:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-light);
}

/* ── Pagination ───────────────────────────────────── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.page-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-text);
  cursor: pointer;
  transition: all 150ms ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--front-muted);
  font-weight: 600;
}

@media (max-width: 768px) {
  .order-card {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto auto;
  }

  .order-date-col {
    grid-column: 1;
  }

  .order-state-col {
    grid-column: 1;
  }

  .order-total-col {
    grid-row: 1;
    grid-column: 2;
    align-self: start;
    text-align: right;
  }

  .order-action-col {
    grid-column: 2;
    grid-row: 2 / 4;
    align-self: center;
    justify-self: end;
    flex-direction: column;
  }

  .dup-panel-inner {
    flex-direction: column;
    align-items: flex-start;
  }

  .dup-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
