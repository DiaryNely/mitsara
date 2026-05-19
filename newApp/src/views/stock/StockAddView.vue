<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { getProducts } from '../../api/products'
import { getStockAvailable, getAllStockAvailables, getProductCombinations } from '../../api/stock'
import { addStock, MOVEMENT_TYPES } from '../../services/stock/stockService'
import { useAuthStore } from '../../stores/auth/auth'
import { ANONYMOUS_EMPLOYEE_FIRSTNAME, ANONYMOUS_EMPLOYEE_LASTNAME } from '../../config/guestUser'

const authStore = useAuthStore()

// ─── Liste produits ───────────────────────────────────────────────────────────
const products     = ref([])
const listLoading  = ref(false)
const listError    = ref('')
const page         = ref(1)
const hasMore      = ref(false)
const PAGE_SIZE    = 20

const filterQuery  = ref('')
const filterActive = ref('')   // '' | '1' | '0'

let debounceTimer = null

async function loadProducts(opts = {}) {
  listLoading.value = true
  listError.value   = ''

  const targetPage = opts.page ?? page.value

  try {
    const q = filterQuery.value.trim()
    const result = await getProducts({
      filters: {
        name:   q || undefined,
        active: filterActive.value !== '' ? filterActive.value : undefined,
      },
      page:     targetPage,
      pageSize: PAGE_SIZE,
      sort:     { field: 'id', direction: 'ASC' },
    })

    // Charger le stock de chaque produit en parallèle
    const withStock = await Promise.all(
      result.items.map(async (p) => {
        const stock = await getStockAvailable(p.id, 0)
        return { ...p, quantity: stock?.quantity ?? 0 }
      })
    )

    products.value = withStock
    hasMore.value  = result.hasMore
    page.value     = targetPage
  } catch (err) {
    listError.value = err?.message || 'Erreur lors du chargement des produits.'
  } finally {
    listLoading.value = false
  }
}

function onFilterInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    page.value = 1
    loadProducts({ page: 1 })
  }, 350)
}

function onFilterActiveChange() {
  page.value = 1
  loadProducts({ page: 1 })
}

function prevPage() {
  if (page.value <= 1) return
  loadProducts({ page: page.value - 1 })
}

function nextPage() {
  if (!hasMore.value) return
  loadProducts({ page: page.value + 1 })
}

onMounted(() => {
  loadProducts({ page: 1 })
  employeeName.value = authStore.employeeFullName ||
    `${ANONYMOUS_EMPLOYEE_FIRSTNAME} ${ANONYMOUS_EMPLOYEE_LASTNAME}`
})

// ─── Produit sélectionné ──────────────────────────────────────────────────────
const selectedProduct     = ref(null)
const combinations        = ref([])
const combinationsLoading = ref(false)
const allStocks           = ref([])
const selectedAttrId      = ref('0')
const currentStock        = ref(null)

async function selectProduct(product) {
  if (selectedProduct.value?.id === product.id) return

  selectedProduct.value = product
  combinations.value    = []
  selectedAttrId.value  = '0'
  currentStock.value    = null
  submitError.value     = ''
  successInfo.value     = null
  resetForm()

  combinationsLoading.value = true
  try {
    const [combs, stocks] = await Promise.all([
      getProductCombinations(product.id),
      getAllStockAvailables(product.id),
    ])
    combinations.value = combs
    allStocks.value    = stocks

    const baseStock = stocks.find((s) => s.id_product_attribute === '0')
    currentStock.value = baseStock || stocks[0] || null
  } catch (err) {
    submitError.value = err?.message || 'Erreur lors du chargement.'
  } finally {
    combinationsLoading.value = false
  }
}

watch(selectedAttrId, (attrId) => {
  if (!allStocks.value.length) return
  currentStock.value =
    allStocks.value.find((s) => String(s.id_product_attribute) === String(attrId)) || null
})

function clearSelection() {
  selectedProduct.value = null
  combinations.value    = []
  allStocks.value       = []
  currentStock.value    = null
  selectedAttrId.value  = '0'
  submitError.value     = ''
  successInfo.value     = null
  resetForm()
}

// ─── Formulaire ───────────────────────────────────────────────────────────────
const delta        = ref('')
const movementType = ref('supply')
const comment      = ref('')
const employeeName = ref('')
const submitting   = ref(false)
const submitError  = ref('')
const successInfo  = ref(null)

const hasCombinations = computed(() => combinations.value.length > 0)
const currentQty      = computed(() => currentStock.value?.quantity ?? '—')

const selectedCombinationLabel = computed(() => {
  if (!selectedAttrId.value || selectedAttrId.value === '0') return null
  const c = combinations.value.find((c) => String(c.id) === String(selectedAttrId.value))
  return c ? `Déclinaison #${c.id}${c.reference ? ` — ${c.reference}` : ''}` : null
})

