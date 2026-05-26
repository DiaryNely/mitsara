<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCustomerAuth } from '../../composables/auth/useCustomerAuth'
import { useCart } from '../../composables/front/useCart'
import { loginAdmin, logoutAdmin } from '../../services/auth/adminAuthService'

const route = useRoute()
const router = useRouter()
const { isRealCustomer, customerName, logout } = useCustomerAuth()
const { totalItems, hydrate } = useCart()

/* ── Modale mot de passe admin ───────────────────────── */
const ADMIN_EMAIL = 'hasiniaina.nely@gmail.com'

const showStockModal = ref(false)
const adminPassword = ref('')
const modalError = ref('')
const modalLoading = ref(false)

const goToStockManagement = () => {
  adminPassword.value = ''
  modalError.value = ''
  showStockModal.value = true
}

const closeStockModal = () => {
  showStockModal.value = false
}

const confirmStockAccess = async () => {
  modalError.value = ''
  if (!adminPassword.value) {
    modalError.value = 'Veuillez saisir le mot de passe.'
    return
  }
  modalLoading.value = true
  try {
    const session = await loginAdmin({ email: ADMIN_EMAIL, password: adminPassword.value })
    await logoutAdmin(session.adminToken)
    showStockModal.value = false
    router.push('/front/stock-update')
  } catch {
    modalError.value = 'Mot de passe incorrect. Veuillez réessayer.'
  } finally {
    modalLoading.value = false
  }
}

const menuOpen = ref(false)
const headerSearch = ref('')

const submitSearch = () => {
  const term = headerSearch.value.trim()
  if (!term) return
  router.push({ path: '/front/products', query: { q: term } })
  headerSearch.value = ''
  menuOpen.value = false
}

const onSearchKeydown = (e) => {
  if (e.key === 'Enter') submitSearch()
}

const navItems = computed(() => {
  const items = [
    { label: 'Catalogue', to: '/front/products' },
    { label: 'Panier', to: '/front/cart' },
    { label: 'Mes commandes', to: '/front/orders' },
  ]

  if (!isRealCustomer.value) {
    items.unshift({ label: 'Accueil', to: '/front' })
  }

  return items
})

const initials = computed(() => {
  const value = customerName.value || ''
  const parts = value.split(' ').filter(Boolean)
  if (!parts.length) {
    return 'CL'
  }
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('')
})

const isActive = (path) => route.path === path

const handleLogout = async () => {
  await logout()
  router.push('/front')
}

hydrate()
</script>

<template>
  <header class="front-header">
    <div class="header-inner">

      <!-- Brand -->
      <router-link class="brand" to="/front">
        <div class="brand-mark">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect width="22" height="22" rx="7" fill="white" fill-opacity="0.15"/>
            <path d="M5 8h12M5 11h8M5 14h10" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-name">PrestaShop</span>
          <span class="brand-sub">Atelier</span>
        </div>
      </router-link>

      <!-- Nav centrale -->
      <nav class="nav" :class="{ 'nav--open': menuOpen }">
        <router-link
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="nav-link"
          :class="{ 'nav-link--active': isActive(item.to) }"
          @click="menuOpen = false"
        >
          {{ item.label }}
        </router-link>
        <button class="nav-link nav-stock-btn" type="button" @click="goToStockManagement">
          Gestion stock
        </button>
      </nav>

      <!-- Actions -->
      <div class="header-actions">
        <!-- Recherche -->
        <div class="search-pill" @click.stop>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <input
            v-model="headerSearch"
            type="search"
            placeholder="Rechercher…"
            aria-label="Recherche"
            @keydown="onSearchKeydown"
          />
        </div>

        <!-- Compte -->
        <div class="account-pill">
          <div class="account-avatar">{{ initials }}</div>
          <span class="account-name">
            {{ isRealCustomer ? customerName : 'Connexion' }}
          </span>
        </div>

        <!-- Panier -->
        <router-link class="cart-btn" to="/front/cart">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 3h2l.4 2M7 13h7l2-8H5.4m1.6 8a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="cart-label">Panier</span>
          <span class="cart-badge" :class="{ 'cart-badge--filled': totalItems > 0 }">{{ totalItems }}</span>
        </router-link>

        <!-- Auth -->
        <router-link v-if="!isRealCustomer" class="auth-btn auth-btn--ghost" to="/front">
          Choisir un compte
        </router-link>
        <button v-else class="auth-btn" type="button" @click="handleLogout">
          Déconnexion
        </button>

        <!-- Mobile toggle -->
        <button class="menu-toggle" type="button" @click="menuOpen = !menuOpen" :aria-expanded="menuOpen">
          <span :class="menuOpen ? 'line line--top-open' : 'line'"></span>
          <span :class="menuOpen ? 'line line--bot-open' : 'line'"></span>
        </button>
      </div>

    </div>
  </header>

  <!-- Modale authentification stock -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="showStockModal" class="modal-backdrop" @click.self="closeStockModal">
        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <div class="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div>
              <h2 id="modal-title" class="modal-title">Accès restreint</h2>
              <p class="modal-subtitle">Identifiez-vous avec vos identifiants administrateur.</p>
            </div>
            <button class="modal-close" type="button" @click="closeStockModal" aria-label="Fermer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div class="modal-field">
              <label class="modal-label" for="stock-password">Mot de passe administrateur</label>
              <input
                id="stock-password"
                v-model="adminPassword"
                type="password"
                class="modal-input"
                placeholder="••••••••"
                autocomplete="current-password"
                :disabled="modalLoading"
                @keydown.enter="confirmStockAccess"
                autofocus
              />
            </div>

            <Transition name="slide-down">
              <div v-if="modalError" class="modal-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M8 5v3.5M8 11h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                {{ modalError }}
              </div>
            </Transition>
          </div>

          <div class="modal-footer">
            <button class="modal-btn modal-btn--ghost" type="button" @click="closeStockModal" :disabled="modalLoading">
              Annuler
            </button>
            <button class="modal-btn modal-btn--primary" type="button" @click="confirmStockAccess" :disabled="modalLoading">
              <span v-if="modalLoading" class="btn-spinner-sm"></span>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ modalLoading ? 'Vérification…' : 'Accéder' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Shell ────────────────────────────────────────── */
