<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCustomerAuth } from '../../composables/auth/useCustomerAuth'
import { useFrontCartStore } from '../../stores/front/cart'
import { GDPR_ANONYMOUS_EMAIL } from '../../config/guestUser'
import { getFrontCustomers } from '../../services/frontoffice/customerService'

const router = useRouter()
const route = useRoute()

const { isRealCustomer, customerName, loginAsCustomer } = useCustomerAuth()
const cartStore = useFrontCartStore()

const customers = ref([])
const loading = ref(false)
const error = ref('')
const searchTerm = ref('')

const confirmOpen = ref(false)
const confirmLoading = ref(false)
const confirmError = ref('')
const pendingCustomer = ref(null)

const loadCustomers = async () => {
  loading.value = true
  error.value = ''

  try {
    const result = await getFrontCustomers({ page: 1, pageSize: 500 })
    customers.value = result.items || []
  } catch (err) {
    error.value = err?.message || 'Impossible de charger les comptes.'
  } finally {
    loading.value = false
  }
}

const isAnonymousCustomer = (customer) =>
  customer?.email?.toLowerCase() === GDPR_ANONYMOUS_EMAIL.toLowerCase()

const displayName = (customer) => {
  if (isAnonymousCustomer(customer)) return 'Utilisateur anonyme'
  const name = [customer.firstname, customer.lastname].filter(Boolean).join(' ').trim()
  if (name) return name
  if (customer.email) return customer.email.split('@')[0]
  return `Client #${customer.id || 'N/A'}`
}

const anonymousCustomer = computed(() =>
  customers.value.find((customer) => customer.active === 1 && isAnonymousCustomer(customer)) || null
)

const regularCustomers = computed(() =>
  customers.value.filter((customer) => customer.active === 1 && !isAnonymousCustomer(customer))
)

const filteredCustomers = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()

  return regularCustomers.value.filter((customer) => {
    if (!term) return true
    const haystack = `${customer.firstname} ${customer.lastname} ${customer.email}`.toLowerCase()
    return haystack.includes(term)
  })
})

const handleSelect = (customer) => {
  pendingCustomer.value = customer
  confirmError.value = ''
  confirmOpen.value = true
}

const closeConfirm = () => {
  confirmOpen.value = false
  confirmError.value = ''
  pendingCustomer.value = null
}

const handleConfirm = async () => {
  if (!pendingCustomer.value) {
    return
  }

  confirmLoading.value = true
  confirmError.value = ''

  try {
    const session = await loginAsCustomer(pendingCustomer.value)
    const customerId = session?.customer?.id

    // initialize() gère le cas où le store n'est pas encore prêt (premier chargement).
    // claimForCustomer() gère le cas où le panier anonyme existait déjà (initialize
    // déjà appelée par le guard en mode anonyme → initialized=true → initialize no-op).
    await cartStore.initialize({ customerId })
    await cartStore.claimForCustomer(customerId)

    const redirectTarget =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : '/front/products'

    router.replace(redirectTarget)
  } catch (err) {
    confirmError.value = err?.message || 'Connexion impossible.'
  } finally {
    confirmLoading.value = false
  }
}

const goToCatalog = () => {
  router.push('/front/products')
}

const requiresLogin = computed(() => {
  if (typeof route.query.redirect !== 'string') {
    return false
  }

  return route.query.redirect.startsWith('/front/checkout') ||
    route.query.redirect.startsWith('/front/orders')
})

onMounted(loadCustomers)
</script>

