<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FrontProductCard from '../../components/front/FrontProductCard.vue'
import { getFrontCategories } from '../../services/frontoffice/categories'
import { getFrontProducts, getProductImageUrl } from '../../services/frontoffice/products'
import { computePriceTtc, getTaxRateForGroup } from '../../services/frontoffice/taxService'
import { useCart } from '../../composables/front/useCart'
import { getProductBadge } from '../../utils/productBadge'

const products = ref([])
const loading = ref(true)
const error = ref('')
const searchTerm = ref('')
const sortBy = ref('featured')
const router = useRouter()
const categories = ref([])
const categoryId = ref('')
const priceMin = ref('')
const priceMax = ref('')

const DEFAULT_FILTERS = {
  criteria: {
    name: '',
    categoryId: '',
    priceMin: '',
    priceMax: '',
  },
}

const filterState = ref({ ...DEFAULT_FILTERS })

const PAGE_SIZE = 24
const currentPage = ref(1)
const totalPages = ref(null)
const totalProducts = ref(null)

const route = useRoute()
const { addItem, hydrate } = useCart()

const logProductBadges = (items) => {
  if (!import.meta.env.DEV) {
    return
  }

  const rows = items.map((item) => ({
    id: item.id,
    name: item.name,
    dateAvailability: item.dateAvailability,
    badge: getProductBadge(item.dateAvailability),
  }))

  console.table(rows)
}

const normalizeValue = (value) => String(value || '').trim()

const buildCriteria = () => ({
  name: normalizeValue(searchTerm.value),
  categoryId: normalizeValue(categoryId.value),
  priceMin: normalizeValue(priceMin.value),
  priceMax: normalizeValue(priceMax.value),
})

const handleApplyFilters = (payload) => {
  filterState.value = { ...filterState.value, ...payload }
  currentPage.value = 1
  loadProducts(1)
}

const handleResetFilters = () => {
  searchTerm.value = ''
  categoryId.value = ''
  priceMin.value = ''
  priceMax.value = ''
  filterState.value = { ...DEFAULT_FILTERS }
  currentPage.value = 1
  loadProducts(1)
}

const resolveSort = () => {
  switch (sortBy.value) {
    case 'price-asc':
      return { field: 'price', direction: 'ASC' }
    case 'price-desc':
      return { field: 'price', direction: 'DESC' }
    case 'name-asc':
      return { field: 'name', direction: 'ASC' }
    default:
      return null
  }
}

const loadProducts = async (page = currentPage.value) => {
  loading.value = true
  error.value = ''

  try {
    const result = await getFrontProducts({
      page,
      pageSize: PAGE_SIZE,
      filters: filterState.value.criteria,
      sort: resolveSort(),
      withTotal: true,
    })
    logProductBadges(result.items)
    const enriched = await Promise.all(
      result.items.map(async (item) => {
        const taxRate = await getTaxRateForGroup(item.taxRulesGroupId)
        const priceTtc = computePriceTtc(item.price, taxRate)
        return {
          ...item,
          taxRate,
          priceTtc,
          imageUrl: getProductImageUrl(item.id, item.imageId),
        }
      })
    )
    products.value = enriched
    currentPage.value = page
    totalProducts.value = result.total
    totalPages.value = result.totalPages
  } catch (err) {
    error.value = err?.message || 'Impossible de charger les produits.'
  } finally {
    loading.value = false
  }
}

