<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../../composables/auth/useAuth'

const route = useRoute()
const { store, logout } = useAuth()

const adminEmail = computed(() => store.adminSession?.email || 'Admin')
const userInitials = computed(() => {
  const email = adminEmail.value
  return email ? email.substring(0, 2).toUpperCase() : 'AD'
})

const handleLogout = async () => {
  await logout()
}

const navItems = [
  { name: 'Dashboard', to: '/dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  { name: 'Bénéfices', to: '/benefice', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { name: 'Commandes', to: '/orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { name: 'Ajout stock', to: '/stock', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { name: 'Historique', to: '/stock-history', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { name: 'Import', to: '/import', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { name: 'Maintenance', to: '/reset', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' }
]

const isActive = (to) => route.path === to
</script>

<template>
  <header class="admin-header">
    <div class="header-container">
      <div class="header-brand">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <span class="brand-name">PrestaManager</span>
      </div>

      <nav class="header-nav">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ 'is-active': isActive(item.to) }"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path :d="item.icon" />
          </svg>
          <span class="nav-label">{{ item.name }}</span>
        </router-link>
      </nav>

      <div class="header-actions">
        <div class="user-profile">
          <div class="avatar">{{ userInitials }}</div>
          <div class="user-info">
            <span class="user-email">{{ adminEmail }}</span>
            <span class="user-role">Admin</span>
          </div>
        </div>

        <button class="btn-logout" @click="handleLogout" title="Déconnexion">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.admin-header {
  background: var(--surface, #ffffff);
  border-bottom: 1px solid var(--border, #e5e7eb);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-container {
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
  padding: 0 24px;
  gap: 32px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.brand-logo {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: white;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
}

.brand-logo svg {
  width: 20px;
  height: 20px;
}

.brand-name {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text, #111827);
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-grow: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.header-nav::-webkit-scrollbar {
  display: none;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 99px;
  color: var(--text-muted, #6b7280);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--bg, #f9fafb);
  color: var(--text, #111827);
}

.nav-item.is-active {
  background: var(--accent-light, #eef2ff);
  color: var(--accent, #4f46e5);
}

.nav-icon {
  width: 18px;
  height: 18px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 20px;
  border-right: 1px solid var(--border, #e5e7eb);
}

.avatar {
  background: var(--bg, #f3f4f6);
  color: var(--text, #111827);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  border: 2px solid var(--border, #e5e7eb);
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-email {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #111827);
}

.user-role {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
}

.btn-logout {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-logout:hover {
  background: var(--danger-light, #fee2e2);
  color: var(--danger, #dc2626);
}

.btn-logout svg {
  width: 20px;
  height: 20px;
}

@media (max-width: 1024px) {
  .user-info {
    display: none;
  }
}

@media (max-width: 768px) {
  .header-container {
    height: auto;
    flex-wrap: wrap;
    padding: 16px;
    gap: 16px;
  }

  .header-brand {
    flex-grow: 1;
  }

  .header-nav {
    order: 3;
    width: 100%;
    padding-top: 16px;
    border-top: 1px solid var(--border, #e5e7eb);
  }

  .user-profile {
    padding-right: 12px;
    gap: 8px;
  }
}
</style>
