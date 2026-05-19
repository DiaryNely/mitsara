<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCombinationById, getFrontProductById, getProductImageUrl } from '../../services/frontoffice/products'
import { getStockAvailable } from '../../services/frontoffice/stockService'
import { getProductBadge } from '../../utils/productBadge'
import { computePriceTtc, getTaxRateForGroup } from '../../services/frontoffice/taxService'
import { useCart } from '../../composables/front/useCart'

const route = useRoute()
const router = useRouter()

const product = ref(null)
const loading = ref(true)
const error = ref('')
const quantity = ref(1)
const selectedCombination = ref('')
const combinationData = ref(null)
const combinationLoading = ref(false)
const combinationOptions = ref([])
const combinationOptionsLoading = ref(false)
const addMessage = ref('')
const addError = ref('')
const addLoading = ref(false)
const taxRate = ref(0)
const stockAvailable = ref(null)
const stockLoading = ref(false)

const { addItem, hydrate } = useCart()

const formatPrice = (price) => {
  const value = parseFloat(price || 0)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

const sanitizeHtml = (value) => {
  if (!value) {
    return ''
  }
  return String(value).replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
}

const imageUrl = computed(() => {
  if (!product.value) {
    return ''
  }
  return getProductImageUrl(product.value.id, product.value.imageId)
})

const hasCombinations = computed(() => (product.value?.combinationIds || []).length > 0)
const badge = computed(() => getProductBadge(product.value?.dateAvailability))

const displayPrice = computed(() => {
  const base = Number(product.value?.price || 0)
  const impact = Number(combinationData.value?.price || 0)
  const priceHt = base + impact
  return computePriceTtc(priceHt, taxRate.value).toFixed(2)
})

const displayPriceHt = computed(() => {
  const base = Number(product.value?.price || 0)
  const impact = Number(combinationData.value?.price || 0)
  return (base + impact).toFixed(2)
})

const safeDescription = computed(() => sanitizeHtml(product.value?.description || ''))
const stockQuantity = computed(() => {
  if (!stockAvailable.value) {
    return null
  }
  const qty = Number(stockAvailable.value.quantity)
  return Number.isNaN(qty) ? null : qty
})

const loadProduct = async (id) => {
  loading.value = true
  error.value = ''
  selectedCombination.value = ''
  combinationData.value = null
  combinationOptions.value = []
  addMessage.value = ''
  stockAvailable.value = null

  try {
    const result = await getFrontProductById(id)
    if (!result) {
      error.value = 'Produit introuvable.'
      product.value = null
    } else {
      product.value = result
      const [rate] = await Promise.all([
        getTaxRateForGroup(result.taxRulesGroupId),
        loadCombinationOptions(result.combinationIds),
      ])
      taxRate.value = rate
      if (!(result.combinationIds || []).length) {
        await loadStock({ productId: result.id, combinationId: 0 })
      }
    }
  } catch (err) {
    error.value = err?.message || 'Impossible de charger le produit.'
  } finally {
    loading.value = false
  }
}

const loadCombinationOptions = async (comboIds = []) => {
  if (!comboIds.length) {
    combinationOptions.value = []
    return
  }

  combinationOptionsLoading.value = true
  try {
    const entries = await Promise.all(
      comboIds.map(async (comboId) => {
        try {
          const combo = await getCombinationById(comboId)
          const label = combo?.attributeLabel || combo?.reference || `Variante #${comboId}`
          return { id: String(comboId), label }
        } catch (err) {
          return { id: String(comboId), label: `Variante #${comboId}` }
        }
      })
    )
    combinationOptions.value = entries
  } finally {
    combinationOptionsLoading.value = false
  }
}

const loadCombination = async (comboId) => {
  if (!comboId) {
    combinationData.value = null
    return
  }

  combinationLoading.value = true
  try {
    combinationData.value = await getCombinationById(comboId)
  } catch (err) {
    combinationData.value = null
  } finally {
    combinationLoading.value = false
  }
}

const loadStock = async ({ productId, combinationId }) => {
  stockLoading.value = true
  try {
    stockAvailable.value = await getStockAvailable({
      productId,
      combinationId: combinationId || 0,
    })
  } catch (err) {
    stockAvailable.value = null
  } finally {
    stockLoading.value = false
  }
}

const handleAddToCart = async () => {
  if (!product.value) {
    return
  }

  if (hasCombinations.value && !selectedCombination.value) {
    addError.value = 'Selectionnez une variante.'
    return
  }

  addMessage.value = ''
  addError.value = ''
  addLoading.value = true

  try {
    const variantLabel = combinationData.value?.attributeLabel ||
      (selectedCombination.value ? `Variante #${selectedCombination.value}` : '')

    await addItem({
      productId: product.value.id,
      combinationId: selectedCombination.value || 0,
      name: product.value.name,
      reference: product.value.reference,
      price: displayPrice.value,
      taxRate: taxRate.value,
      imageUrl: imageUrl.value,
      variantLabel,
      quantity: quantity.value,
    })

    addMessage.value = 'Produit ajouté au panier.'
  } catch (err) {
    addError.value = err?.message || 'Impossible d\'ajouter au panier.'
  } finally {
    addLoading.value = false
  }
}

const goBack = () => {
  router.push('/front/products')
}

watch(
  () => route.params.id,
  (id) => {
    if (id) {
      loadProduct(id)
    }
  }
)

onMounted(() => {
  hydrate()
  if (route.params.id) {
    loadProduct(route.params.id)
  }
})

watch(selectedCombination, (comboId) => {
  loadCombination(comboId)
  if (!product.value) {
    return
  }
  if (hasCombinations.value) {
    if (!comboId) {
      stockAvailable.value = null
      return
    }
    loadStock({ productId: product.value.id, combinationId: comboId })
    return
  }
  loadStock({ productId: product.value.id, combinationId: 0 })
})
</script>

<template>
  <div class="detail-page">
    <div class="detail-inner">

      <!-- Breadcrumb -->
      <nav class="breadcrumb">
        <button type="button" @click="goBack" class="bc-link">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Catalogue
        </button>
        <span class="bc-sep">/</span>
        <span class="bc-current">{{ product?.name || 'Produit' }}</span>
      </nav>

      <!-- Skeleton -->
      <div v-if="loading" class="detail-skeleton">
        <div class="skel-image"></div>
        <div class="skel-panel">
          <div class="skeleton" style="height:14px;width:80px;border-radius:4px;"></div>
          <div class="skeleton" style="height:32px;width:70%;border-radius:6px;margin-top:12px;"></div>
          <div class="skeleton" style="height:40px;width:40%;border-radius:6px;margin-top:16px;"></div>
          <div class="skeleton" style="height:80px;border-radius:8px;margin-top:24px;"></div>
        </div>
      </div>

      <!-- Erreur -->
      <div v-else-if="error" class="error-banner">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
          <path d="M8 5v4M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        {{ error }}
      </div>

      <!-- Produit -->
      <div v-else-if="product" class="detail-layout">

        <!-- ── Image ── -->
        <div class="detail-media">
          <span v-if="badge" class="detail-badge" :class="`detail-badge--${badge.toLowerCase()}`">{{ badge }}</span>
          <img v-if="imageUrl" :src="imageUrl" :alt="product.name" />
          <div v-else class="media-empty">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.2">
              <rect x="4" y="4" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2"/>
              <path d="M4 32l12-12 8 8 6-6 14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>Image non disponible</span>
          </div>
        </div>

        <!-- ── Panneau infos ── -->
        <div class="detail-panel">
          <span class="detail-ref">Réf. {{ product.reference || product.id }}</span>
          <h1 class="detail-name">{{ product.name || 'Produit sans nom' }}</h1>

          <!-- Prix -->
          <div class="detail-price-block">
            <div class="price-main">{{ formatPrice(displayPrice) }}</div>
            <div class="price-sub">{{ formatPrice(displayPriceHt) }} HT · TVA {{ taxRate }}%</div>
          </div>

          <!-- Stock -->
          <div class="stock-indicator" :class="{
            'stock-ok': stockQuantity !== null && stockQuantity > 0,
            'stock-empty': stockQuantity === 0,
            'stock-unknown': stockQuantity === null
          }">
            <span class="stock-dot"></span>
            <span class="stock-label">
              <template v-if="hasCombinations && !selectedCombination">Sélectionnez une déclinaison</template>
              <template v-else-if="stockLoading">Vérification du stock…</template>
              <template v-else-if="stockQuantity === null">Stock inconnu</template>
              <template v-else-if="stockQuantity === 0">Rupture de stock</template>
              <template v-else>En stock — {{ stockQuantity }} unité{{ stockQuantity > 1 ? 's' : '' }}</template>
            </span>
          </div>

          <!-- Déclinaisons (pills) -->
          <div v-if="hasCombinations" class="combo-section">
            <label class="combo-label">
              Déclinaison
              <span v-if="combinationOptionsLoading" class="combo-loading">Chargement…</span>
            </label>
            <div class="combo-pills">
              <button
                v-for="option in combinationOptions"
                :key="option.id"
                class="combo-pill"
                :class="{ 'combo-pill--active': selectedCombination === option.id }"
                type="button"
                :disabled="combinationLoading || combinationOptionsLoading"
                @click="selectedCombination = option.id"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <!-- Quantité + Panier -->
          <div class="add-section">
            <div class="qty-control">
              <button type="button" class="qty-btn" @click="quantity = Math.max(1, quantity - 1)">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
              <span class="qty-value">{{ quantity }}</span>
              <button type="button" class="qty-btn" @click="quantity += 1">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>

            <button
              class="add-btn"
              type="button"
              :disabled="addLoading || (hasCombinations && !selectedCombination)"
              @click="handleAddToCart"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" v-if="!addLoading">
                <path d="M3 3h2l.35 1.75M7 11h6l2-7H5.35m1.65 7a1.25 1.25 0 100 2.5A1.25 1.25 0 007 11zm6 0a1.25 1.25 0 100 2.5A1.25 1.25 0 0013 11z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ addLoading ? 'Ajout en cours…' : 'Ajouter au panier' }}
            </button>
          </div>

          <!-- Messages retour -->
          <div v-if="addMessage" class="add-success">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.3"/>
              <path d="M4.5 7l2 2 3-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ addMessage }}
          </div>
          <div v-if="addError" class="add-error">{{ addError }}</div>

          <!-- Description -->
          <div class="detail-desc-section" v-if="safeDescription || product.description === ''">
            <h3>Description</h3>
            <div v-if="safeDescription" class="desc-content" v-html="safeDescription"></div>
            <p v-else class="desc-empty">Aucune description disponible pour ce produit.</p>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page ─────────────────────────────────────────── */
