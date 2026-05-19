<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle'])

const navGroups = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard', icon: 'dashboard', to: '/dashboard', enabled: true },
      { name: 'Bénéfices', icon: 'benefice', to: '/benefice', enabled: true },
    ],
  },

  // {
  //   label: 'Catalogue',
  //   items: [
  //     { name: 'Catégories', icon: 'categories', to: '/categories', enabled: false },
  //     { name: 'Marques', icon: 'brands', to: '/manufacturers', enabled: false },
  //     { name: 'Fournisseurs', icon: 'suppliers', to: '/suppliers', enabled: false },
  //   ],
  // }
  // ,
  {
    label: 'Ventes',
    items: [
      { name: 'Commandes', icon: 'orders', to: '/orders', enabled: true }
      // { name: 'Paniers', icon: 'carts', to: '/carts', enabled: false },
      // { name: 'Factures', icon: 'invoices', to: '/invoices', enabled: false },
    ],
  },
  // {
  //   label: 'Clients',
  //   items: [
  //     { name: 'Clients', icon: 'customers', to: '/customers', enabled: false },
  //     { name: 'Adresses', icon: 'addresses', to: '/addresses', enabled: false },
  //   ],
  // },
  {
    label: 'Stock',
    items: [
      { name: 'Ajout de stock', icon: 'stock', to: '/stock', enabled: true },
      { name: 'Historique', icon: 'movements', to: '/stock-history', enabled: true },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { name: 'Reinitialisation', icon: 'reset', to: '/reset', enabled: true },
      { name: 'Import De fichier', icon: 'import', to: '/import', enabled: true },
    ],
  },
]

const isActive = (to) => {
  return route.path === to
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <!-- Brand -->
    <div class="brand">
      <div class="brand-icon">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="8" fill="var(--sidebar-accent)" />
          <path d="M8 10h12M8 14h8M8 18h10" stroke="#fff" stroke-width="2" stroke-linecap="round" />
        </svg>
      </div>
      <transition name="fade-text">
        <div v-if="!collapsed" class="brand-text">
          <span class="brand-name">EVAL</span>
          <span class="brand-sub">NEWAPP</span>
          <span class="brand-student-id">ETU003123</span>
        </div>
      </transition>
    </div>

    <!-- Navigation -->
    <nav class="nav">
      <div v-for="group in navGroups" :key="group.label" class="nav-group">
        <transition name="fade-text">
          <span v-if="!collapsed" class="nav-group-label">{{ group.label }}</span>
        </transition>
        <div v-if="collapsed" class="nav-group-divider"></div>

        <template v-for="item in group.items" :key="item.to">
          <router-link
            v-if="item.enabled"
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.to) }"
          >
            <span class="nav-icon" v-html="getIcon(item.icon)"></span>
            <transition name="fade-text">
              <span v-if="!collapsed" class="nav-label">{{ item.name }}</span>
            </transition>
            <transition name="fade-text">
              <span v-if="!collapsed && isActive(item.to)" class="nav-active-dot"></span>
            </transition>
          </router-link>

          <div v-else class="nav-item disabled" :title="item.name + ' (bientôt)'">
            <span class="nav-icon" v-html="getIcon(item.icon)"></span>
            <transition name="fade-text">
              <span v-if="!collapsed" class="nav-label">{{ item.name }}</span>
            </transition>
          </div>
        </template>
      </div>
    </nav>

    <!-- Collapse toggle -->
    <button class="collapse-btn" @click="emit('toggle')" :title="collapsed ? 'Ouvrir le menu' : 'Réduire le menu'">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" :style="{ transform: collapsed ? 'rotate(180deg)' : 'none' }">
        <path d="M11 4L6 9l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <transition name="fade-text">
        <span v-if="!collapsed">Réduire</span>
      </transition>
    </button>
  </aside>
</template>