const goToPage = (page) => {
  if (page < 1 || (totalPages.value && page > totalPages.value)) return
  loadProducts(page)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const loadCategories = async () => {
  try {
    categories.value = await getFrontCategories()
  } catch {
    categories.value = []
  }
}

const handleAdd = (product) => {
  if ((product.combinationIds || []).length > 0) {
    router.push(`/front/products/${product.id}`)
    return
  }

  addItem({
    productId: product.id,
    combinationId: 0,
    name: product.name,
    reference: product.reference,
    price: product.priceTtc || product.price,
    taxRate: product.taxRate || 0,
    imageUrl: product.imageUrl,
    quantity: 1,
  })
}

const stats = computed(() => {
  const total = products.value.length
  const prices = products.value.map((item) => parseFloat(item.priceTtc || item.price || 0))
  const avg = total ? (prices.reduce((sum, value) => sum + value, 0) / total) : 0
  return {
    total,
    avg: avg.toFixed(2),
  }
})

let filterTimer = null
const scheduleReload = () => {
  if (filterTimer) clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    handleApplyFilters({ criteria: buildCriteria() })
  }, 350)
}

watch([searchTerm, categoryId, priceMin, priceMax, sortBy], scheduleReload)

onMounted(() => {
  hydrate()
  // Initialiser le champ de recherche depuis ?q= (venant du header)
  if (route.query.q) {
    searchTerm.value = String(route.query.q)
  }
  loadProducts()
  loadCategories()
})
</script>

<template>
  <div class="catalog">

    <!-- ── Hero ── -->
    <section class="catalog-hero">
      <div class="hero-inner">
        <div class="hero-eyebrow">
          <span class="eyebrow-dot"></span>
          Collection 2026
        </div>
        <h1 class="hero-title">Notre catalogue</h1>
        <p class="hero-sub">Explorez notre sélection de produits PrestaShop — qualité premium, disponibilité en temps réel.</p>
        <div class="hero-tags">
          <span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Livraison 48h
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Stock en temps réel
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Paiement sécurisé
          </span>
        </div>
      </div>
    </section>

    <!-- ── Barre de filtres ── -->
    <div class="filters-bar">
      <div class="filters-inner">
        <div class="filter-fields">
          <label class="filter-field">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M10 10l2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <input
              v-model="searchTerm"
              type="search"
              placeholder="Nom du produit…"
            />
          </label>

          <label class="filter-field">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <select v-model="categoryId">
              <option value="">Toutes catégories</option>
              <option v-for="category in categories" :key="category.id" :value="category.id">
                {{ category.name || `Catégorie #${category.id}` }}
              </option>
            </select>
          </label>

          <label class="filter-field filter-field--sm">
            <span class="filter-label">Min €</span>
            <input v-model="priceMin" type="number" min="0" step="0.01" placeholder="0" />
          </label>

          <label class="filter-field filter-field--sm">
            <span class="filter-label">Max €</span>
            <input v-model="priceMax" type="number" min="0" step="0.01" placeholder="∞" />
          </label>
        </div>

        <div class="filter-controls">
          <select class="sort-select" v-model="sortBy">
            <option value="featured">En vedette</option>
            <option value="price-asc">Prix ↑</option>
            <option value="price-desc">Prix ↓</option>
            <option value="name-asc">Nom A–Z</option>
          </select>
          <button class="filter-reset" type="button" @click="handleResetFilters">
            Réinitialiser
          </button>
          <button class="filter-apply" type="button" @click="handleApplyFilters({ criteria: buildCriteria() })">
            Rechercher
          </button>
        </div>
      </div>

      <!-- Résultat count -->
      <div v-if="!loading && totalProducts !== null" class="results-bar">
        <span>{{ totalProducts }} produit{{ totalProducts !== 1 ? 's' : '' }} trouvé{{ totalProducts !== 1 ? 's' : '' }}</span>
        <span v-if="totalPages && totalPages > 1" class="results-page">Page {{ currentPage }} / {{ totalPages }}</span>
      </div>
    </div>

    <!-- ── Erreur ── -->
    <div v-if="error" class="error-banner">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
        <path d="M8 5v4M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      {{ error }}
    </div>

    <!-- ── Skeleton ── -->
    <div v-if="loading" class="product-grid">
      <div v-for="n in 8" :key="n" class="skeleton-card"></div>
    </div>

    <!-- ── Grille produits ── -->
    <div v-else class="product-grid">
      <FrontProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
        @add="handleAdd"
      />
    </div>

    <!-- ── Pagination ── -->
    <div v-if="totalPages && totalPages > 1" class="pagination">
      <button
        class="page-btn"
        type="button"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Précédent
      </button>
      <div class="page-dots">
        <button
          v-for="p in Math.min(totalPages, 7)"
          :key="p"
          class="page-dot"
          :class="{ 'page-dot--active': p === currentPage }"
          type="button"
          @click="goToPage(p)"
        >
          {{ p }}
        </button>
      </div>
      <button
        class="page-btn"
        type="button"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        Suivant
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

  </div>
