<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCustomerAuth } from '../../composables/auth/useCustomerAuth'
import { useCart } from '../../composables/front/useCart'

const route = useRoute()
const router = useRouter()
const { isRealCustomer, customerName, logout } = useCustomerAuth()
const { totalItems, hydrate } = useCart()

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
</style>
