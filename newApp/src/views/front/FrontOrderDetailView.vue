<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getOrderById,
  getOrderDetails,
  getOrderHistories,
  getOrderStateMap,
} from '../../services/frontoffice/orderService'

const route = useRoute()
const router = useRouter()

const order = ref(null)
const details = ref([])
const histories = ref([])
const stateMap = ref({})
const loading = ref(false)
const error = ref('')

const total = computed(() => {
  return details.value.reduce((sum, item) => sum + Number(item.total || 0), 0)
})

const formatPrice = (price) => {
  const value = Number(price || 0)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

const loadOrder = async () => {
  const orderId = route.params.id
  if (!orderId) {
    return
  }

  loading.value = true
  error.value = ''
  try {
    const [orderData, detailData, historyData, states] = await Promise.all([
      getOrderById(orderId),
      getOrderDetails(orderId),
      getOrderHistories(orderId),
      getOrderStateMap(),
    ])

    order.value = orderData
    details.value = detailData
    histories.value = historyData
    stateMap.value = states
  } catch (err) {
    error.value = err?.message || 'Impossible de charger la commande.'
  } finally {
    loading.value = false
  }
}

onMounted(loadOrder)
</script>

<template>
  <div class="order-detail-page">
    <div class="order-detail-inner">

      <!-- Breadcrumb -->
      <nav class="breadcrumb">
        <button type="button" class="bc-link" @click="router.push('/front/orders')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Mes commandes
        </button>
        <span class="bc-sep">/</span>
        <span class="bc-current">{{ order?.reference || `#${route.params.id}` }}</span>
      </nav>

      <!-- Erreur -->
      <div v-if="error" class="error-banner">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.3"/>
          <path d="M7.5 5v4M7.5 10.5h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        {{ error }}
      </div>

      <!-- Skeleton -->
      <div v-else-if="loading" class="detail-skeleton">
        <div class="skel-hero"></div>
        <div class="skel-body">
          <div class="skel-panel"></div>
          <div class="skel-panel"></div>
        </div>
      </div>

      <template v-else>

        <!-- Hero commande -->
        <div class="order-hero">
          <div class="order-hero-left">
            <div class="order-ref-group">
              <h1>{{ order?.reference || `Commande #${route.params.id}` }}</h1>
              <span class="order-id-badge">ID {{ route.params.id }}</span>
            </div>
            <div class="order-state-pill">
              <span class="state-dot"></span>
              {{ stateMap[order?.currentState] || `État ${order?.currentState}` }}
            </div>
          </div>
          <div class="order-hero-right">
            <div class="order-total-display">
              <span class="total-label">Total payé</span>
              <span class="total-value">{{ formatPrice(total) }}</span>
            </div>
          </div>
        </div>

        <!-- Corps -->
        <div class="order-body">

          <!-- Produits -->
          <section class="order-section">
            <h2 class="section-title">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 6l6-4 6 4v8l-6 4-6-4V6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M3 6l6 3m0 0l6-3m-6 3v8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Produits commandés
            </h2>

            <div class="products-list">
              <div v-if="!details.length" class="empty-section">
                <p>Aucun produit dans cette commande.</p>
              </div>
              <div v-for="item in details" :key="item.id" class="product-row">
                <div class="product-row-info">
                  <span class="product-name">{{ item.name }}</span>
                  <span class="product-qty">× {{ item.quantity }}</span>
                </div>
                <span class="product-price">{{ formatPrice(item.total) }}</span>
              </div>
              <div class="products-total">
                <span>Total</span>
                <span>{{ formatPrice(total) }}</span>
              </div>
            </div>
          </section>

          <!-- Historique -->
          <section class="order-section">
            <h2 class="section-title">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>
                <path d="M9 5v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Historique des états
            </h2>

            <div v-if="!histories.length" class="empty-section">
              <p>Aucun historique disponible.</p>
            </div>

            <div v-else class="timeline">
              <div v-for="(history, idx) in histories" :key="history.id" class="timeline-item">
                <div class="timeline-marker" :class="{ 'timeline-marker--first': idx === 0 }">
                  <svg v-if="idx === 0" width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  <div v-else class="marker-dot"></div>
                </div>
                <div class="timeline-connector" v-if="idx < histories.length - 1"></div>
                <div class="timeline-content">
                  <span class="timeline-state">{{ stateMap[history.stateId] || history.stateId }}</span>
                  <span class="timeline-date">{{ history.dateAdd }}</span>
                </div>
              </div>
            </div>
          </section>

        </div>

      </template>
    </div>
  </div>
</template>

<style scoped>
/* ── Page ─────────────────────────────────────────── */
.order-detail-page {
  background: var(--front-bg);
  min-height: calc(100vh - 68px);
}

.order-detail-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 48px) 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Breadcrumb ───────────────────────────────────── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.bc-link {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--front-muted);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  transition: color 150ms ease;
}

