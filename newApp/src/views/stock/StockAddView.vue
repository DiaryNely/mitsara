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
  <div class="master-detail-layout animate-fade-in">
    
    <!-- DASHBOARD HEADER -->
    <header class="dashboard-topbar">
      <div class="topbar-info">
        <h1>Opérations de Stocks</h1>
        <p>Aperçu listé avec panneau d'édition latéral pour les ajustements</p>
      </div>

      <!-- Action bar intégrée -->
      <div class="action-bar shadow-sm">
        <div class="search-group">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            v-model="filterQuery" 
            @input="onFilterInput" 
            class="input plain-input" 
            type="text" 
            placeholder="Recherche (nom, référence)..." 
          />
        </div>
        
        <div class="divider"></div>

        <select v-model="filterActive" @change="onFilterActiveChange" class="input plain-select">
          <option value="">Status (Tous)</option>
          <option value="1">Actifs</option>
          <option value="0">Inactifs</option>
        </select>
        
        <div class="divider"></div>

        <button @click="loadProducts({ page: 1 })" :disabled="listLoading" class="btn-icon" title="Rafraîchir les données">
          <svg viewBox="0 0 24 24" fill="none" class="icon" :class="{'spin': listLoading}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
    </header>

    <!-- DATA TABLE CONTAINER -->
    <main class="data-view-container">
      
      <div v-if="listLoading && !products.length" class="view-feedback">
        <div class="spinner big"></div>
        <p>Synchronisation des données...</p>
      </div>
      
      <div v-else-if="listError" class="view-feedback error">
        <p>{{ listError }}</p>
      </div>

      <div v-else-if="products.length === 0" class="view-feedback">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
        <p>L'inventaire est vide ou la recherche ne correspond à aucun élément.</p>
      </div>

      <!-- THE TABLE -->
      <div v-else class="table-wrapper shadow-md">
        <table class="products-table">
          <thead>
            <tr>
              <th width="80">ID</th>
              <th>Nom du produit</th>
              <th>Référence</th>
              <th class="col-center">Stock disponible</th>
              <th width="150">État</th>
              <th width="120" class="col-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="p in products" 
              :key="p.id" 
              @click="selectProduct(p)"
              class="clickable-row"
              :class="{ 'active-row': selectedProduct?.id === p.id }"
            >
              <td class="text-xs text-muted font-mono">#{{ p.id }}</td>
              <td class="font-medium text-dark">{{ p.name }}</td>
              <td><span class="ref-badge">{{ p.reference || 'N/A' }}</span></td>
              <td class="col-center">
                <span class="stock-pill" :class="p.quantity > 0 ? 'bg-green' : 'bg-red'">
                  {{ p.quantity }}
                </span>
              </td>
              <td>
                <span class="status-dot" :class="p.active ? 'dot-on' : 'dot-off'"></span>
                {{ p.active ? 'Actif' : 'Inactif' }}
              </td>
              <td class="col-right">
                <button class="btn-micro" @click.stop="selectProduct(p)">Modifier →</button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- ROW PAGINATION BENEATH TABLE -->
        <div class="pagination-footer">
          <p class="page-meta">Page actuelle : <strong>{{ page }}</strong></p>
          <div class="pager-controls">
            <button class="btn-page" @click="prevPage" :disabled="listLoading || page <= 1">← Préc</button>
            <button class="btn-page" @click="nextPage" :disabled="listLoading || !hasMore">Suiv →</button>
          </div>
        </div>
      </div>
    </main>

    <!-- RIGHT OFFCANVAS PANEL (DRAWER) -->
    <div class="drawer-backdrop" :class="{ 'visible': selectedProduct }" @click="clearSelection"></div>
    <aside class="drawer-panel shadow-heavy" :class="{ 'open': selectedProduct }">
      
      <div v-if="selectedProduct" class="drawer-content">
        <!-- Drawer Header -->
        <header class="drawer-header">
          <div class="header-left">
            <h2>Édition du stock</h2>
            <span class="product-id">ID: {{ selectedProduct.id }}</span>
          </div>
          <button class="btn-close-drawer" @click="clearSelection" title="Fermer le tiroir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <!-- Drawer Scrollable Body -->
        <div class="drawer-body">
          
          <!-- Banner Success Inside Drawer -->
          <div v-if="successInfo" class="toast-success">
            <div class="toast-icon">✓</div>
            <div class="toast-text">
              Inventaire mis à jour : <br/>
              <strong>{{ successInfo.quantityBefore }} → {{ successInfo.quantityAfter }}</strong> 
              <span class="diff">({{ successInfo.delta > 0 ? '+' : '' }}{{ successInfo.delta }})</span>
            </div>
          </div>

          <div class="product-identity-card">
            <h3>{{ selectedProduct.name }}</h3>
            <code>{{ selectedProduct.reference || 'Aucune référence' }}</code>
          </div>

          <!-- Section: Scope & Current Stock -->
          <section class="form-section gradient-bg">
            <div class="section-title">1. Sélection du scope</div>
            
            <div v-if="combinationsLoading" class="inline-loading">
              <div class="spinner small"></div> <span>Chargement déclinaisons...</span>
            </div>
            <div class="field-wrap" v-else-if="hasCombinations">
              <label>Déclinaison ciblée</label>
              <select v-model="selectedAttrId" class="input input-filled">
                <option value="0">--- Tronc commun (Aucune) ---</option>
                <option v-for="c in combinations" :key="c.id" :value="String(c.id)">
                  [#{{ c.id }}] {{ c.reference ? c.reference : 'Déclinaison standard' }}
                </option>
              </select>
            </div>
            <div v-else class="text-sm text-muted mb-4">
              Ce produit ne possède aucune déclinaison.
            </div>

            <div class="stock-display shadow-sm">
              <span>Stock Quantitatif</span>
              <div class="stock-amount" :class="{'text-danger': currentQty === 0}">
                {{ currentQty }} <small>U</small>
              </div>
            </div>
          </section>

          <!-- Section: Mouvement -->
          <section class="form-section">
            <div class="section-title">2. Configuration de l'ajustement</div>

            <div class="split-fields">
              <div class="field-wrap">
                <label>Volumétrie <span class="req">*</span></label>
                <input 
                  v-model="delta" 
                  type="number" 
                  class="input input-filled big-number" 
                  placeholder="+ / -" 
                  :disabled="submitting || !currentStock"
                />
              </div>
              <div class="field-wrap flex-grow">
                <label>Raison du mouvement <span class="req">*</span></label>
                <select v-model="movementType" class="input input-filled" :disabled="submitting">
                  <option v-for="t in MOVEMENT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </div>
            </div>

            <div class="field-wrap mt-3">
               <label>Identifiant Opérateur</label>
               <input v-model="employeeName" type="text" class="input input-filled" placeholder="Nom/Prénom" :disabled="submitting" />
            </div>

            <div class="field-wrap mt-3">
               <label>Notes (Optionnel)</label>
               <textarea v-model="comment" class="input input-filled" rows="3" placeholder="Informations complémentaires..." :disabled="submitting"></textarea>
            </div>

            <!-- Mathematical Preview -->
            <div v-if="delta && currentStock && !isNaN(parseInt(delta))" class="math-preview">
               <div class="math-block">
                 <small>Ancien</small>
                 <span>{{ currentStock.quantity }}</span>
               </div>
               <div class="math-op" :class="parseInt(delta) >= 0 ? 'plus' : 'minus'">
                 {{ parseInt(delta) >= 0 ? '+' : '' }}{{ parseInt(delta) }}
               </div>
               <div class="math-block result">
                 <small>Nouveau</small>
                 <span :class="{'text-danger': currentStock.quantity + parseInt(delta) < 0}">
                   {{ currentStock.quantity + parseInt(delta) }}
                 </span>
               </div>
            </div>
            
            <div v-if="submitError" class="alert-box error mt-4">
              {{ submitError }}
            </div>
          </section>
        </div>

        <!-- Drawer Footer Actions -->
        <footer class="drawer-footer">
           <button class="btn outline" @click="resetForm" :disabled="submitting">Effacer</button>
           <button 
             class="btn primary" 
             @click="handleSubmit" 
             :disabled="submitting || !formValid || !currentStock"
           >
             <div class="spinner small white" v-if="submitting"></div>
             <span v-else>Appliquer</span>
           </button>
        </footer>
      </div>
    </aside>

  </div>
</template>

<style scoped>
/* STRUCTURE ET RESET */
.master-detail-layout {
  min-height: calc(100vh - 100px);
  background-color: #f4f7f6;
  padding: 32px 40px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #2c3e50;
  position: relative;
}

.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* TOPBAR */
.dashboard-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}
.topbar-info h1 {
  font-size: 26px;
  font-weight: 800;
  color: #1a252f;
  margin: 0 0 6px 0;
  letter-spacing: -0.5px;
}
.topbar-info p {
  margin: 0;
  color: #7f8c8d;
  font-size: 15px;
}

