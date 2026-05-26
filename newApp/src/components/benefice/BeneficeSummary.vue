<script setup>
// BeneficeSummary — composant haut niveau qui affiche le bénéfice journalier + total.
//
// Utilise BeneficeCard pour le rendu visuel et le composable useBenefice
// pour récupérer les données. Sélecteur de date intégré.
//
// Usage le plus simple (autonome) :
//   <BeneficeSummary auto-fetch />
//
// Usage contrôlé (les actions sont déclenchées par le parent) :
//   <BeneficeSummary :auto-fetch="false" ref="summaryRef" />

import { onMounted } from 'vue'
import BeneficeCard from './BeneficeCard.vue'
import { useBenefice } from '../../composables/benefice'

const props = defineProps({
  autoFetch: {
    type: Boolean,
    default: true,
  },
  initialDate: {
    type: String,
    default: '',
  },
  showDailySelector: {
    type: Boolean,
    default: true,
  },
})

const {
  daily,
  total,
  loading,
  errors,
  dailyBenefice,
  totalBenefice,
  dailyRealBenefice,
  totalRealBenefice,
  fetchDaily,
  fetchTotal,
  fetchAll,
  setDate,
} = useBenefice({ initialDate: props.initialDate || undefined })

const handleDateChange = (event) => {
  const value = event?.target?.value || ''
  setDate(value)
  fetchDaily(value)
}

const refresh = () => fetchAll()

defineExpose({ refresh, fetchDaily, fetchTotal, fetchAll })

onMounted(() => {
  if (props.autoFetch) {
    fetchAll()
  }
})
</script>

<template>
  <div class="benefice-summary">
    <div v-if="showDailySelector" class="benefice-summary__controls">
      <label class="benefice-summary__date-label" for="benefice-date">
        Date
      </label>
      <input
        id="benefice-date"
        class="benefice-summary__date-input"
        type="date"
        :value="daily.date"
        :disabled="loading.daily"
        @change="handleDateChange"
      />
      <button
        type="button"
        class="benefice-summary__refresh"
        :disabled="loading.daily || loading.total"
        @click="refresh"
      >
        {{ loading.daily || loading.total ? 'Actualisation…' : 'Actualiser' }}
      </button>
    </div>

    <div class="ds-kpi-grid">
      <BeneficeCard
        label="Bénéfice journalier"
        :value="dailyBenefice"
        :loading="loading.daily"
        :error="errors.daily"
        :description="`Pour le ${daily.date || '—'} · ${daily.orderCount} commande(s)`"
        variant="auto"
        badgeClass="ds-badge-indigo"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="ds-icon-sm">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </template>
      </BeneficeCard>
      
      <BeneficeCard
        label="Bénéfice réel (jour)"
        :value="dailyRealBenefice"
        :loading="loading.daily"
        :error="errors.daily"
        :description="`Ventes HT − coût achat · ${daily.date || '—'}`"
        variant="auto"
        badgeClass="ds-badge-emerald"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="ds-icon-sm">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </template>
      </BeneficeCard>
      
      <BeneficeCard
        label="Bénéfice total"
        :value="totalBenefice"
        :loading="loading.total"
        :error="errors.total"
        :description="`Cumul global · ${total.orderCount} commande(s)`"
        variant="auto"
        badgeClass="ds-badge-blue"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </template>
      </BeneficeCard>
      
      <BeneficeCard
        label="Bénéfice réel (total)"
        :value="totalRealBenefice"
        :loading="loading.total"
        :error="errors.total"
        :description="`Ventes HT − coût achat · ${total.orderCount} commande(s)`"
        variant="auto"
        badgeClass="ds-badge-amber"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
          </svg>
        </template>
      </BeneficeCard>
    </div>

    <slot name="extras" :daily="daily" :total="total" />
  </div>
</template>

<style scoped>
.benefice-summary {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.benefice-summary__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.benefice-summary__date-label {
  font-size: 12.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6b7280);
}

.benefice-summary__date-input {
  padding: 8px 12px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #fff);
  color: var(--text, #111827);
  font-size: 13px;
  min-width: 160px;
}

.benefice-summary__refresh {
  padding: 8px 16px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #fff);
  color: var(--text, #111827);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.benefice-summary__refresh:hover:not(:disabled) {
  background: var(--bg, #f9fafb);
}

.benefice-summary__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ds-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg, 24px);
}

@media (max-width: 1024px) {
  .ds-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .ds-kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
