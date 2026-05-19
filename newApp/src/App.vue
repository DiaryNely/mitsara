<script setup>
import { computed } from 'vue'
import AdminHeader from './components/layout/AdminHeader.vue'
import AdminFooter from './components/layout/AdminFooter.vue'
import FrontHeader from './components/front/FrontHeader.vue'
import FrontFooter from './components/front/FrontFooter.vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
const layout = computed(() => {
  if (route.meta.layout === 'front') {
    return 'front'
  }
  if (route.meta.requiresAuth === false) {
    return 'auth'
  }
  return 'admin'
})

</script>

<template>
  <div v-if="layout === 'admin'" class="admin-layout">
    <div class="admin-main">
      <AdminHeader />

      <main class="admin-content">
        <RouterView v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>

      <AdminFooter />
    </div>
  </div>

  <div v-else-if="layout === 'front'" class="front-layout">
    <FrontHeader />
    <main class="front-content">
      <RouterView v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
    <FrontFooter />
  </div>

  <div v-else class="auth-layout">
    <RouterView v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </RouterView>
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background: var(--bg);
}

.admin-main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.admin-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px 32px;
  background: var(--bg);
}

.auth-layout {
  min-height: 100vh;
  background: var(--bg);
}

.front-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--front-bg);
  color: var(--front-text);
  overflow-y: auto;
}

.front-content {
  flex: 1;
}

/* Page transition */
.page-enter-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.page-leave-active {
  transition: opacity 150ms ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .admin-content {
    padding: 20px 16px;
  }
}
</style>
