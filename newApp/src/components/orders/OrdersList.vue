<script setup>
import { computed, reactive } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  statusLabels: { type: Object, default: () => ({}) },
  statusOptions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  updatingIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['reload', 'update-status'])
const selectedStatus = reactive({})

const isCartRow = (order) => Boolean(order?.isCart)
const isDeliveredRow = (order) => {
  const label = getStatusLabel(order?.statusId)
  const text = normalize(label)
  return text.includes('livr') || text.includes('deliver')
}
const isLockedRow = (order) => isCartRow(order) || isDeliveredRow(order)

const normalize = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const getStatusLabel = (statusId) => {
  if (statusId == null) {
    return 'Etat inconnu'
  }
  return props.statusLabels[statusId] || `Etat #${statusId}`
}

const getStatusTone = (label) => {
  const text = normalize(label)
  if (!text) return 'info'
  if (text.includes('panier')) return 'info'
  if (text.includes('annul')) return 'danger'
  if (text.includes('erreur') || text.includes('echec') || text.includes('refuse')) return 'danger'
  if (text.includes('livr') || text.includes('deliver')) return 'success'
  if (text.includes('paiement') && (text.includes('accepte') || text.includes('effectue') || text.includes('confirme') || text.includes('complete'))) {
    return 'success'
  }
  if (text.includes('attente') || text.includes('en cours')) return 'warning'
  return 'info'
}

const formatCurrency = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0,00 €'
  return num.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

const sortedItems = computed(() => {
  const items = [...props.items]
  items.sort((a, b) => {
    const dateA = new Date(a?.dateAdd || '').getTime()
    const dateB = new Date(b?.dateAdd || '').getTime()
    if (!Number.isNaN(dateA) && !Number.isNaN(dateB) && dateA !== dateB) {
      return dateB - dateA
    }
    const idA = Number(a?.id) || 0
    const idB = Number(b?.id) || 0
    return idB - idA
  })
  return items
})

const isUpdating = (orderId) => props.updatingIds.includes(orderId)

const handleUpdate = (order) => {
  if (isLockedRow(order)) return
  const statusValue = selectedStatus[order.id]
  if (!statusValue) return
  emit('update-status', { orderId: order.id, statusValue })
}
</script>

