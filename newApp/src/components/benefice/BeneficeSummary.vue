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

    <div class="benefice-summary__grid">
      <BeneficeCard
        label="Bénéfice journalier"
        :value="dailyBenefice"
        :loading="loading.daily"
        :error="errors.daily"
        :description="`Pour le ${daily.date || '—'} · ${daily.orderCount} commande(s)`"
        variant="auto"
      />
      <BeneficeCard
        label="Bénéfice réel (jour)"
        :value="dailyRealBenefice"
        :loading="loading.daily"
        :error="errors.daily"
        :description="`Ventes HT − coût achat · ${daily.date || '—'}`"
        variant="auto"
      />
      <BeneficeCard
        label="Bénéfice total"
        :value="totalBenefice"
        :loading="loading.total"
        :error="errors.total"
        :description="`Cumul global · ${total.orderCount} commande(s)`"
        variant="auto"
      />
      <BeneficeCard
        label="Bénéfice réel (total)"
        :value="totalRealBenefice"
        :loading="loading.total"
        :error="errors.total"
        :description="`Ventes HT − coût achat · ${total.orderCount} commande(s)`"
        variant="auto"
      />
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

.benefice-summary__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1024px) {
  .benefice-summary__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .benefice-summary__grid {
    grid-template-columns: 1fr;
  }
}
</style>
