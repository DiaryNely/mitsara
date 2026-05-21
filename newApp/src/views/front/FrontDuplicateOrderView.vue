<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCustomerAuth } from '../../composables/auth/useCustomerAuth'
import { getOrderById, getOrderItemWithStock, duplicateOrder } from '../../services/frontoffice/orderService'
import { getCustomerAddresses } from '../../services/frontoffice/addressService'

const router = useRouter()
const route = useRoute()
const { customer, customerId } = useCustomerAuth()

const orderId = route.params.id
const multiplier = computed(() => Math.max(1, Math.min(999, Number(route.query.nb) || 1)))

const order = ref(null)
const items = ref([])
const loading = ref(true)
const confirming = ref(false)
const error = ref('')

const newQty = (item) => item.quantity * multiplier.value

const itemErrors = computed(() =>
  items.value.filter((item) => !item.productExists || item.stockQty < newQty(item))
)

const hasErrors = computed(() => itemErrors.value.length > 0)

const formatPrice = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(value || 0))

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const [ord, itms] = await Promise.all([
      getOrderById(orderId),
      getOrderItemWithStock(orderId),
    ])
    if (!ord) throw new Error('Commande introuvable.')
    order.value = ord
    items.value = itms
  } catch (err) {
    error.value = err?.message || 'Impossible de charger la commande.'
  } finally {
    loading.value = false
  }
}