<template>
  <div class="orders-table-card">
    <div class="table-header">
      <div class="table-title">
        <h3>Liste des commandes</h3>
        <span class="table-count" v-if="!loading">{{ props.items.length }} commande{{ props.items.length !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <div v-if="error" class="table-error">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" />
        <path d="M9 5.5v4M9 12h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <div>
        <p class="error-title">Erreur de chargement</p>
        <p class="error-detail">{{ error }}</p>
      </div>
      <button class="btn-retry" @click="emit('reload')">Reessayer</button>
    </div>

    <div v-else-if="loading" class="table-skeleton">
      <div class="skeleton-row" v-for="n in 8" :key="n">
        <div class="skeleton" style="width: 40px; height: 16px;"></div>
        <div class="skeleton" style="width: 140px; height: 16px;"></div>
        <div class="skeleton" style="width: 90px; height: 16px;"></div>
        <div class="skeleton" style="width: 70px; height: 16px;"></div>
        <div class="skeleton" style="width: 140px; height: 16px;"></div>
        <div class="skeleton" style="width: 90px; height: 22px; border-radius: 12px;"></div>
        <div class="skeleton" style="width: 180px; height: 32px; border-radius: 8px;"></div>
      </div>
    </div>

    <div v-else-if="props.items.length === 0" class="table-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="4" stroke="var(--text-muted)" stroke-width="2" />
        <path d="M6 18h36" stroke="var(--text-muted)" stroke-width="2" />
        <path d="M16 30h16" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" />
      </svg>
      <p class="empty-title">Aucune commande trouvee</p>
      <p class="empty-desc">Les commandes s'afficheront des que le chargement sera termine.</p>
    </div>

    <div v-else class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 80px;">ID</th>
            <th>Reference</th>
            <th style="width: 110px;">Client</th>
            <th style="width: 130px;">Total</th>
            <th style="width: 180px;">Date</th>
            <th style="width: 150px;">Etat actuel</th>
            <th style="width: 240px;">Modifier l'etat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(order, idx) in sortedItems" :key="order.id || idx" class="animate-fade-in" :style="{ animationDelay: Math.min(idx * 20, 400) + 'ms' }">
            <td class="td-id">
              <span class="order-id">#{{ order.displayId || order.id || 'N/A' }}</span>
            </td>
            <td class="td-reference">
              <span class="order-ref">{{ order.reference || '-' }}</span>
            </td>
            <td class="td-customer">
              <span class="order-customer">#{{ order.customerId || '-' }}</span>
            </td>
            <td class="td-total">
              <span class="order-total">{{ formatCurrency(order.total) }}</span>
            </td>
            <td class="td-date">
              <span class="order-date">{{ formatDate(order.dateAdd) }}</span>
            </td>
            <td class="td-status">
              <span class="status-badge" :class="'status--' + getStatusTone(getStatusLabel(order.statusId))">
                {{ getStatusLabel(order.statusId) }}
              </span>
            </td>
            <td class="td-action">
              <div class="status-controls">
                <select
                  v-model="selectedStatus[order.id]"
                  class="status-select"
                  :disabled="isLockedRow(order) || isUpdating(order.id)"
                >
                  <option v-if="isLockedRow(order)" value="" disabled>
                    {{ isCartRow(order) ? 'Panier (lecture seule)' : 'Livree (lecture seule)' }}
                  </option>
                  <template v-else>
                    <option value="" disabled>Modifier l'etat</option>
                    <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </template>
                </select>
                <button
                  class="btn-update"
                  type="button"
                  :disabled="isLockedRow(order) || !selectedStatus[order.id] || isUpdating(order.id)"
                  @click="handleUpdate(order)"
                >
                  {{ isUpdating(order.id) ? 'Mise a jour...' : 'Appliquer' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !error && props.items.length > 0" class="table-footer">
      <span class="table-footer-info">
        Affichage de {{ props.items.length }} commande{{ props.items.length !== 1 ? 's' : '' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ── Carte conteneur ─────────────────────────────────── */
.orders-table-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

/* ── En-tête table ────────────────────────────────────── */
.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg);
}

.table-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-title h3 {
  font-size: 14.5px;
  font-weight: 600;
}

.table-count {
  font-size: 11.5px;
  color: var(--accent);
  background: var(--accent-light);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-weight: 600;
}

/* ── États ────────────────────────────────────────────── */
.table-error {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  background: var(--danger-light);
  color: var(--danger);
  margin: 16px 20px;
  border-radius: var(--radius-md);
  border-left: 3px solid var(--danger);
}

.error-title {
  font-weight: 600;
  font-size: 13.5px;
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
  flex-shrink: 0;
}

.btn-retry:hover {
  opacity: 0.88;
}

.table-skeleton {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-row {
  display: flex;
  gap: 20px;
  align-items: center;
  padding: 6px 0;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  gap: 10px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  text-align: center;
}

/* ── Table données ────────────────────────────────────── */
.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table thead {
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table th {
  padding: 10px 20px;
  text-align: left;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  user-select: none;
}

.data-table tbody tr {
  border-bottom: 1px solid var(--border-light);
  transition: background var(--transition-fast);
}

.data-table tbody tr:last-child {
  border-bottom: none;
}

.data-table tbody tr:hover {
  background: var(--bg);
}

.td-id,
.td-reference,
.td-customer,
.td-total,
.td-date,
.td-status,
.td-action {
  padding: 12px 20px;
  white-space: nowrap;
}

.order-id {
  font-weight: 700;
  color: var(--accent);
  font-family: 'SF Mono', 'Cascadia Code', monospace;
  font-size: 12.5px;
}

.order-ref {
  font-weight: 600;
  color: var(--text);
  font-size: 13px;
}

.order-customer,
.order-date {
  color: var(--text-muted);
  font-size: 12.5px;
}

.order-total {
  font-weight: 700;
  color: var(--text);
  font-size: 13.5px;
}

/* ── Badges statut ────────────────────────────────────── */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.status--success {
  background: var(--success-light);
  color: var(--success);
}

.status--danger {
  background: var(--danger-light);
  color: var(--danger);
}

.status--warning {
  background: var(--warning-light);
  color: var(--warning);
}

.status--info {
  background: var(--info-light);
  color: var(--info);
}

/* ── Contrôles action ─────────────────────────────────── */
.status-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-select {
  min-width: 150px;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 12.5px;
  transition: border-color var(--transition-fast);
}

.status-select:focus {
  outline: none;
  border-color: var(--accent-border);
}

.status-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-update {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: white;
  font-size: 12px;
  font-weight: 600;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.btn-update:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-update:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Pied de table ────────────────────────────────────── */
.table-footer {
  padding: 12px 24px;
  border-top: 1px solid var(--border-light);
  background: var(--bg);
  display: flex;
  justify-content: flex-end;
}

.table-footer-info {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

@media (max-width: 960px) {
  .status-controls {
    flex-direction: column;
    align-items: flex-start;
  }

  .td-action {
    white-space: normal;
  }
}
</style>