<template>
  <div class="home-page">

    <!-- ── Hero ── -->
    <section class="home-hero">
      <div class="hero-inner">
        <div class="hero-content">
          <div class="hero-eyebrow">
            <span class="eyebrow-dot"></span>
            Front Office PrestaShop
          </div>
          <h1 class="hero-title">
            Choisissez votre <span class="hero-accent">compte client</span>
          </h1>
          <p class="hero-sub">
            Sélectionnez un utilisateur pour accéder au catalogue, gérer votre panier et suivre vos commandes.
          </p>
        </div>

        <!-- Session active -->
        <div v-if="isRealCustomer" class="session-card">
          <div class="session-avatar">{{ customerName?.slice(0, 2).toUpperCase() || 'CL' }}</div>
          <div class="session-info">
            <span class="session-label">Connecté en tant que</span>
            <strong class="session-name">{{ customerName || 'Client' }}</strong>
          </div>
          <button class="session-btn" type="button" @click="goToCatalog">
            Voir le catalogue
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3 6.5h7M7 3.5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </section>

    <div class="home-body">

      <!-- Bandeau connexion requise -->
      <div v-if="requiresLogin" class="info-banner">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 5v3.5M8 11h.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        Connectez-vous avec un compte existant pour finaliser votre commande.
      </div>

      <!-- Accès anonyme -->
      <section v-if="!loading && anonymousCustomer" class="anon-section">
        <div class="anon-badge">Accès rapide</div>
        <div class="anon-card">
          <div class="anon-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="anon-info">
            <strong>{{ displayName(anonymousCustomer) }}</strong>
            <p>{{ anonymousCustomer.email }}</p>
            <p class="anon-note">Parcourez le catalogue et ajoutez des produits au panier. Connectez-vous avec un compte réel pour valider votre commande.</p>
          </div>
          <button class="anon-btn" type="button" @click="handleSelect(anonymousCustomer)">
            Continuer en anonyme
          </button>
        </div>
      </section>

      <!-- Barre de recherche & rechargement -->
      <div class="customers-toolbar">
        <div class="search-field">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <input
            v-model="searchTerm"
            type="search"
            placeholder="Rechercher un client…"
            aria-label="Recherche client"
          />
        </div>
        <div class="toolbar-meta">
          <span v-if="!loading" class="customer-count">
            {{ filteredCustomers.length }} compte{{ filteredCustomers.length !== 1 ? 's' : '' }}
          </span>
          <button class="reload-btn" type="button" @click="loadCustomers" :disabled="loading">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" :class="{ spinning: loading }">
              <path d="M12 7A5 5 0 113.4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M3.5 1.5l.2 2.8L6.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      <!-- Erreur -->
      <div v-if="error" class="error-banner">{{ error }}</div>

      <!-- Skeleton -->
      <div v-if="loading" class="customers-grid">
        <div v-for="n in 6" :key="n" class="customer-skeleton"></div>
      </div>

      <!-- Grille clients -->
      <div v-else class="customers-grid">
        <article
          v-for="customer in filteredCustomers"
          :key="customer.id"
          class="customer-card"
        >
          <div class="ccard-avatar">
            {{ displayName(customer).slice(0, 2).toUpperCase() }}
          </div>
          <div class="ccard-info">
            <h3>{{ displayName(customer) }}</h3>
            <p>{{ customer.email }}</p>
          </div>
          <button class="ccard-btn" type="button" @click="handleSelect(customer)">
            Se connecter
          </button>
        </article>
      </div>

      <!-- Vide -->
      <div
        v-if="!loading && !filteredCustomers.length && (searchTerm.trim() || !anonymousCustomer)"
        class="customers-empty"
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity="0.25">
          <circle cx="20" cy="14" r="7" stroke="currentColor" stroke-width="2"/>
          <path d="M7 34c0-7.18 5.82-13 13-13s13 5.82 13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p v-if="searchTerm.trim()">Aucun client ne correspond à "<strong>{{ searchTerm }}</strong>".</p>
        <p v-else>Aucun compte actif trouvé.</p>
      </div>

    </div>

    <!-- Modal confirmation -->
    <div v-if="confirmOpen" class="modal-overlay" @click.self="closeConfirm">
      <div class="modal">
        <div class="modal-avatar">
          {{ displayName(pendingCustomer || {}).slice(0, 2).toUpperCase() }}
        </div>
        <h3>Confirmer la connexion</h3>
        <p>
          Vous allez vous connecter en tant que
          <strong>{{ displayName(pendingCustomer || {}) }}</strong>.
        </p>
        <div v-if="confirmError" class="modal-error">{{ confirmError }}</div>
        <div class="modal-actions">
          <button class="modal-cancel" type="button" @click="closeConfirm" :disabled="confirmLoading">
            Annuler
          </button>
          <button class="modal-confirm" type="button" @click="handleConfirm" :disabled="confirmLoading">
            {{ confirmLoading ? 'Connexion…' : 'Confirmer' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Page ─────────────────────────────────────────── */
.home-page {
  min-height: calc(100vh - 68px);
  background: var(--front-bg);
}

/* ── Hero ─────────────────────────────────────────── */
.home-hero {
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 55%, #ede9fe 100%);
  border-bottom: 1px solid rgba(99,102,241,.12);
  padding: 56px clamp(16px, 4vw, 48px) 48px;
}

.hero-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
}

.hero-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 560px;
}

.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--front-accent);
}

.eyebrow-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--front-accent);
}

.hero-title {
  font-size: clamp(24px, 3.5vw, 38px);
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0;
}

.hero-accent {
  color: var(--front-accent);
}

.hero-sub {
  font-size: 15px;
  color: var(--front-muted);
  line-height: 1.65;
  margin: 0;
}

/* Session active */
.session-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: white;
  border: 1.5px solid rgba(99,102,241,.2);
  border-radius: var(--front-radius);
  box-shadow: 0 4px 20px rgba(99,102,241,.1);
  min-width: 280px;
}

.session-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  flex-shrink: 0;
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.session-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--front-muted);
  font-weight: 600;
}

.session-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
}

