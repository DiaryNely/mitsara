import { storeToRefs } from 'pinia'
import { useAuthStore } from '../../stores/auth/auth'

const useAuth = () => {
  const store = useAuthStore()
  const { isAuthenticated, employeeFullName } = storeToRefs(store)

  return {
    store,
    isAuthenticated,
    employeeFullName,
    hasPermission: store.hasPermission,
    login: store.login,
    logout: store.logout,
    restoreSession: store.restoreSession,
  }
}

export { useAuth }