.detail-page {
  background: var(--front-bg);
  min-height: calc(100vh - 68px);
}

.detail-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px clamp(16px, 4vw, 48px) 80px;
  display: flex;
  flex-direction: column;
  gap: 28px;
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
  gap: 4px;
  color: var(--front-muted);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  transition: color 150ms ease;
}

.bc-link:hover {
  color: var(--front-accent);
}

.bc-sep {
  color: var(--front-border);
}

.bc-current {
  color: var(--front-text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

/* ── Skeleton ─────────────────────────────────────── */
.detail-skeleton {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.skel-image {
  aspect-ratio: 4/3;
  border-radius: var(--front-radius);
  background: var(--front-surface);
  border: 1px solid var(--front-border);
}

.skel-panel {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 28px;
}

/* ── Layout principal ─────────────────────────────── */
.detail-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: start;
}

/* ── Média ────────────────────────────────────────── */
.detail-media {
  position: relative;
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  overflow: hidden;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--front-shadow);
}

.detail-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--front-muted);
  font-size: 13px;
}

.detail-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: white;
  z-index: 1;
}

.detail-badge--hot { background: var(--danger); }
.detail-badge--new { background: var(--warning); }

/* ── Panneau ──────────────────────────────────────── */
.detail-panel {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 28px 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: var(--front-shadow);
}