const formValid = computed(() => {
  const d = parseInt(delta.value, 10)
  return selectedProduct.value && !isNaN(d) && d !== 0 && movementType.value
})

function resetForm() {
  delta.value        = ''
  movementType.value = 'supply'
  comment.value      = ''
  employeeName.value = ''
}

async function handleSubmit() {
  if (!formValid.value) return

  submitting.value  = true
  submitError.value = ''
  successInfo.value = null

  try {
    const result = await addStock({
      product:           selectedProduct.value,
      attributeId:       selectedAttrId.value !== '0' ? selectedAttrId.value : 0,
      delta:             parseInt(delta.value, 10),
      movementType:      movementType.value,
      comment:           comment.value,
      employeeId:        authStore.employee?.id        || 0,
      employeeFirstname: authStore.employee?.firstname || ANONYMOUS_EMPLOYEE_FIRSTNAME,
      employeeLastname:  authStore.employee?.lastname  || ANONYMOUS_EMPLOYEE_LASTNAME,
    })

    successInfo.value = result

    // Rafraîchir le stock dans la liste et dans le panneau
    const updated = await getStockAvailable(
      selectedProduct.value.id,
      selectedAttrId.value !== '0' ? selectedAttrId.value : 0
    )
    if (updated) {
      currentStock.value = updated
      // Mettre à jour la quantité dans la liste sans recharger toute la page
      const idx = products.value.findIndex((p) => String(p.id) === String(selectedProduct.value.id))
      if (idx !== -1) {
        products.value[idx] = { ...products.value[idx], quantity: updated.quantity }
      }
      selectedProduct.value = { ...selectedProduct.value, quantity: updated.quantity }
    }

    resetForm()
  } catch (err) {
    submitError.value = err?.message || 'Erreur lors de la mise à jour du stock.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="stock-add-page animate-fade-in">

    <!-- En-tête -->
    <div class="page-header">
      <div>
        <h1>Ajout de Stock</h1>
        <p class="page-desc">Sélectionnez un produit dans la liste, choisissez une déclinaison et ajustez le stock.</p>
      </div>
    </div>

    <div class="layout">

      <!-- ── Colonne gauche : liste produits ──────────────────────────────── -->
      <div class="list-col">
        <div class="card list-card">

          <!-- Filtres inline -->
          <div class="list-filters">
            <div class="search-wrap">
              <input
                v-model="filterQuery"
                class="input search-input"
                placeholder="Nom…"
                @input="onFilterInput"
              />
              <svg class="search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4"/>
                <path d="M10.5 10.5l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </div>
            <select v-model="filterActive" class="input select status-filter" @change="onFilterActiveChange">
              <option value="">Tous</option>
              <option value="1">Actifs</option>
              <option value="0">Inactifs</option>
            </select>
            <button class="btn btn--icon" @click="loadProducts({ page: 1 })" :disabled="listLoading" title="Actualiser">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" :class="{ spinning: listLoading }">
                <path d="M13 7.5A5.5 5.5 0 114 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M4 1.5l.2 3L7 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <!-- État chargement / erreur -->
          <div v-if="listLoading && !products.length" class="list-loading">
            <span class="spinner-dark"></span>
            <span>Chargement…</span>
          </div>
          <p v-else-if="listError" class="text-error">{{ listError }}</p>

          <!-- Liste -->
          <ul v-else-if="products.length" class="product-list">
            <li
              v-for="p in products"
              :key="p.id"
              class="product-item"
              :class="{
                selected: selectedProduct?.id === p.id,
                loading:  listLoading,
              }"
              @click="selectProduct(p)"
            >
              <div class="item-main">
                <span class="item-name">{{ p.name }}</span>
                <code class="item-ref">{{ p.reference || '—' }}</code>
              </div>
              <div class="item-right">
                <span class="qty-badge" :class="p.quantity > 0 ? 'qty-ok' : 'qty-zero'">
                  {{ p.quantity }}
                </span>
                <span class="status-dot" :class="p.active ? 'active' : 'inactive'"></span>
              </div>
            </li>
          </ul>

          <div v-else class="list-empty">Aucun produit trouvé.</div>

          <!-- Pagination -->
          <div class="list-pagination">
            <button class="btn btn--outline btn--sm" @click="prevPage" :disabled="listLoading || page <= 1">
              ‹
            </button>
            <span class="page-info">Page {{ page }}</span>
            <button class="btn btn--outline btn--sm" @click="nextPage" :disabled="listLoading || !hasMore">
              ›
            </button>
          </div>
        </div>
      </div>

      <!-- ── Colonne droite : sélection + formulaire ──────────────────────── -->
      <div class="form-col">

        <!-- Placeholder si rien sélectionné -->
        <div v-if="!selectedProduct" class="placeholder-card">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity="0.25">
            <path d="M8 28l8-8 6 6 8-8 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="4" y="4" width="32" height="32" rx="4" stroke="currentColor" stroke-width="2"/>
          </svg>
          <p>Sélectionnez un produit dans la liste pour ajuster son stock.</p>
        </div>

        <template v-else>

          <!-- Info produit sélectionné -->
          <div class="card product-card">
            <div class="product-card-header">
              <div class="product-info">
                <div class="product-name">{{ selectedProduct.name }}</div>
                <div class="product-meta">
                  <span class="item-id">#{{ selectedProduct.id }}</span>
                  <code class="ref">{{ selectedProduct.reference || '—' }}</code>
                  <span class="status-dot" :class="selectedProduct.active ? 'active' : 'inactive'">
                    {{ selectedProduct.active ? 'Actif' : 'Inactif' }}
                  </span>
                  <span v-if="selectedCombinationLabel" class="comb-label">{{ selectedCombinationLabel }}</span>
                </div>
              </div>
              <button class="btn btn--outline btn--sm" @click="clearSelection">
                Désélectionner
              </button>
            </div>

            <!-- Déclinaisons -->
            <div v-if="combinationsLoading" class="loading-line">Chargement des déclinaisons…</div>
            <div v-else-if="hasCombinations" class="field">
              <label class="label">Déclinaison</label>
              <select v-model="selectedAttrId" class="input select">
                <option value="0">Sans déclinaison</option>
                <option v-for="c in combinations" :key="c.id" :value="String(c.id)">
                  Déclinaison #{{ c.id }}{{ c.reference ? ` — ${c.reference}` : '' }}
                </option>
              </select>
            </div>

            <!-- Stock actuel -->
            <div class="stock-current">
              <span class="stock-label">Stock actuel</span>
              <span class="stock-value" :class="{ 'qty-zero-big': currentQty === 0 }">
                {{ currentQty }}
                <span v-if="typeof currentQty === 'number'" class="unit">unités</span>
              </span>
              <span v-if="!currentStock && !combinationsLoading" class="text-warn">
                Stock introuvable pour cette déclinaison.
              </span>
            </div>
          </div>

          <!-- Succès -->
          <div v-if="successInfo" class="alert alert--success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Stock mis à jour :
            <strong>{{ successInfo.quantityBefore }}</strong> →
            <strong>{{ successInfo.quantityAfter }}</strong>
            ({{ successInfo.delta > 0 ? '+' : '' }}{{ successInfo.delta }})
          </div>

          <!-- Formulaire -->
          <div class="card form-card">
            <div class="card-title">Ajustement de stock</div>

            <div class="form-grid">
              <div class="field">
                <label class="label">Quantité <span class="required">*</span></label>
                <input
                  v-model="delta"
                  type="number"
                  class="input"
                  placeholder="Ex : 50 ou -10"
                  :disabled="submitting || !currentStock"
                />
                <span class="hint">Positif = entrée · Négatif = retrait</span>
              </div>

              <div class="field">
                <label class="label">Motif <span class="required">*</span></label>
                <select v-model="movementType" class="input select" :disabled="submitting">
                  <option v-for="t in MOVEMENT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </div>

              <div class="field field--full">
                <label class="label">Opérateur</label>
                <input
                  v-model="employeeName"
                  type="text"
                  class="input"
                  placeholder="Nom de l'opérateur…"
                  :disabled="submitting"
                />
              </div>

              <div class="field field--full">
                <label class="label">Commentaire</label>
                <textarea
                  v-model="comment"
                  class="input textarea"
                  rows="2"
                  placeholder="Commentaire optionnel…"
                  :disabled="submitting"
                ></textarea>
              </div>
            </div>

            <!-- Aperçu -->
            <div v-if="delta && currentStock && !isNaN(parseInt(delta))" class="preview-row">
              <div class="preview-item">
                <span class="preview-label">Actuel</span>
                <span class="preview-value">{{ currentStock.quantity }}</span>
              </div>
              <div class="preview-arrow">{{ parseInt(delta) >= 0 ? '+' : '' }}{{ parseInt(delta) }}</div>
              <div class="preview-item">
                <span class="preview-label">Résultat</span>
                <span
                  class="preview-value"
                  :class="{ 'text-error': currentStock.quantity + parseInt(delta) < 0 }"
                >{{ currentStock.quantity + parseInt(delta) }}</span>
              </div>
            </div>

            <p v-if="submitError" class="text-error">{{ submitError }}</p>

            <div class="form-actions">
              <button class="btn btn--outline" @click="resetForm" :disabled="submitting">
                Réinitialiser
              </button>
              <button
                class="btn btn--primary"
                @click="handleSubmit"
                :disabled="submitting || !formValid || !currentStock"
              >
                <span v-if="submitting" class="spinner"></span>
                <span v-else>Valider</span>
              </button>
            </div>
          </div>

        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stock-add-page {
  max-width: 1100px;
}

.page-header {
  margin-bottom: 22px;
}

.page-header h1 { margin-bottom: 4px; }

.page-desc {
  font-size: 14px;
  color: var(--text-muted);
}

/* Layout 2 colonnes */
.layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  align-items: start;
}

