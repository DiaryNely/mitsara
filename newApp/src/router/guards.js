import { useAuthStore } from '../stores/auth/auth'
import { useCustomerAuthStore } from '../stores/auth/customerAuth'
import { useFrontCartStore } from '../stores/front/cart'

const authGuard = async (to) => {
  const authStore = useAuthStore()
  const requiresAuth = to.meta?.requiresAuth !== false

  if (!authStore.hasRestored) {
    await authStore.restoreSession()
  }

  if (requiresAuth && !authStore.isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  if (requiresAuth && to.meta?.permission) {
    if (!authStore.hasPermission(to.meta.permission)) {
      return { path: '/dashboard', query: { forbidden: '1' } }
    }
  }

  if (!requiresAuth && authStore.isAuthenticated && to.path === '/login') {
    return { path: '/dashboard' }
  }

  return true
}

const frontAuthGuard = async (to) => {
  const isFront = to.meta?.layout === 'front' || to.path.startsWith('/front')
  if (!isFront) {
    return true
  }

  const customerStore = useCustomerAuthStore()
  if (!customerStore.hasRestored) {
    customerStore.restoreSession()
  }

  // Initialiser le panier : anonymes (ownerId vide) ET authentifiés.
  const cartStore = useFrontCartStore()
  if (!cartStore.initialized) {
    cartStore.initialize({ customerId: customerStore.customer?.id || '' }).catch(() => {})
  }

  if (to.meta?.frontAuth && (!customerStore.isAuthenticated || customerStore.isGuest)) {
    return {
      path: '/front/login',
      query: { redirect: to.fullPath },
    }
  }

  // Ne rediriger depuis la page de login que si c'est un vrai client (pas le guest).
  if (to.path === '/front' && customerStore.isAuthenticated && !customerStore.isGuest) {
    return { path: '/front/products' }
  }

  if (!to.meta?.frontAuth && to.path === '/front/login' && customerStore.isAuthenticated && !customerStore.isGuest) {
    return { path: '/front/products' }
  }

  return true
}

export { authGuard, frontAuthGuard }