</template>

<style scoped>
.catalog {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Hero ─────────────────────────────────────────── */
.catalog-hero {
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 60%, #ede9fe 100%);
  border-bottom: 1px solid var(--front-border);
  padding: 60px clamp(16px, 4vw, 48px) 48px;
}

.hero-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 640px;
}

.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--front-accent);
}

.eyebrow-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--front-accent);
}

.hero-title {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0;
}

.hero-sub {
  font-size: 15px;
  color: var(--front-muted);
  line-height: 1.65;
  margin: 0;
}

.hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-tags span {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(99,102,241,0.08);
  color: var(--front-accent);
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(99,102,241,0.15);
}

/* ── Filtres ──────────────────────────────────────── */
.filters-bar {
  background: var(--front-surface);
  border-bottom: 1px solid var(--front-border);
  position: sticky;
  top: 68px;
  z-index: 30;
  box-shadow: 0 2px 12px rgba(15,23,42,0.04);
}

.filters-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 14px clamp(16px, 4vw, 48px);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-fields {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  flex-wrap: wrap;
}

.filter-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--front-surface-muted);
  border: 1px solid var(--front-border);
  color: var(--front-muted);
  transition: all 150ms ease;
  min-width: 160px;
  flex: 1;
}

.filter-field:focus-within {
  border-color: var(--front-accent);
  box-shadow: 0 0 0 3px var(--front-accent-light);
  background: var(--front-surface);
  color: var(--front-text);
}

.filter-field--sm {
  min-width: 90px;
  max-width: 110px;
  flex: 0 0 auto;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.filter-field input,
.filter-field select {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  width: 100%;
  color: var(--front-text);
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sort-select {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface-muted);
  font-size: 13px;
  color: var(--front-text);
  cursor: pointer;
}

.filter-reset {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
}

.filter-reset:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.filter-apply {
  padding: 8px 18px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
}

.filter-apply:hover {
  filter: brightness(1.1);
}

.results-bar {
  max-width: 1280px;
  margin: 0 auto;
  padding: 8px clamp(16px, 4vw, 48px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
  color: var(--front-muted);
  border-top: 1px solid var(--front-border);
}

.results-page {
  font-weight: 600;
}

/* ── Erreur ───────────────────────────────────────── */
.error-banner {
  margin: 20px clamp(16px, 4vw, 48px);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--danger-light);
  color: var(--danger);
  border-radius: var(--front-radius);
  font-size: 13.5px;
  border-left: 3px solid var(--danger);
}

/* ── Grille ───────────────────────────────────────── */
.product-grid {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 48px);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  width: 100%;
}

.skeleton-card {
  height: 360px;
  border-radius: var(--front-radius);
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  position: relative;
  overflow: hidden;
}

.skeleton-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.04) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* ── Pagination ───────────────────────────────────── */
.pagination {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 clamp(16px, 4vw, 48px) 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
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

.page-dots {
  display: flex;
  gap: 4px;
}

.page-dot {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-dot:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.page-dot--active {
  background: var(--front-accent);
  border-color: var(--front-accent);
  color: white;
}

@media (max-width: 768px) {
  .filter-fields {
    gap: 6px;
  }

  .filter-field {
    min-width: 140px;
  }

  .page-dots {
    display: none;
  }
}
</style>
