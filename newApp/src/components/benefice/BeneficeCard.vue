<script setup>
// BeneficeCard — composant réutilisable pour afficher un montant de bénéfice.
//
// Conçu pour être importable dans n'importe quelle vue (Dashboard, vue dédiée, etc.).
// N'a aucune dépendance au store : reçoit ses données par props pour être 100% découplé.
//
// Usage :
//   <BeneficeCard
//     label="Bénéfice journalier"
//     :value="123.45"
//     :loading="false"
//     :error="''"
//     :description="'Pour la date sélectionnée'"
//   />

import { computed } from 'vue'

const props = defineProps({
  label: {
    type: String,
    required: true,
  },
  value: {
    type: [Number, String],
    default: 0,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  // Variante visuelle ("default", "positive", "negative") — neutre par défaut.
  variant: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'positive', 'negative', 'auto'].includes(v),
  },
  currency: {
    type: String,
    default: 'EUR',
  },
  locale: {
    type: String,
    default: 'fr-FR',
  },
})

const formattedValue = computed(() => {
  const num = Number(props.value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString(props.locale, {
    style: 'currency',
    currency: props.currency,
  })
})

const resolvedVariant = computed(() => {
  if (props.variant !== 'auto') return props.variant
  const num = Number(props.value)
  if (!Number.isFinite(num) || num === 0) return 'default'
  return num > 0 ? 'positive' : 'negative'
})
</script>

<template>
  <section class="benefice-card" :class="`benefice-card--${resolvedVariant}`">
    <header class="benefice-card__header">
      <h3 class="benefice-card__label">{{ label }}</h3>
      <p v-if="description" class="benefice-card__description">{{ description }}</p>
    </header>

    <div class="benefice-card__body">
      <span v-if="loading" class="benefice-card__skeleton" aria-busy="true"></span>
      <span v-else class="benefice-card__value">{{ formattedValue }}</span>
    </div>

    <p v-if="error" class="benefice-card__error">{{ error }}</p>

    <slot name="footer" />
  </section>
</template>

<style scoped>
.benefice-card {
  background: var(--surface, #ffffff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  padding: 18px 20px;
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.benefice-card__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.benefice-card__label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0;
}

.benefice-card__description {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  margin: 0;
}

.benefice-card__body {
  min-height: 36px;
  display: flex;
  align-items: center;
}

.benefice-card__value {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text, #111827);
}

.benefice-card--positive .benefice-card__value {
  color: var(--success, #15803d);
}

.benefice-card--negative .benefice-card__value {
  color: var(--danger, #b91c1c);
}

.benefice-card__skeleton {
  display: inline-block;
  width: 140px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%);
  background-size: 200% 100%;
  animation: benefice-skeleton 1.4s ease-in-out infinite;
}

.benefice-card__error {
  font-size: 12px;
  color: var(--danger, #b91c1c);
  margin: 0;
}

@keyframes benefice-skeleton {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
