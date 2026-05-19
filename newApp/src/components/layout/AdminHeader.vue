<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../../composables/auth/useAuth'

const route = useRoute()
const { store, logout } = useAuth()

const adminEmail = computed(() => store.adminSession?.email || 'Admin')

const handleLogout = async () => {
  await logout()
}

const breadcrumb = computed(() => {
  const map = {
    '/dashboard': ['Dashboard'],
    '/benefice': ['Bénéfices'],
    '/orders': ['Ventes', 'Commandes'],
    '/reset': ['Maintenance', 'Reinitialisation'],
    '/import': ['Catalogue', 'Import Wizard'],
  }
  return map[route.path] || ['Dashboard']
})

const navGroups = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard', to: '/dashboard', enabled: true },
      { name: 'Bénéfices', to: '/benefice', enabled: true },
    ],
  },
  {
    label: 'Ventes',
    items: [
      { name: 'Commandes', to: '/orders', enabled: true },
      // { name: 'Paniers', to: '/carts', enabled: false },
      // { name: 'Factures', to: '/invoices', enabled: false },
    ],
  },
  {
    label: 'Stock',
    items: [
      { name: 'Ajout stock', to: '/stock', enabled: true },
      { name: 'Historique', to: '/stock-history', enabled: true },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { name: 'Reinitialisation', to: '/reset', enabled: true },
      { name: 'Import de Donnee', to: '/import', enabled: true },
    ],
  },
]

const isActive = (to) => route.path === to
</script>

<template>
  <header class="header">

    <div class="header-top">

      <!-- ── Gauche : fil d'Ariane ── -->
      <div class="header-start">
        <div class="breadcrumb">
          <span class="breadcrumb-home">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8.5l6-5.5 6 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3.5 7.5V13a1 1 0 001 1h7a1 1 0 001-1V7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </span>
          <template v-for="(crumb, idx) in breadcrumb" :key="idx">
            <svg class="breadcrumb-sep" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span :class="idx === breadcrumb.length - 1 ? 'breadcrumb-current' : 'breadcrumb-parent'">
              {{ crumb }}
            </span>
          </template>
        </div>
      </div>

      <!-- ── Centre : recherche ── -->
      <div class="header-center">
        <div class="search-box">
          <svg class="search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <input type="text" placeholder="Rechercher..." class="search-input" id="global-search" />
          <kbd class="search-kbd">⌘K</kbd>
        </div>
      </div>

      <!-- ── Droite : actions ── -->
      <div class="header-end">
        <button class="header-btn" id="notifications-btn" title="Notifications">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2a4.5 4.5 0 00-4.5 4.5v2.7L3 11.5h12L13.5 9.2V6.5A4.5 4.5 0 009 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M7.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <span class="notification-badge">3</span>
        </button>

        <div class="header-vr" aria-hidden="true"></div>

        <div class="user-area" id="user-menu">
          <div class="user-avatar">
            <span>A</span>
          </div>
          <div class="user-info">
            <span class="user-name">{{ adminEmail }}</span>
            <span class="user-role">Administrateur</span>
          </div>
        </div>

        <button class="logout-btn" type="button" @click="handleLogout">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M5.5 7.5h7M10 5l2.5 2.5L10 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 3H3.5a1 1 0 00-1 1v7a1 1 0 001 1H8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <span>Deconnexion</span>
        </button>
      </div>

    </div>

    <nav class="header-nav" aria-label="Navigation">
      <div v-for="group in navGroups" :key="group.label" class="nav-group">
        <span class="nav-group-label">{{ group.label }}</span>
        <div class="nav-links">
          <template v-for="item in group.items" :key="item.to">
            <router-link
              v-if="item.enabled"
              :to="item.to"
              class="nav-link"
              :class="{ active: isActive(item.to) }"
            >
              {{ item.name }}
            </router-link>
            <span v-else class="nav-link nav-link--disabled" :title="item.name + ' (bientot)'">
              {{ item.name }}
            </span>
          </template>
        </div>
      </div>
    </nav>

  </header>
</template>

<style scoped>
/* ── Header shell ─────────────────────────────────────── */
.header {
  min-height: var(--header-height);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 12px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 20px 8px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.header-top {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  width: 100%;
}

/* ── Gauche ───────────────────────────────────────────── */
.header-start {
  display: flex;
  align-items: center;
  min-width: 0;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  min-width: 0;
}

.breadcrumb-home {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.breadcrumb-sep {
  color: var(--text-muted);
  opacity: 0.4;
  flex-shrink: 0;
}

.breadcrumb-parent {
  color: var(--text-muted);
  white-space: nowrap;
}

.breadcrumb-current {
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}

/* ── Centre : recherche ───────────────────────────────── */
.header-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-full);
  padding: 7px 14px;
  transition: all var(--transition-fast);
  width: 280px;
}

.search-box:focus-within {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-light);
  background: var(--surface);
  width: 320px;
}

.search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  width: 100%;
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-kbd {
  font-size: 10.5px;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 1px 5px;
  line-height: 1.6;
  flex-shrink: 0;
  font-family: inherit;
}

/* ── Droite : actions ─────────────────────────────────── */
.header-end {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
}

/* ── Nav header ───────────────────────────────────────── */
.header-nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.nav-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.nav-group-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.nav-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.nav-link {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.nav-link:hover {
  border-color: var(--accent-border);
  color: var(--accent);
}

.nav-link.active {
  background: var(--accent-light);
  border-color: var(--accent-border);
  color: var(--accent);
}

.nav-link--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.header-vr {
  width: 1px;
  height: 22px;
  background: var(--border);
  margin: 0 6px;
  flex-shrink: 0;
}

.header-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  transition: all var(--transition-fast);
}

.header-btn:hover {
  background: var(--bg);
  color: var(--text);
}

.notification-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  background: var(--danger);
  color: white;
  font-size: 9px;
  font-weight: 700;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2px var(--surface);
}

.user-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px 5px 5px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.user-area:hover {
  background: var(--bg);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.3;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.logout-btn:hover {
  background: var(--danger-light);
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.15);
}

@media (max-width: 900px) {
  .header-top {
    grid-template-columns: 1fr auto;
  }

  .header-center {
    display: none;
  }

  .nav-group-label {
    display: none;
  }
}

@media (max-width: 640px) {
  .user-info {
    display: none;
  }

  .logout-btn span {
    display: none;
  }
}
</style>