.bc-link:hover { color: var(--front-accent); }

.bc-sep { color: var(--front-border); }

.bc-current {
  font-weight: 600;
  color: var(--front-text);
  font-family: 'SF Mono', monospace;
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
.detail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.skel-hero {
  height: 110px;
  border-radius: var(--front-radius);
  background: var(--front-surface);
  border: 1px solid var(--front-border);
}

.skel-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.skel-panel {
  height: 240px;
  border-radius: var(--front-radius);
  background: var(--front-surface);
  border: 1px solid var(--front-border);
}

/* ── Hero ─────────────────────────────────────────── */
.order-hero {
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 60%, #ede9fe 100%);
  border: 1px solid rgba(99,102,241,.15);
  border-radius: var(--front-radius);
  padding: 24px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.order-hero-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-ref-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.order-ref-group h1 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  font-family: 'SF Mono', monospace;
}

.order-id-badge {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(99,102,241,.12);
  color: var(--front-accent);
  font-size: 12px;
  font-weight: 600;
}

.order-state-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--front-accent);
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--front-accent);
  box-shadow: 0 0 6px rgba(99,102,241,.5);
  animation: pulse 2s ease-in-out infinite;
}

.order-hero-right {
  text-align: right;
}

.order-total-display {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.total-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--front-muted);
}

.total-value {
  font-size: 30px;
  font-weight: 800;
  color: var(--front-accent);
  letter-spacing: -0.03em;
}

/* ── Corps ────────────────────────────────────────── */
.order-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

.order-section {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
  padding: 16px 20px;
  border-bottom: 1px solid var(--front-border);
  background: var(--front-surface-muted);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-title svg {
  color: var(--front-accent);
}

/* Produits */
.products-list {
  display: flex;
  flex-direction: column;
}

.product-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--front-border);
  transition: background 150ms ease;
}

.product-row:hover {
  background: var(--front-surface-muted);
}

.product-row:last-of-type {
  border-bottom: none;
}

.product-row-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.product-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--front-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-qty {
  font-size: 12px;
  font-weight: 700;
  color: var(--front-accent);
  background: var(--front-accent-light);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.product-price {
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
  white-space: nowrap;
}

.products-total {
  display: flex;
  justify-content: space-between;
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 800;
  color: var(--front-text);
  background: var(--front-surface-muted);
  border-top: 1.5px solid var(--front-border);
}

.empty-section {
  padding: 28px 20px;
  text-align: center;
}

.empty-section p {
  font-size: 13.5px;
  color: var(--front-muted);
  margin: 0;
}

/* Timeline historique */
.timeline {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-item {
  display: flex;
  gap: 14px;
  position: relative;
}

.timeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.timeline-marker > div,
.timeline-marker > svg {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--front-surface-muted);
  border: 1.5px solid var(--front-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--front-muted);
}

.timeline-marker--first > div,
.timeline-marker--first > svg {
  background: var(--front-accent);
  border-color: var(--front-accent);
  color: white;
}

.marker-dot {
  width: 8px !important;
  height: 8px !important;
  border-radius: 50% !important;
  background: var(--front-muted) !important;
  border: none !important;
  margin: 7px;
}

.timeline-connector {
  width: 1.5px;
  flex: 1;
  background: var(--front-border);
  margin: 4px auto;
  min-height: 20px;
}

.timeline-content {
  padding-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.timeline-state {
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
}

.timeline-date {
  font-size: 12px;
  color: var(--front-muted);
}

@media (max-width: 768px) {
  .order-body {
    grid-template-columns: 1fr;
  }

  .skel-body {
    grid-template-columns: 1fr;
  }

  .order-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .order-hero-right {
    text-align: left;
  }
}
</style>