const confirm = async () => {
  if (hasErrors.value || confirming.value) return
  confirming.value = true
  error.value = ''

  try {
    let addressId = order.value?.addressId || '0'

    if (!addressId || addressId === '0') {
      const addresses = await getCustomerAddresses(customerId.value)
      addressId = addresses[0]?.id || '0'
    }

    const newOrderId = await duplicateOrder({
      orderId,
      multiplier: multiplier.value,
      customer: customer.value,
      addressId,
    })

    router.push(`/front/orders/${newOrderId}`)
  } catch (err) {
    error.value = err?.message || 'Erreur lors de la duplication.'
  } finally {
    confirming.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="dup-page">
    <div class="dup-inner">

      <!-- En-tête -->
      <div class="dup-header">
        <button class="back-btn" type="button" @click="router.back()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Retour
        </button>
        <div class="header-title">
          <h1>Dupliquer la commande</h1>
          <p v-if="order">
            Commande <strong>{{ order.reference || `#${orderId}` }}</strong>
            &mdash; multiplicateur <strong>&times;{{ multiplier }}</strong>
          </p>
        </div>
      </div>

      <!-- Chargement -->
      <div v-if="loading" class="dup-skeleton">
        <div v-for="n in 3" :key="n" class="item-skeleton">
          <div class="skeleton" style="width:240px;height:14px;border-radius:4px;"></div>
          <div class="skeleton" style="width:80px;height:14px;border-radius:4px;"></div>
          <div class="skeleton" style="width:80px;height:14px;border-radius:4px;"></div>
          <div class="skeleton" style="width:80px;height:14px;border-radius:4px;"></div>
        </div>
      </div>

      <template v-else-if="!error || items.length">

        <!-- Résumé des erreurs de stock -->
        <div v-if="hasErrors" class="error-summary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M8 5.5v3M8 10.5h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <div>
            <strong>{{ itemErrors.length }} produit{{ itemErrors.length > 1 ? 's' : '' }} non disponible{{ itemErrors.length > 1 ? 's' : '' }}</strong>
            <p>Résolvez les problèmes de stock avant de valider la duplication.</p>
          </div>
        </div>

        <!-- Tableau des produits -->
        <div class="items-card">
          <div class="items-header">
            <span>Produit</span>
            <span class="col-center">Qté orig.</span>
            <span class="col-center">Mult.</span>
            <span class="col-center">Nouvelle qté</span>
            <span class="col-center">Stock dispo</span>
            <span class="col-right">Prix unit. TTC</span>
            <span class="col-right">Statut</span>
          </div>

          <div
            v-for="item in items"
            :key="item.id"
            class="item-row"
            :class="{
              'item-error': !item.productExists || item.stockQty < newQty(item),
              'item-ok': item.productExists && item.stockQty >= newQty(item),
            }"
          >
            <div class="item-name-col">
              <span class="item-name">{{ item.name }}</span>
              <span v-if="item.reference" class="item-ref">{{ item.reference }}</span>
            </div>

            <div class="col-center item-qty">{{ item.quantity }}</div>

            <div class="col-center item-mul">&times;&thinsp;{{ multiplier }}</div>

            <div class="col-center item-new-qty">
              <strong>{{ newQty(item) }}</strong>
            </div>

            <div
              class="col-center item-stock"
              :class="{ 'stock-low': item.productExists && item.stockQty < newQty(item) }"
            >
              <template v-if="!item.productExists">
                <span class="stock-unavail">—</span>
              </template>
              <template v-else>{{ item.stockQty }}</template>
            </div>

            <div class="col-right item-price">
              {{ item.productExists ? formatPrice(item.currentPrice) : '—' }}
            </div>

            <div class="col-right item-status">
              <span v-if="!item.productExists" class="badge badge-error">Produit introuvable</span>
              <span v-else-if="item.stockQty < newQty(item)" class="badge badge-error">
                Stock insuffisant
              </span>
              <span v-else class="badge badge-ok">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Disponible
              </span>
            </div>
          </div>
        </div>

        <!-- Récapitulatif totaux (seulement si tout est valide) -->
        <div v-if="!hasErrors && items.length" class="totals-card">
          <div class="totals-row">
            <span>Lignes de produit</span>
            <strong>{{ items.length }}</strong>
          </div>
          <div class="totals-row">
            <span>Quantité totale d'articles</span>
            <strong>{{ items.reduce((s, i) => s + newQty(i), 0) }}</strong>
          </div>
          <div class="totals-row totals-price">
            <span>Total estimé TTC</span>
            <strong>{{ formatPrice(items.reduce((s, i) => s + i.currentPrice * newQty(i), 0)) }}</strong>
          </div>
        </div>

        <!-- Erreur de création -->
        <div v-if="error && items.length" class="error-banner">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.3"/>
            <path d="M7.5 5v4M7.5 10.5h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          {{ error }}
        </div>

        <!-- Actions -->
        <div class="dup-actions">
          <button class="btn-cancel" type="button" @click="router.back()">
            Annuler
          </button>
          <button
            class="btn-confirm"
            type="button"
            :disabled="hasErrors || confirming"
            @click="confirm"
          >
            <svg v-if="confirming" class="spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20" stroke-dashoffset="10"/>
            </svg>
            <svg v-else width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M4 4V2.5A1.5 1.5 0 0 1 5.5 1H10.5A1.5 1.5 0 0 1 12 2.5V7.5A1.5 1.5 0 0 1 10.5 9H9" stroke="currentColor" stroke-width="1.3"/>
            </svg>
            {{ confirming ? 'Création en cours…' : 'Confirmer la duplication' }}
          </button>
        </div>

      </template>

      <!-- Erreur de chargement totale -->
      <div v-else class="load-error">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" opacity=".3"/>
          <path d="M24 16v8M24 28h.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <h3>Impossible de charger la commande</h3>
        <p>{{ error }}</p>
        <button class="btn-cancel" type="button" @click="router.push('/front/orders')">
          Retour aux commandes
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.dup-page {
  background: var(--front-bg);
  min-height: calc(100vh - 68px);
}

.dup-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 36px clamp(16px, 4vw, 48px) 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── En-tête ──────────────────────────────────────── */
.dup-header {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
  flex-shrink: 0;
  margin-top: 4px;
}

.back-btn:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.header-title h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}

.header-title p {
  font-size: 14px;
  color: var(--front-muted);
  margin: 0;
}

/* ── Skeleton ─────────────────────────────────────── */
.dup-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item-skeleton {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
}