.action-bar {
  display: flex;
  align-items: center;
  background: white;
  border-radius: 12px;
  padding: 8px 16px;
  gap: 12px;
}
.shadow-sm { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.shadow-md { box-shadow: 0 6px 20px rgba(0,0,0,0.06); }
.shadow-heavy { box-shadow: -10px 0 30px rgba(0,0,0,0.15); }

.search-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 280px;
}
.icon { width: 18px; height: 18px; color: #95a5a6; }
.input {
  border: none;
  background: transparent;
  font-size: 14px;
  color: #34495e;
  outline: none;
  font-family: inherit;
}
.plain-input { flex-grow: 1; padding: 6px 0; }
.plain-select {
  cursor: pointer;
  font-weight: 500;
  color: #2c3e50;
  padding-right: 12px;
}
.divider { width: 1px; height: 28px; background: #ecf0f1; }
.btn-icon {
  background: transparent; border: none; cursor: pointer;
  padding: 6px; border-radius: 6px; transition: background 0.2s;
}
.btn-icon:hover { background: #f8f9fa; }
.btn-icon .icon { color: #34495e; }
.spin { animation: rotate 1s linear infinite; }
@keyframes rotate { to { transform: rotate(360deg); } }

/* TABLE CONTAINER */
.data-view-container {
  background: transparent;
}
.table-wrapper {
  background: white;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #eef2f5;
}
.products-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.products-table th {
  background: #fdfefe;
  padding: 18px 20px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7f8c8d;
  font-weight: 700;
  border-bottom: 2px solid #ecf0f1;
}
.products-table td {
  padding: 16px 20px;
  border-bottom: 1px solid #ecf0f1;
  vertical-align: middle;
  transition: background 0.2s;
}
.clickable-row { cursor: pointer; }
.clickable-row:hover { background: #fbfcfc; }
.clickable-row:last-child td { border-bottom: none; }
.active-row td {
  background: #f0f4f8;
}

/* TABLE CELLS STYLING */
.font-mono { font-family: 'Courier New', Courier, monospace; }
.text-xs { font-size: 12px; }
.text-dark { color: #2c3e50; }
.font-medium { font-weight: 600; }
.text-muted { color: #95a5a6; }
.col-center { text-align: center; }
.col-right { text-align: right; }

.ref-badge {
  background: #f4f6f7;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: #7f8c8d;
}

.stock-pill {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 14px;
  min-width: 32px;
  text-align: center;
}
.bg-green { background: #e8f8f5; color: #27ae60; }
.bg-red { background: #fadbd8; color: #c0392b; }

.status-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.dot-on { background: #2ecc71; }
.dot-off { background: #bdc3c7; }

.btn-micro {
  background: white;
  border: 1px solid #bdc3c7;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #34495e;
  cursor: pointer;
  transition: all 0.2s;
}
.clickable-row:hover .btn-micro {
  border-color: #3498db;
  color: #3498db;
}

/* PAGINATION */
.pagination-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fdfefe;
  border-top: 1px solid #ecf0f1;
}
.page-meta { margin: 0; font-size: 14px; color: #7f8c8d; }
.page-meta strong { color: #2c3e50; }
.pager-controls { display: flex; gap: 8px; }
.btn-page {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #ecf0f1;
  background: white;
  font-weight: 600;
  color: #34495e;
  cursor: pointer;
}
.btn-page:hover:not(:disabled) { border-color: #bdc3c7; }
.btn-page:disabled { opacity: 0.4; cursor: not-allowed; }

/* STATES */
.view-feedback {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 80px 20px;
  color: #95a5a6;
  font-size: 16px;
  background: white;
  border-radius: 14px;
}
.empty-icon { width: 48px; height: 48px; margin-bottom: 20px; opacity: 0.5; }
.error { color: #e74c3c; }
.spinner {
  width: 20px; height: 20px;
  border: 3px solid #ecf0f1;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: rotate 1s linear infinite;
}
.spinner.big { width: 40px; height: 40px; margin-bottom: 20px; }
.spinner.small { width: 14px; height: 14px; border-width: 2px; }
.spinner.white { border-color: rgba(255,255,255,0.3); border-top-color: white; }

/* DRAWER (SLIDE-OVER) */
.drawer-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(44, 62, 80, 0.4);
  backdrop-filter: blur(2px);
  z-index: 100;
  opacity: 0; pointer-events: none;
  transition: opacity 0.3s ease-out;
}
.drawer-backdrop.visible { opacity: 1; pointer-events: auto; }

.drawer-panel {
  position: fixed; top: 0; right: 0;
  width: 480px; max-width: 100vw; height: 100vh;
  background: white;
  z-index: 101;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex; flex-direction: column;
}
.drawer-panel.open { transform: translateX(0); }
.drawer-content { display: flex; flex-direction: column; height: 100%; }

/* DRAWER HEADER */
.drawer-header {
  padding: 24px 32px;
  border-bottom: 1px solid #ecf0f1;
  display: flex; justify-content: space-between; align-items: flex-start;
}
.header-left h2 { margin: 0 0 4px 0; font-size: 22px; color: #2c3e50; }
.header-left .product-id { font-size: 13px; color: #95a5a6; font-family: monospace; }
.btn-close-drawer {
  background: #f4f6f7;
  border: none; border-radius: 50%;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  color: #7f8c8d; cursor: pointer; transition: all 0.2s;
}
.btn-close-drawer:hover { background: #fadbd8; color: #c0392b; transform: rotate(90deg); }

/* DRAWER BODY */
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  background: #fdfefe;
}

.toast-success {
  display: flex; gap: 16px; align-items: flex-start;
  background: #e8f8f5; border: 1px solid #a3e4d7;
  padding: 16px; border-radius: 8px; margin-bottom: 24px;
}
.toast-icon {
  background: #27ae60; color: white; width: 24px; height: 24px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: bold; flex-shrink: 0;
}
.toast-text { color: #1e8449; font-size: 14px; line-height: 1.5; }
.toast-text strong { font-size: 16px; }
.diff { color: #27ae60; font-weight: 800; }

.product-identity-card { margin-bottom: 24px; }
.product-identity-card h3 { font-size: 18px; margin: 0 0 8px 0; color: #34495e; }
.product-identity-card code { background: #fdf2e9; color: #d35400; padding: 4px 8px; border-radius: 4px; font-size: 13px; }

/* FORMS SECTIONS */
.form-section {
  border: 1px solid #ecf0f1;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}
.gradient-bg { background: linear-gradient(145deg, #ffffff 0%, #f9fbfb 100%); }
.section-title {
  font-size: 12px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.1em; color: #7f8c8d; margin-bottom: 16px;
  border-bottom: 2px solid #ecf0f1; padding-bottom: 8px;
}

.field-wrap { display: flex; flex-direction: column; gap: 8px; }
.field-wrap label { font-size: 13px; font-weight: 600; color: #34495e; }
.req { color: #e74c3c; }

.input-filled {
  background: #f4f6f7;
  border: 1px solid transparent;
  padding: 12px 14px;
  border-radius: 8px;
  transition: all 0.2s;
  box-sizing: border-box;
  width: 100%;
}
.input-filled:focus { background: white; border-color: #3498db; box-shadow: 0 0 0 3px rgba(52,152,219,0.15); }
.input-filled:disabled { opacity: 0.5; cursor: not-allowed; }
textarea.input-filled { resize: vertical; }

.stock-display {
  margin-top: 16px;
  background: white; border-radius: 8px; padding: 16px;
  display: flex; justify-content: space-between; align-items: center;
  border-left: 4px solid #3498db;
}
.stock-display span { font-size: 13px; font-weight: 600; color: #7f8c8d; }
.stock-amount { font-size: 28px; font-weight: 800; color: #2c3e50; }
.stock-amount small { font-size: 14px; color: #95a5a6; }

.split-fields { display: flex; gap: 16px; }
.flex-grow { flex-grow: 1; }
.big-number { font-size: 18px; font-weight: 700; text-align: center; }
.mt-3 { margin-top: 16px; }
.mt-4 { margin-top: 24px; }

/* MATH PREVIEW */
.math-preview {
  display: flex; justify-content: center; align-items: center; gap: 16px;
  margin-top: 24px; padding: 20px;
  background: #fbfcfc; border: 1px dashed #bdc3c7; border-radius: 10px;
}
.math-block { display: flex; flex-direction: column; align-items: center; }
.math-block small { font-size: 11px; text-transform: uppercase; color: #95a5a6; font-weight: 700; }
.math-block span { font-size: 24px; font-weight: 800; color: #34495e; }
.math-block.result span { color: #2980b9; }
.math-op {
  font-size: 20px; font-weight: 800;
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.math-op.plus { background: #e8f8f5; color: #27ae60; }
.math-op.minus { background: #fdf2e9; color: #d35400; }

.text-danger { color: #e74c3c !important; }
.alert-box { padding: 14px; border-radius: 8px; font-size: 14px; font-weight: 500; }
.alert-box.error { background: #fadbd8; color: #c0392b; }

/* DRAWER FOOTER */
.drawer-footer {
  padding: 24px 32px;
  border-top: 1px solid #ecf0f1;
  background: #fdfefe;
  display: flex; justify-content: flex-end; gap: 12px;
}
.btn {
  padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center;
  min-width: 120px; border: 1px solid transparent;
}
.btn.outline { background: transparent; border-color: #bdc3c7; color: #34495e; }
.btn.outline:hover { background: #f4f6f7; }
.btn.primary { background: #3498db; color: white; box-shadow: 0 4px 10px rgba(52,152,219,0.3); }
.btn.primary:hover:not(:disabled) { background: #2980b9; box-shadow: 0 2px 5px rgba(52,152,219,0.3); transform: translateY(-1px); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

/* RESPONSIVE */
@media (max-width: 1024px) {
  .master-detail-layout { padding: 20px; }
}
@media (max-width: 768px) {
  .dashboard-topbar { flex-direction: column; align-items: stretch; gap: 16px; }
  .action-bar { flex-wrap: wrap; }
  .search-group { width: 100%; }
  .drawer-panel { width: 100vw; }
}
</style>
