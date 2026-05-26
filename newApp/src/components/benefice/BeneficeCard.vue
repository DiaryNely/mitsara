<script setup>
// BeneficeCard — composant réutilisable pour afficher un montant de bénéfice.
//
// Conçu pour être importable dans n'importe quelle vue (Dashboard, vue dédiée, etc.).
// N'a aucune dépendance au store : reçoit ses données par props pour être 100% découplé.

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
  variant: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'positive', 'negative', 'auto'].includes(v),
  },
  badgeClass: {
    type: String,
    default: 'ds-badge-indigo',
  },
  currency: {
    type: String,
    default: 'EUR',
  },
  locale: {
    type: String,
    default: 'fr-FR',
  },
  isStyleCurrency: {
    type: Boolean,
    default: true,
  },
})

const formattedValue = computed(() => {
  const num = Number(props.value)
  if (!Number.isFinite(num)) return '—'
  if (!props.isStyleCurrency) return num.toLocaleString(props.locale)
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

const valueColorClass = computed(() => {
  if (resolvedVariant.value === 'positive') return 'kpi-green'
  if (resolvedVariant.value === 'negative') return 'kpi-red'
  return ''
})
</script>

<template>
  <div class="ds-card kpi-card">
    <div class="kpi-card-header">
      <span class="kpi-card-title">{{ label }}</span>
      <div :class="['ds-badge', badgeClass]">
        <slot name="icon">
          <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </slot>
      </div>
    </div>

    <div class="kpi-card-body">
      <div v-if="loading" class="skeleton ds-skeleton-value"></div>
      <div v-else class="kpi-content">
        <div class="kpi-val" :class="valueColorClass">{{ formattedValue }}</div>
        <p v-if="description" class="kpi-card-desc">{{ description }}</p>
      </div>
      <p v-if="error" class="ds-alert-error">{{ error }}</p>
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.ds-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
  overflow: hidden;
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
}

.ds-card:hover {
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06));
}

.kpi-card {
  padding: 24px;
}

.kpi-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.kpi-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ds-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
}
.ds-badge-indigo { background: var(--accent-light, #eef2ff); color: var(--accent, #4f46e5); }
.ds-badge-emerald { background: var(--success-light, #dcfce7); color: var(--success, #16a34a); }
.ds-badge-amber { background: var(--warning-light, #fef3c7); color: var(--warning, #d97706); }
.ds-badge-blue { background: var(--info-light, #dbeafe); color: var(--info, #2563eb); }
.ds-badge-red { background: var(--danger-light, #fee2e2); color: var(--danger, #dc2626); }

.ds-icon-sm {
  width: 16px;
  height: 16px;
}

.kpi-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kpi-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-val {
  font-size: 28px;
  font-weight: 800;
  color: var(--text, #111827);
  letter-spacing: -0.02em;
}
.kpi-green { color: var(--success, #15803d); }
.kpi-red { color: var(--danger, #b91c1c); }

.kpi-card-desc {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  margin: 0;
}

.ds-alert-error {
  font-size: 12px;
  color: var(--danger, #b91c1c);
  margin: 0;
}

.skeleton {
  display: inline-block;
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%);
  background-size: 200% 100%;
  animation: pulse 1.4s ease-in-out infinite;
}

.ds-skeleton-value {
  width: 140px;
  height: 36px;
  border-radius: 6px;
}

@keyframes pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
