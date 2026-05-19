<script setup>
import { computed } from 'vue'
import { getProductBadge } from '../../utils/productBadge'

const props = defineProps({
  product: { type: Object, required: true },
})

const emit = defineEmits(['add'])

const hasCombinations = computed(() => (props.product.combinationIds || []).length > 0)
const badge = computed(() => getProductBadge(props.product.dateAvailability))

const formatPrice = (price) => {
  const value = parseFloat(price || 0)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

const shortDescription = computed(() => {
  const text = String(props.product.descriptionShort || props.product.description || '')
  const clean = text.replace(/<[^>]+>/g, '').trim()
  if (!clean) {
    return 'Description produit indisponible.'
  }
  return clean.length > 120 ? `${clean.slice(0, 120)}...` : clean
})
</script>

<template>
  <article class="pcard">
    <!-- Image -->
    <div class="pcard-media">
      <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" />
      <div v-else class="pcard-placeholder">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity="0.2">
          <rect x="3" y="3" width="30" height="30" rx="6" stroke="currentColor" stroke-width="2"/>
          <path d="M3 24l8-8 6 6 4-4 12 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="24" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <span v-if="badge" class="pcard-badge" :class="`pcard-badge--${badge.toLowerCase()}`">
        {{ badge }}
      </span>
      <div v-if="hasCombinations" class="pcard-variants-pill">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4h8M4 8h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Déclinaisons
      </div>
    </div>

    <!-- Contenu -->
    <div class="pcard-body">
      <div class="pcard-top">
        <span class="pcard-ref">#{{ product.id || 'N/A' }}</span>
        <div class="pcard-prices">
          <span class="pcard-price">{{ formatPrice(product.priceTtc || product.price) }}</span>
          <span class="pcard-price-ht">{{ formatPrice(product.price) }} HT</span>
        </div>
      </div>

      <h3 class="pcard-name">{{ product.name || 'Produit sans nom' }}</h3>
      <p class="pcard-desc">{{ shortDescription }}</p>

      <div class="pcard-actions">
        <router-link class="pcard-link" :to="`/front/products/${product.id}`">
          Voir la fiche
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </router-link>
        <button
          class="pcard-btn"
          type="button"
          @click="emit('add', product)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" v-if="!hasCombinations"/>
            <path d="M2 5l5 1 5-1M2 5v7l5 1 5-1V5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" v-else/>
          </svg>
          {{ hasCombinations ? 'Choisir' : 'Ajouter' }}
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* ── Carte ────────────────────────────────────────── */
.pcard {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow 180ms ease, transform 180ms ease;
  box-shadow: var(--shadow-sm);
}

.pcard:hover {
  transform: translateY(-3px);
  box-shadow: var(--front-shadow);
}

/* ── Média ────────────────────────────────────────── */
.pcard-media {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--front-surface-muted);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pcard-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 250ms ease;
}

.pcard:hover .pcard-media img {
  transform: scale(1.06);
}

.pcard-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--front-muted);
}

/* Badges */
.pcard-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: white;
  z-index: 1;
}

.pcard-badge--hot { background: var(--danger); }
.pcard-badge--new { background: var(--warning); }

.pcard-variants-pill {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(4px);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--front-accent);
  border: 1px solid rgba(99,102,241,0.15);
}

/* ── Corps ────────────────────────────────────────── */
.pcard-body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.pcard-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.pcard-ref {
  font-size: 11px;
  color: var(--front-muted);
  font-family: 'SF Mono', monospace;
  letter-spacing: 0.04em;
}

.pcard-prices {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pcard-price {
  font-size: 16px;
  font-weight: 800;
  color: var(--front-accent);
  letter-spacing: -0.02em;
}

.pcard-price-ht {
  font-size: 11px;
  color: var(--front-muted);
}

.pcard-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--front-text);
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.pcard-desc {
  font-size: 12.5px;
  color: var(--front-muted);
  line-height: 1.55;
  flex: 1;
}

/* ── Actions ──────────────────────────────────────── */
.pcard-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid var(--front-border);
}

.pcard-link {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--front-muted);
  text-decoration: none;
  transition: color 150ms ease;
}

.pcard-link:hover {
  color: var(--front-accent);
}

.pcard-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 12.5px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.pcard-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
</style>