/* Card */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-xs);
}

.list-card {
  margin-bottom: 0;
  padding: 14px 16px;
}

.card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Filtres liste */
.list-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.search-wrap {
  flex: 1;
  position: relative;
}

.search-icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding-right: 32px;
  box-sizing: border-box;
}

.status-filter {
  width: 90px;
  flex-shrink: 0;
}

.btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.btn--icon:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent);
}

.btn--icon:disabled { opacity: 0.45; cursor: not-allowed; }

/* Liste produits */
.product-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 480px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.product-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background var(--transition-fast);
}

.product-item:last-child {
  border-bottom: none;
}

.product-item:hover {
  background: var(--bg);
}

.product-item.selected {
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  border-left: 3px solid var(--accent);
  padding-left: 9px;
}

.item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.item-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.item-ref {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Badges */
.qty-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  min-width: 28px;
  text-align: center;
}

.qty-ok   { background: #e8f5e9; color: #2e7d32; }
.qty-zero { background: #fff3e0; color: #e65100; }

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active   { background: #4caf50; }
.status-dot.inactive { background: #bdbdbd; }

/* Pagination liste */
.list-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.page-info {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
}

/* États */
.list-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px;
  color: var(--text-muted);
  font-size: 13px;
  justify-content: center;
}

.list-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13.5px;
}

/* Colonne droite */
.form-col {
  min-width: 0;
}

.placeholder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 260px;
  background: var(--surface);
  border: 2px dashed var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  text-align: center;
  padding: 32px;
}

.placeholder-card p {
  margin: 0;
  font-size: 14px;
  max-width: 260px;
}

/* Produit sélectionné */
.product-card { margin-bottom: 14px; }

.product-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.product-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 5px;
}

