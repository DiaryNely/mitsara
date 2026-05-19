<script setup>
import { onMounted, ref, computed } from 'vue'
import ProductList from '../../components/products/ProductList.vue'
import ProductFilter from '../../components/products/ProductFilter.vue'
import { getProducts } from '../../api/products'

const products = ref([])
const rawXml = ref('')
const loading = ref(false)
const error = ref('')

const page = ref(1)
const hasMore = ref(false)

const DEFAULT_FILTERS = {
  criteria: {
    name: '',
    reference: '',
    categoryId: '',
    active: '',
    visibility: '',
    priceMin: '',
    priceMax: '',
  },
  sort: {
    field: 'id',
    direction: 'ASC',
  },
  pageSize: 25,
}

const filterState = ref({ ...DEFAULT_FILTERS })

const stats = computed(() => {
  const items = products.value
  const total = items.length
  const active = items.filter((p) => parseFloat(p.price) > 0).length
  const prices = items.map((p) => parseFloat(p.price) || 0)
  const avg = total > 0 ? (prices.reduce((a, b) => a + b, 0) / total).toFixed(2) : '0.00'
  return { total, active, avg, filtered: total }
})

const loadProducts = async (options = {}) => {
  loading.value = true
  error.value = ''
  products.value = []
  rawXml.value = ''

  const nextPage = options.page || page.value

  try {
    const result = await getProducts({
      filters: filterState.value.criteria,
      page: nextPage,
      pageSize: filterState.value.pageSize,
      sort: filterState.value.sort,
    })
    products.value = result.items
    rawXml.value = result.rawXml
    page.value = result.page
    hasMore.value = result.hasMore
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

const handleApplyFilters = async (payload) => {
  filterState.value = { ...filterState.value, ...payload }
  page.value = 1
  await loadProducts({ page: 1 })
}

const handleResetFilters = async (payload) => {
  filterState.value = { ...DEFAULT_FILTERS, ...payload }
  page.value = 1
  await loadProducts({ page: 1 })
}

const goPrev = async () => {
  if (page.value <= 1) {
    return
  }
  page.value -= 1
  await loadProducts({ page: page.value })
}

const goNext = async () => {
  if (!hasMore.value) {
    return
  }
  page.value += 1
  await loadProducts({ page: page.value })
}

onMounted(loadProducts)
</script>

<template>
  <div class="products-page animate-fade-in">
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h1>Produits</h1>
        <p class="page-desc">Gérer le catalogue de produits PrestaShop.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn--outline" @click="loadProducts" :disabled="loading" id="reload-products-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" :class="{ spinning: loading }">
            <path d="M14 8A6 6 0 114.8 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M5 1l-.2 3.5L8.3 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ loading ? 'Chargement...' : 'Actualiser' }}
        </button>
      </div>
    </div>

    <ProductFilter @apply="handleApplyFilters" @reset="handleResetFilters" />

    <!-- Stats Row -->
    <div class="mini-stats">
      <div class="mini-stat">
        <span class="mini-stat-value">{{ stats.total }}</span>
        <span class="mini-stat-label">Total</span>
      </div>
      <div class="mini-stat-sep"></div>
      <div class="mini-stat">
        <span class="mini-stat-value" style="color: var(--success);">{{ stats.active }}</span>
        <span class="mini-stat-label">Actifs</span>
      </div>
      <div class="mini-stat-sep"></div>
      <div class="mini-stat">
        <span class="mini-stat-value" style="color: var(--info);">{{ stats.avg }} €</span>
        <span class="mini-stat-label">Prix moyen</span>
      </div>
      <div class="mini-stat-sep"></div>
      <div class="mini-stat">
        <span class="mini-stat-value" style="color: var(--accent);">{{ stats.filtered }}</span>
        <span class="mini-stat-label">Affichés</span>
      </div>
    </div>


    <!-- Product List -->
    <ProductList
      :items="products"
      :raw-xml="rawXml"
      :loading="loading"
      :error="error"
      @reload="loadProducts"
    />

    <div class="pagination">
      <button class="btn btn--outline" type="button" @click="goPrev" :disabled="loading || page <= 1">
        Page precedente
      </button>
      <span class="pagination-info">Page {{ page }}</span>
      <button class="btn btn--outline" type="button" @click="goNext" :disabled="loading || !hasMore">
        Page suivante
      </button>
    </div>
  </div>
</template>

<style scoped>
.products-page {
  max-width: 1200px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.page-header h1 {
  margin-bottom: 4px;
}

.page-desc {
  font-size: 15px;
}

.page-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 600;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn--outline {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  box-shadow: var(--shadow-xs);
}

.btn--outline:hover:not(:disabled) {
  background: var(--bg);
  border-color: var(--accent-border);
  color: var(--accent);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

/* Mini Stats */
.mini-stats {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 18px;
  box-shadow: var(--shadow-xs);
}

.mini-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.mini-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.mini-stat-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.mini-stat-sep {
  width: 1px;
  height: 24px;
  background: var(--border);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}

.pagination-info {
  font-size: 12.5px;
  color: var(--text-muted);
  font-weight: 600;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }
  .mini-stats {
    flex-wrap: wrap;
    gap: 12px;
  }
  .mini-stat-sep {
    display: none;
  }
  .pagination {
    flex-direction: column;
    gap: 10px;
  }
}
</style>
