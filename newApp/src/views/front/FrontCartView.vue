<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCart } from '../../composables/front/useCart'
import { computePriceHt } from '../../services/frontoffice/taxService'

const router = useRouter()
const { items, subtotal, hydrate, updateQuantity, removeItem, clearCart } = useCart()

const subtotalTtc = computed(() =>
  items.value.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0)
)
const subtotalHt = computed(() =>
  items.value.reduce((sum, item) => {
    const unitHt = computePriceHt(item.price, item.taxRate || 0)
    return sum + unitHt * item.quantity
  }, 0)
)
const total = computed(() => subtotalTtc.value)

const formatPrice = (price) => {
  const value = Number(price || 0)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

const handleCheckout = () => {
  router.push('/front/checkout')
}

onMounted(() => {
  hydrate()
})
</script>

<template>
  <div class="cart-page">
    <div class="cart-inner">

      <!-- En-tête -->
      <div class="cart-header">
        <div>
          <h1>Mon panier</h1>
          <p>{{ items.length }} article{{ items.length !== 1 ? 's' : '' }}</p>
        </div>
        <div class="cart-header-actions">
          <button class="btn-back" type="button" @click="router.push('/front/products')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Continuer les achats
          </button>
          <button class="btn-clear" type="button" @click="clearCart({ deleteRemote: true })" :disabled="!items.length">
            Vider
          </button>
        </div>
      </div>

      <!-- Panier vide -->
      <div v-if="!items.length" class="cart-empty">
        <div class="empty-icon">
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <path d="M8 10h6l1.2 5.6M10 32h32l6-19H15.2m-5.2 19L15.2 15.6m0 0h29.6M20 44a4 4 0 100 8 4 4 0 000-8zm20 0a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3>Votre panier est vide</h3>
        <p>Découvrez notre catalogue et ajoutez des produits à votre panier.</p>
        <button class="btn-primary" type="button" @click="router.push('/front/products')">
          Explorer le catalogue
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div v-else class="cart-layout">

        <!-- ── Articles ── -->
        <div class="cart-items">
          <article v-for="item in items" :key="item.key" class="cart-item">
            <!-- Image -->
            <div class="item-thumb">
              <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.name" />
              <div v-else class="thumb-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity="0.3">
                  <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M2 15l6-6 4 4 3-3 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>

            <!-- Info -->
            <div class="item-info">
              <h3 class="item-name">{{ item.name }}</h3>
              <p class="item-variant" v-if="item.variantLabel || item.reference">
                {{ item.variantLabel || item.reference }}
              </p>
              <p class="item-unit">{{ formatPrice(item.price) }} / unité</p>
            </div>

            <!-- Quantité -->
            <div class="item-qty">
              <button type="button" class="qty-btn" @click="updateQuantity(item.key, item.quantity - 1)">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
              </button>
              <input
                type="number"
                min="1"
                :value="item.quantity"
                @input="updateQuantity(item.key, $event.target.value)"
              />
              <button type="button" class="qty-btn" @click="updateQuantity(item.key, item.quantity + 1)">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
              </button>
            </div>

            <!-- Prix + Supprimer -->
            <div class="item-right">
              <div class="item-total">{{ formatPrice(Number(item.price) * item.quantity) }}</div>
              <div class="item-ht">{{ formatPrice(computePriceHt(item.price, item.taxRate || 0) * item.quantity) }} HT</div>
              <button class="item-remove" type="button" @click="removeItem(item.key)" title="Supprimer">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </article>
        </div>

        <!-- ── Récapitulatif ── -->
        <aside class="cart-summary">
          <h3 class="summary-title">Récapitulatif</h3>

          <div class="summary-lines">
            <div class="summary-line">
              <span>Sous-total TTC</span>
              <span>{{ formatPrice(subtotalTtc) }}</span>
            </div>
            <div class="summary-line">
              <span>Sous-total HT</span>
              <span>{{ formatPrice(subtotalHt) }}</span>
            </div>
            <div class="summary-line">
              <span>Livraison</span>
              <span class="free-badge">Gratuit</span>
            </div>
          </div>

          <div class="summary-total">
            <span>Total TTC</span>
            <span>{{ formatPrice(total) }}</span>
          </div>

          <button class="checkout-btn" type="button" @click="handleCheckout">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 5l7-3 5 2.5V11l-5 2.5L2 11V5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M9 2.5v11" stroke="currentColor" stroke-width="1.4"/>
            </svg>
            Valider la commande
          </button>

          <p class="summary-note">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2a4 4 0 100 8A4 4 0 006 2zM6 5v2M6 8.5h.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Paiement à la livraison uniquement
          </p>
        </aside>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page ─────────────────────────────────────────── */
.cart-page {
  background: var(--front-bg);
  min-height: calc(100vh - 68px);
}

.cart-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 36px clamp(16px, 4vw, 48px) 80px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── En-tête ──────────────────────────────────────── */
.cart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.cart-header h1 {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
}

.cart-header p {
  font-size: 14px;
  color: var(--front-muted);
  margin: 0;
}

.cart-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-back:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.btn-clear {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(239,68,68,.25);
  background: rgba(239,68,68,.04);
  font-size: 13px;
  font-weight: 600;
  color: var(--danger);
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-clear:hover:not(:disabled) {
  background: rgba(239,68,68,.1);
}

.btn-clear:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Vide ─────────────────────────────────────────── */
.cart-empty {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 60px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.empty-icon {
  color: var(--front-muted);
  opacity: 0.4;
}

.cart-empty h3 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.cart-empty p {
  font-size: 14px;
  color: var(--front-muted);
  margin: 0;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 4px 16px rgba(99,102,241,.3);
  margin-top: 4px;
}

.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* ── Layout ───────────────────────────────────────── */
.cart-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 24px;
  align-items: start;
}

/* ── Articles ─────────────────────────────────────── */
.cart-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cart-item {
  display: grid;
  grid-template-columns: 88px 1fr auto auto;
  gap: 16px;
  align-items: center;
  padding: 16px;
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  box-shadow: var(--shadow-xs);
  transition: box-shadow 150ms ease;
}

.cart-item:hover {
  box-shadow: var(--front-shadow);
}

.item-thumb {
  width: 88px;
  height: 88px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--front-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  color: var(--front-muted);
}

.item-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-name {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--front-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-variant {
  font-size: 12px;
  color: var(--front-accent);
  font-weight: 500;
  margin: 0;
}

.item-unit {
  font-size: 12px;
  color: var(--front-muted);
  margin: 0;
}

.item-qty {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1.5px solid var(--front-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--front-surface-muted);
}

.qty-btn {
  width: 34px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--front-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
}

.qty-btn:hover {
  background: var(--front-accent-light);
  color: var(--front-accent);
}

.item-qty input {
  width: 40px;
  border: none;
  text-align: center;
  background: transparent;
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
  outline: none;
}

.item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.item-total {
  font-size: 16px;
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.02em;
}

.item-ht {
  font-size: 11px;
  color: var(--front-muted);
}

.item-remove {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--front-surface-muted);
  border: 1px solid var(--front-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--front-muted);
  cursor: pointer;
  margin-top: 4px;
  transition: all 150ms ease;
}

.item-remove:hover {
  background: var(--danger-light);
  border-color: rgba(239,68,68,.25);
  color: var(--danger);
}

/* ── Récapitulatif ────────────────────────────────── */
.cart-summary {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 88px;
  box-shadow: var(--front-shadow);
}

.summary-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.summary-lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  font-size: 13.5px;
  color: var(--front-muted);
}

.free-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--success);
  background: rgba(16,185,129,.1);
  padding: 2px 8px;
  border-radius: 999px;
}

.summary-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  border-top: 1.5px solid var(--front-border);
  font-size: 17px;
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.01em;
}

.checkout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 50px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 15px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 4px 16px rgba(99,102,241,.3);
}

.checkout-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99,102,241,.4);
}

.summary-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--front-muted);
  text-align: center;
  justify-content: center;
  margin: 0;
}

@media (max-width: 960px) {
  .cart-layout {
    grid-template-columns: 1fr;
  }

  .cart-summary {
    position: static;
  }

  .cart-item {
    grid-template-columns: 72px 1fr;
    grid-template-rows: auto auto;
  }

  .item-thumb {
    width: 72px;
    height: 72px;
    grid-row: span 2;
  }

  .item-qty,
  .item-right {
    grid-column: 2;
    align-self: auto;
  }
}
</style>