.product-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.item-id {
  font-size: 11.5px;
  color: var(--text-muted);
}

.ref {
  font-size: 11.5px;
  background: var(--bg);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: monospace;
  color: var(--text-muted);
}

.product-meta .status-dot {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  width: auto;
  height: auto;
}

.product-meta .status-dot.active   { background: #e8f5e9; color: #2e7d32; }
.product-meta .status-dot.inactive { background: #fce4ec; color: #c62828; }

.comb-label {
  font-size: 11.5px;
  color: var(--accent);
  font-weight: 600;
}

.stock-current {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-top: 10px;
}

.stock-label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stock-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent);
}

.stock-value .unit {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin-left: 3px;
}

.qty-zero-big { color: #e65100; }

/* Formulaire */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field--full { grid-column: 1 / -1; }

.label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.required { color: var(--error, #e53935); }
.hint { font-size: 11.5px; color: var(--text-muted); }

.input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13.5px;
  background: var(--bg);
  color: var(--text);
  transition: border-color var(--transition-fast);
}

.input:focus { outline: none; border-color: var(--accent-border); }
.input:disabled { opacity: 0.5; cursor: not-allowed; }
.select { cursor: pointer; }

.textarea {
  resize: vertical;
  min-height: 60px;
  width: 100%;
  box-sizing: border-box;
}

/* Aperçu */
.preview-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: var(--bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  margin: 14px 0;
}

.preview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.preview-label {
  font-size: 10.5px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

.preview-arrow {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  flex: 1;
  text-align: center;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

/* Alertes */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  margin-bottom: 12px;
}

.alert--success {
  background: #e8f5e9;
  color: #2e7d32;
  border: 1px solid #a5d6a7;
}

.text-error { color: var(--error, #e53935); font-size: 13px; margin-top: 6px; }
.text-warn  { color: #e65100; font-size: 12px; }
.loading-line { font-size: 13px; color: var(--text-muted); padding: 6px 0; }

/* Boutons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn--primary { background: var(--accent); color: #fff; }
.btn--primary:hover:not(:disabled) { filter: brightness(1.1); }

.btn--outline { background: var(--surface); border-color: var(--border); color: var(--text); }
.btn--outline:hover:not(:disabled) { border-color: var(--accent-border); color: var(--accent); }

.btn--sm { padding: 5px 10px; font-size: 12px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* Spinners */
.spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.spinner-dark {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.spinning { animation: spin 0.8s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

/* Responsive */
@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
  .product-list { max-height: 300px; }
}

@media (max-width: 560px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