.detail-ref {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--front-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: 'SF Mono', monospace;
}

.detail-name {
  font-size: 26px;
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0;
}

/* Prix */
.detail-price-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price-main {
  font-size: 32px;
  font-weight: 800;
  color: var(--front-accent);
  letter-spacing: -0.03em;
  line-height: 1;
}

.price-sub {
  font-size: 13px;
  color: var(--front-muted);
}

/* Stock */
.stock-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--front-border);
  background: var(--front-surface-muted);
  font-size: 13.5px;
  font-weight: 500;
}

.stock-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stock-ok { border-color: rgba(16,185,129,.2); background: rgba(16,185,129,.05); }
.stock-ok .stock-dot { background: var(--success); box-shadow: 0 0 6px rgba(16,185,129,.4); }
.stock-ok .stock-label { color: #065f46; }

.stock-empty { border-color: rgba(239,68,68,.2); background: rgba(239,68,68,.05); }
.stock-empty .stock-dot { background: var(--danger); }
.stock-empty .stock-label { color: var(--danger); }

.stock-unknown .stock-dot { background: var(--front-muted); }
.stock-unknown .stock-label { color: var(--front-muted); }

/* Déclinaisons */
.combo-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.combo-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--front-text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 10px;
}

.combo-loading {
  font-size: 11px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--front-muted);
}

