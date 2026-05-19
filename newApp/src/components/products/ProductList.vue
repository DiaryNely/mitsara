<script setup>
import { ref } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  rawXml: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['reload'])
const showXml = ref(false)
const sortKey = ref('id')
const sortDir = ref('asc')

const sortedItems = () => {
  const arr = [...props.items]
  arr.sort((a, b) => {
    let va = a[sortKey.value] || ''
    let vb = b[sortKey.value] || ''

    if (sortKey.value === 'price' || sortKey.value === 'id') {
      va = parseFloat(va) || 0
      vb = parseFloat(vb) || 0
    } else {
      va = String(va).toLowerCase()
      vb = String(vb).toLowerCase()
    }

    if (va < vb) return sortDir.value === 'asc' ? -1 : 1
    if (va > vb) return sortDir.value === 'asc' ? 1 : -1
    return 0
  })
  return arr
}

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

const getSortIcon = (key) => {
  if (sortKey.value !== key) return 'neutral'
  return sortDir.value
}

const formatPrice = (price) => {
  const num = parseFloat(price)
  if (isNaN(num)) return '0.00 €'
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

const getStatus = (price) => {
  return parseFloat(price) > 0 ? 'active' : 'inactive'
}
</script>

<template>
  <div class="product-table-card">
    <!-- Table Header -->
    <div class="table-header">
      <div class="table-title">
        <h3>Liste des produits</h3>
        <span class="table-count" v-if="!loading">{{ props.items.length }} produit{{ props.items.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="table-actions">
        <label class="xml-toggle" :class="{ active: showXml }">
          <input v-model="showXml" type="checkbox" class="sr-only" />
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 3L1 7l3 4M10 3l3 4-3 4M8 2L6 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          XML
        </label>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="table-error">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/>
        <path d="M9 5.5v4M9 12h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <div>
        <p class="error-title">Erreur de chargement</p>
        <p class="error-detail">{{ error }}</p>
      </div>
      <button class="btn-retry" @click="emit('reload')">Réessayer</button>
    </div>

    <!-- Loading Skeleton -->
    <div v-else-if="loading" class="table-skeleton">
      <div class="skeleton-row" v-for="n in 8" :key="n">
        <div class="skeleton" style="width: 40px; height: 16px;"></div>
        <div class="skeleton" style="width: 200px; height: 16px;"></div>
        <div class="skeleton" style="width: 80px; height: 16px;"></div>
        <div class="skeleton" style="width: 60px; height: 22px; border-radius: 12px;"></div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="props.items.length === 0" class="table-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="4" stroke="var(--text-muted)" stroke-width="2"/>
        <path d="M6 18h36" stroke="var(--text-muted)" stroke-width="2"/>
        <circle cx="24" cy="30" r="4" stroke="var(--text-muted)" stroke-width="2"/>
        <path d="M22 32l4-4" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p class="empty-title">Aucun produit trouvé</p>
      <p class="empty-desc">Essayez de modifier vos filtres de recherche.</p>
    </div>

    <!-- Data Table -->
    <div v-else class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th class="th-sortable" @click="toggleSort('id')" style="width: 80px;">
              <span>ID</span>
              <span class="sort-icon" :class="getSortIcon('id')">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M3 7l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </th>
            <th class="th-sortable" @click="toggleSort('name')">
              <span>Nom du produit</span>
              <span class="sort-icon" :class="getSortIcon('name')">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M3 7l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </th>
            <th class="th-sortable" @click="toggleSort('price')" style="width: 130px;">
              <span>Prix</span>
              <span class="sort-icon" :class="getSortIcon('price')">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M3 7l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </th>
            <th style="width: 100px;">Statut</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(product, idx) in sortedItems()" :key="product.id || idx" class="animate-fade-in" :style="{ animationDelay: Math.min(idx * 20, 400) + 'ms' }">
            <td class="td-id">
              <span class="product-id">#{{ product.id || 'N/A' }}</span>
            </td>
            <td class="td-name">
              <span class="product-name">{{ product.name || 'Produit sans nom' }}</span>
            </td>
            <td class="td-price">
              <span class="product-price">{{ formatPrice(product.price) }}</span>
            </td>
            <td class="td-status">
              <span class="status-badge" :class="'status--' + getStatus(product.price)">
                {{ getStatus(product.price) === 'active' ? 'Actif' : 'Inactif' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination placeholder -->
    <div v-if="!loading && !error && props.items.length > 0" class="table-footer">
      <span class="table-footer-info">
        Affichage de {{ props.items.length }} produit{{ props.items.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Raw XML -->
    <transition name="xml-slide">
      <div v-if="showXml && props.rawXml" class="xml-panel">
        <div class="xml-header">
          <span>Réponse XML brute</span>
          <button class="xml-close" @click="showXml = false">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <pre class="xml-content">{{ props.rawXml }}</pre>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.product-table-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

/* Table Header */
.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.table-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.table-title h3 {
  font-size: 15px;
}

.table-count {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.xml-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border: 1px solid var(--border);
  transition: all var(--transition-fast);
  background: transparent;
}

.xml-toggle:hover,
.xml-toggle.active {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent-border);
}

/* Error */
.table-error {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: var(--danger-light);
  color: var(--danger);
  margin: 16px 20px;
  border-radius: var(--radius-md);
}

.error-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--danger);
}

.error-detail {
  font-size: 12px;
  color: var(--danger);
  opacity: 0.8;
}

.btn-retry {
  margin-left: auto;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  background: var(--danger);
  color: white;
  font-size: 12px;
  font-weight: 600;
  transition: opacity var(--transition-fast);
}

.btn-retry:hover {
  opacity: 0.85;
}

/* Skeleton */
.table-skeleton {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skeleton-row {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 8px 0;
}

/* Empty */
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.empty-desc {
  font-size: 13px;
  color: var(--text-muted);
}

/* Data Table */
.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table thead {
  background: var(--bg);
}

.data-table th {
  padding: 10px 20px;
  text-align: left;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  user-select: none;
}

.th-sortable {
  cursor: pointer;
  transition: color var(--transition-fast);
}

.th-sortable:hover {
  color: var(--text);
}

.th-sortable span {
  display: inline-flex;
  align-items: center;
}

.sort-icon {
  margin-left: 4px;
  opacity: 0.3;
  transition: all var(--transition-fast);
}

.sort-icon.asc {
  opacity: 1;
  color: var(--accent);
  transform: rotate(180deg);
}

.sort-icon.desc {
  opacity: 1;
  color: var(--accent);
}

.data-table tbody tr {
  border-bottom: 1px solid var(--border-light);
  transition: background var(--transition-fast);
}

.data-table tbody tr:hover {
  background: var(--surface-hover);
}

.data-table tbody tr:last-child {
  border-bottom: none;
}

.data-table td {
  padding: 12px 20px;
  font-size: 13.5px;
}

.td-id {
  white-space: nowrap;
}

.product-id {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
}

.product-name {
  font-weight: 500;
  color: var(--text);
}

.product-price {
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.status--active {
  background: var(--success-light);
  color: var(--success);
}

.status--inactive {
  background: var(--danger-light);
  color: var(--danger);
}

/* Table Footer */
.table-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.table-footer-info {
  font-size: 12.5px;
  color: var(--text-muted);
}

/* XML Panel */
.xml-panel {
  border-top: 1px solid var(--border);
  background: #fafbff;
}

.xml-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.xml-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--text-muted);
  transition: all var(--transition-fast);
}

.xml-close:hover {
  background: var(--border-light);
  color: var(--text);
}

.xml-content {
  padding: 16px 20px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}

/* XML slide transition */
.xml-slide-enter-active {
  transition: all var(--transition-base);
}
.xml-slide-leave-active {
  transition: all 200ms ease;
}
.xml-slide-enter-from {
  opacity: 0;
  max-height: 0;
}
.xml-slide-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .data-table th,
  .data-table td {
    padding: 10px 12px;
  }
}
</style>