.front-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--front-border);
  box-shadow: 0 1px 12px rgba(15, 23, 42, 0.06);
}

.header-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 clamp(16px, 4vw, 48px);
  height: 68px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 24px;
}

/* ── Brand ────────────────────────────────────────── */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--front-text);
  letter-spacing: -0.01em;
}

.brand-sub {
  font-size: 10.5px;
  color: var(--front-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* ── Navigation ───────────────────────────────────── */
.nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.nav-link {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--front-muted);
  padding: 7px 14px;
  border-radius: 999px;
  transition: all 150ms ease;
  text-decoration: none;
  white-space: nowrap;
}

.nav-link:hover {
  background: var(--front-accent-light);
  color: var(--front-accent);
}

.nav-link--active {
  background: var(--front-accent-light);
  color: var(--front-accent);
  font-weight: 600;
}

.nav-stock-btn {
  background: none;
  border: none;
  cursor: pointer;
}

/* ── Actions ──────────────────────────────────────── */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Search */
.search-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--front-surface-muted);
  border: 1px solid var(--front-border);
  color: var(--front-muted);
  min-width: 200px;
  transition: all 150ms ease;
}

.search-pill:focus-within {
  border-color: var(--front-accent);
  box-shadow: 0 0 0 3px var(--front-accent-light);
  background: var(--front-surface);
}

.search-pill input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  width: 100%;
  color: var(--front-text);
}

.search-pill input::placeholder {
  color: var(--front-muted);
}

/* Account */
.account-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 6px;
  border-radius: 999px;
  background: var(--front-surface-muted);
  border: 1px solid var(--front-border);
  cursor: default;
}

.account-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.account-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--front-text);
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Cart */
.cart-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px 8px 12px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  transition: all 150ms ease;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.3);
}

.cart-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.cart-label {
  white-space: nowrap;
}

.cart-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  background: rgba(255,255,255,0.25);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  padding: 0 5px;
}

.cart-badge--filled {
  background: white;
  color: var(--front-accent);
}

/* Auth */
.auth-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 12.5px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  text-decoration: none;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.auth-btn:hover {
  filter: brightness(1.1);
}

.auth-btn--ghost {
  background: transparent;
  border: 1px solid var(--front-border);
  color: var(--front-text);
}

.auth-btn--ghost:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
  filter: none;
}

/* Mobile toggle */
.menu-toggle {
  display: none;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--front-surface-muted);
  border: 1px solid var(--front-border);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}

.line {
  width: 16px;
  height: 1.5px;
  background: var(--front-text);
  border-radius: 2px;
  transition: transform 200ms ease, opacity 200ms ease;
}

.line--top-open { transform: translateY(2.75px) rotate(45deg); }
.line--bot-open { transform: translateY(-2.75px) rotate(-45deg); }

/* ── Responsive ───────────────────────────────────── */
@media (max-width: 1024px) {
  .nav {
    display: none;
  }

  .nav--open {
    display: grid;
    position: fixed;
    top: 68px;
    left: 16px;
    right: 16px;
    background: var(--front-surface);
    border: 1px solid var(--front-border);
    border-radius: var(--front-radius);
    padding: 12px 8px;
    box-shadow: var(--front-shadow);
    z-index: 60;
  }

  .nav--open .nav-link {
    text-align: center;
    padding: 10px;
  }

  .menu-toggle {
    display: flex;
  }
}

@media (max-width: 768px) {
  .header-inner {
    grid-template-columns: auto 1fr;
  }

  .search-pill {
    display: none;
  }

  .account-name {
    display: none;
  }

  .cart-label {
    display: none;
  }
}

/* ── Modale stock ──────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 16px;
}

.modal-box {
  background: white;
  border-radius: 18px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #f0f0ff;
  color: #6366f1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 3px;
  letter-spacing: -0.02em;
}

.modal-subtitle {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.modal-close {
  margin-left: auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms ease;
}

.modal-close:hover {
  background: #e2e8f0;
}

.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #374151;
}

.modal-input {
  height: 44px;
  padding: 0 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: all 150ms ease;
  box-sizing: border-box;
  width: 100%;
}

.modal-input:focus {
  border-color: #6366f1;
  background: white;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.modal-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.modal-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #dc2626;
}

.modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 24px 24px;
  justify-content: flex-end;
}

.modal-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 20px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 150ms ease;
  white-space: nowrap;
}

.modal-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.modal-btn--ghost {
  background: #f1f5f9;
  color: #374151;
}

.modal-btn--ghost:hover:not(:disabled) {
  background: #e2e8f0;
}

.modal-btn--primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.modal-btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.btn-spinner-sm {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

/* Transition modale */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 200ms ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .modal-box,
.modal-fade-leave-active .modal-box {
  transition: transform 200ms ease;
}
.modal-fade-enter-from .modal-box {
  transform: scale(0.96) translateY(8px);
}
.modal-fade-leave-to .modal-box {
  transform: scale(0.96) translateY(8px);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 200ms ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