.combo-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.combo-pill {
  padding: 7px 16px;
  border-radius: 999px;
  border: 1.5px solid var(--front-border);
  background: var(--front-surface-muted);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-text);
  cursor: pointer;
  transition: all 150ms ease;
}

.combo-pill:hover:not(:disabled) {
  border-color: var(--front-accent);
  color: var(--front-accent);
  background: var(--front-accent-light);
}

.combo-pill--active {
  background: var(--front-accent) !important;
  border-color: var(--front-accent) !important;
  color: white !important;
  box-shadow: 0 3px 10px rgba(99,102,241,.3);
}

.combo-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Ajout panier */
.add-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.qty-control {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--front-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--front-surface-muted);
}

.qty-btn {
  width: 38px;
  height: 44px;
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

.qty-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--front-text);
  min-width: 36px;
  text-align: center;
}

.add-btn {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 4px 16px rgba(99,102,241,.3);
}

.add-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99,102,241,.4);
}

.add-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

/* Messages */
.add-success {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: rgba(16,185,129,.07);
  color: #065f46;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(16,185,129,.2);
}

.add-error {
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--danger-light);
  color: var(--danger);
  font-size: 13px;
  border-left: 3px solid var(--danger);
}

/* Description */
.detail-desc-section {
  border-top: 1px solid var(--front-border);
  padding-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-desc-section h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.desc-content {
  font-size: 14px;
  color: var(--front-muted);
  line-height: 1.7;
}

.desc-empty {
  font-size: 13.5px;
  color: var(--front-muted);
  font-style: italic;
  margin: 0;
}

/* ── Erreur ───────────────────────────────────────── */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: var(--danger-light);
  color: var(--danger);
  border-radius: var(--front-radius);
  font-size: 13.5px;
  border-left: 3px solid var(--danger);
}

@media (max-width: 860px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }

  .detail-skeleton {
    grid-template-columns: 1fr;
  }

  .detail-media {
    aspect-ratio: 16/9;
  }
}
</style>