/* ── Résumé erreurs ───────────────────────────────── */
.error-summary {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  background: var(--danger-light);
  border: 1px solid var(--danger);
  border-radius: var(--front-radius);
  color: var(--danger);
}

.error-summary strong {
  font-size: 14px;
  font-weight: 700;
}

.error-summary p {
  font-size: 13px;
  margin: 4px 0 0;
  opacity: 0.85;
}

/* ── Tableau produits ─────────────────────────────── */
.items-card {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  overflow: hidden;
}

.items-header {
  display: grid;
  grid-template-columns: 2fr 70px 60px 90px 90px 110px 130px;
  gap: 12px;
  align-items: center;
  padding: 12px 20px;
  background: var(--front-bg);
  border-bottom: 1px solid var(--front-border);
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--front-muted);
}

.item-row {
  display: grid;
  grid-template-columns: 2fr 70px 60px 90px 90px 110px 130px;
  gap: 12px;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--front-border);
  transition: background 120ms ease;
}

.item-row:last-child {
  border-bottom: none;
}

.item-row.item-ok:hover {
  background: var(--front-accent-light);
}

.item-row.item-error {
  background: rgba(239, 68, 68, 0.05);
}

.item-name-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--front-text);
}

.item-ref {
  font-size: 11.5px;
  color: var(--front-muted);
  font-family: 'SF Mono', monospace;
}

.col-center {
  text-align: center;
}

.col-right {
  text-align: right;
}

.item-qty,
.item-mul,
.item-new-qty,
.item-stock {
  font-size: 14px;
  color: var(--front-text);
}

.item-new-qty strong {
  font-size: 15px;
  font-weight: 800;
  color: var(--front-accent);
}

.item-mul {
  color: var(--front-muted);
  font-weight: 600;
}

.stock-low {
  color: var(--danger);
  font-weight: 700;
}

.stock-unavail {
  color: var(--front-muted);
}

.item-price {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--front-text);
}

/* ── Badges ───────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
}

.badge-ok {
  background: #dcfce7;
  color: #16a34a;
}

.badge-error {
  background: var(--danger-light);
  color: var(--danger);
}

/* ── Totaux ───────────────────────────────────────── */
.totals-card {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-self: flex-end;
  min-width: 320px;
}

.totals-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--front-muted);
}

.totals-row strong {
  color: var(--front-text);
  font-weight: 700;
}

.totals-price {
  padding-top: 12px;
  border-top: 1px solid var(--front-border);
  font-size: 16px;
  color: var(--front-text);
  font-weight: 600;
}

.totals-price strong {
  font-size: 20px;
  font-weight: 800;
  color: var(--front-accent);
  letter-spacing: -0.02em;
}

/* ── Erreur banner ────────────────────────────────── */
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

/* ── Actions ──────────────────────────────────────── */
.dup-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  padding: 11px 22px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 14px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-cancel:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.btn-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 26px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.28);
}

.btn-confirm:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn-confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 0.8s linear infinite;
}

/* ── Erreur de chargement ─────────────────────────── */
.load-error {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 60px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  color: var(--front-muted);
}

.load-error h3 {
  font-size: 20px;
  font-weight: 700;
  color: var(--front-text);
  margin: 0;
}

.load-error p {
  font-size: 14px;
  margin: 0;
}

/* ── Responsive ───────────────────────────────────── */
@media (max-width: 900px) {
  .items-header,
  .item-row {
    grid-template-columns: 1fr 80px 130px;
  }

  .items-header span:nth-child(2),
  .items-header span:nth-child(3),
  .items-header span:nth-child(5),
  .items-header span:nth-child(6) {
    display: none;
  }

  .item-qty,
  .item-mul,
  .item-stock,
  .item-price {
    display: none;
  }

  .totals-card {
    min-width: 0;
    align-self: stretch;
  }

  .dup-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .btn-cancel,
  .btn-confirm {
    justify-content: center;
  }
}
</style>