.session-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
  box-shadow: 0 3px 10px rgba(99,102,241,.3);
}

.session-btn:hover {
  filter: brightness(1.1);
}

/* ── Body ─────────────────────────────────────────── */
.home-body {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 48px) 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Bandeaux ─────────────────────────────────────── */
.info-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(245,158,11,.08);
  border: 1px solid rgba(245,158,11,.25);
  border-radius: var(--front-radius);
  font-size: 13.5px;
  font-weight: 600;
  color: #92400e;
}

.error-banner {
  padding: 12px 16px;
  background: var(--danger-light);
  color: var(--danger);
  border-radius: var(--front-radius);
  font-size: 13.5px;
  border-left: 3px solid var(--danger);
}

/* ── Accès anonyme ────────────────────────────────── */
.anon-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.anon-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--front-accent);
}

.anon-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 22px;
  background: var(--front-surface);
  border: 1.5px solid rgba(99,102,241,.18);
  border-radius: var(--front-radius);
  box-shadow: var(--front-shadow);
  flex-wrap: wrap;
}

.anon-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--front-accent-light);
  color: var(--front-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.anon-info {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.anon-info strong {
  font-size: 15px;
  font-weight: 700;
  color: var(--front-text);
}

.anon-info p {
  font-size: 12.5px;
  color: var(--front-muted);
  margin: 0;
}

.anon-note {
  margin-top: 4px !important;
  font-size: 12px !important;
  line-height: 1.5;
}

.anon-btn {
  padding: 10px 20px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
  align-self: center;
  box-shadow: 0 3px 10px rgba(99,102,241,.3);
}

.anon-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* ── Toolbar ──────────────────────────────────────── */
.customers-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--front-surface);
  border: 1.5px solid var(--front-border);
  color: var(--front-muted);
  min-width: 280px;
  flex: 1;
  max-width: 400px;
  transition: all 150ms ease;
}

.search-field:focus-within {
  border-color: var(--front-accent);
  box-shadow: 0 0 0 3px var(--front-accent-light);
  color: var(--front-text);
}

.search-field input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13.5px;
  width: 100%;
  color: var(--front-text);
}

.search-field input::placeholder {
  color: var(--front-muted);
}

.toolbar-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.customer-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
}

.reload-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
}

.reload-btn:hover:not(:disabled) {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.reload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

/* ── Grille clients ───────────────────────────────── */
.customers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.customer-skeleton {
  height: 100px;
  border-radius: var(--front-radius);
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  animation: pulse 1.5s ease-in-out infinite;
}

.customer-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  box-shadow: var(--shadow-sm);
  transition: all 150ms ease;
}

.customer-card:hover {
  border-color: var(--front-accent);
  box-shadow: var(--front-shadow);
  transform: translateY(-2px);
}

.ccard-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%);
  color: var(--front-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
  border: 1.5px solid rgba(99,102,241,.15);
}

.ccard-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ccard-info h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ccard-info p {
  font-size: 12px;
  color: var(--front-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.ccard-btn {
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 12px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.ccard-btn:hover {
  filter: brightness(1.12);
}

/* ── Vide ─────────────────────────────────────────── */
.customers-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
  background: var(--front-surface);
  border: 1px dashed var(--front-border);
  border-radius: var(--front-radius);
  text-align: center;
}

.customers-empty p {
  font-size: 14px;
  color: var(--front-muted);
  margin: 0;
}

/* ── Modal ────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.modal {
  background: var(--front-surface);
  border-radius: 20px;
  border: 1px solid var(--front-border);
  padding: 32px;
  max-width: 400px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  text-align: center;
}

.modal-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
}

.modal h3 {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0;
}

.modal p {
  font-size: 14px;
  color: var(--front-text);
  margin: 0;
}

.modal-error {
  width: 100%;
  padding: 10px 14px;
  background: var(--danger-light);
  color: var(--danger);
  border-radius: var(--radius-md);
  font-size: 13px;
  border-left: 3px solid var(--danger);
  text-align: left;
}

.modal-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: 4px;
}

.modal-cancel {
  flex: 1;
  height: 42px;
  border-radius: 999px;
  border: 1.5px solid var(--front-border);
  background: transparent;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
}

.modal-cancel:hover:not(:disabled) {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.modal-cancel:disabled {
  opacity: 0.4;
}

.modal-confirm {
  flex: 1;
  height: 42px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 13.5px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 3px 12px rgba(99,102,241,.3);
}

.modal-confirm:hover:not(:disabled) {
  filter: brightness(1.1);
}

.modal-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .hero-inner {
    flex-direction: column;
    align-items: flex-start;
  }

  .session-card {
    width: 100%;
    min-width: 0;
  }

  .anon-card {
    flex-direction: column;
  }

  .search-field {
    min-width: 0;
    max-width: 100%;
    flex: 1;
  }
}
</style>