<script>
function getIcon(name) {
  const icons = {
    dashboard: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="2" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="11" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>`,
    products: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6l7-4 7 4v8l-7 4-7-4V6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 6l7 4m0 0l7-4m-7 4v8" stroke="currentColor" stroke-width="1.5"/></svg>`,
    categories: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="currentColor" stroke-width="1.5"/></svg>`,
    brands: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    suppliers: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 3H7a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2z" stroke="currentColor" stroke-width="1.5"/><path d="M8 7h4M8 10h4M8 13h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    carts: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 3h2l.4 2M7 13h8l2-8H5.4M7 13l-.4-2m.4 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    orders: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 7h8M6 10h8M6 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    invoices: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5"/><path d="M12 3v4h4M8 10h4M8 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    customers: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    addresses: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 17s-6-4.35-6-8a6 6 0 1112 0c0 3.65-6 8-6 8z" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="9" r="2" stroke="currentColor" stroke-width="1.5"/></svg>`,
    stock: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 14l4-4 3 3 4-4 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v14h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    movements: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    reset: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 111.8 4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 14v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    import: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 8.5L10 12l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    benefice: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M14 6.5C14 5.12 12.21 4 10 4S6 5.12 6 6.5 7.79 9 10 9s4 1.12 4 2.5S12.21 13 10 13s-4-1.12-4-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  }
  return icons[name] || icons.dashboard
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: linear-gradient(195deg, #1e1b4b 0%, #0d0c2a 60%, #0b0a22 100%);
  display: flex;
  flex-direction: column;
  transition: width var(--transition-base);
  overflow: hidden;
  position: relative;
  z-index: 100;
  flex-shrink: 0;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--sidebar-divider);
  min-height: 64px;
}

.brand-icon {
  flex-shrink: 0;
  filter: drop-shadow(0 0 10px rgba(129, 140, 248, 0.45));
}

.brand-text {
  display: flex;
  flex-direction: column;
  white-space: nowrap;
  overflow: hidden;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--sidebar-text-active);
  letter-spacing: -0.02em;
}

.brand-sub {
  font-size: 10.5px;
  color: var(--sidebar-accent);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 600;
}

.brand-student-id {
  font-size: 10px;
  color: var(--sidebar-text);
  letter-spacing: 0.03em;
  opacity: 0.55;
}

/* Navigation */
.nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 10px;
}

.nav::-webkit-scrollbar {
  width: 4px;
}

.nav::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

.nav-group {
  margin-bottom: 8px;
}

.nav-group-label {
  display: block;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--sidebar-text);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 12px 12px 6px;
  white-space: nowrap;
  opacity: 0.45;
}

.nav-group-divider {
  height: 1px;
  background: var(--sidebar-divider);
  margin: 8px 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  color: var(--sidebar-text);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  white-space: nowrap;
  min-height: 40px;
}

.nav-item:hover:not(.disabled) {
  background: var(--sidebar-bg-hover);
  color: var(--sidebar-text-active);
}

.nav-item.active {
  background: var(--sidebar-accent-glow);
  color: var(--sidebar-text-active);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 3px;
  background: var(--sidebar-accent);
  border-radius: 0 3px 3px 0;
}

.nav-item.active .nav-icon {
  color: var(--sidebar-accent);
}

.nav-item.disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.nav-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 13.5px;
  font-weight: 500;
}

.nav-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sidebar-accent);
  margin-left: auto;
  flex-shrink: 0;
  box-shadow: 0 0 6px var(--sidebar-accent);
}

/* Collapse button */
.collapse-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 22px;
  color: var(--sidebar-text);
  font-size: 13px;
  font-weight: 500;
  border-top: 1px solid var(--sidebar-divider);
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.collapse-btn:hover {
  color: var(--sidebar-text-active);
  background: var(--sidebar-bg-hover);
}

.collapse-btn svg {
  flex-shrink: 0;
  transition: transform var(--transition-base);
}

/* Text fade transition */
.fade-text-enter-active {
  transition: opacity var(--transition-fast);
}
.fade-text-leave-active {
  transition: opacity 100ms;
}
.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
}
</style>
