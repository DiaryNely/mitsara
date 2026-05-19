import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCustomerAuthStore } from '../../stores/auth/customerAuth'

const useCustomerAuth = () => {
  const store = useCustomerAuthStore()
  const { customer, session } = storeToRefs(store)

  const isAuthenticated = computed(() => Boolean(customer.value))
  // Vrai si le compte chargé est le compte anonyme GDPR (pas un vrai client)
  const isGuest        = computed(() => store.isGuest)
  const isRealCustomer = computed(() => isAuthenticated.value && !isGuest.value)

  const customerName = computed(() => {
    const value = customer.value
    if (!value) return ''
    const first = value.firstname || ''
    const last  = value.lastname  || ''
    return `${first} ${last}`.trim()
  })

  const customerId        = computed(() => customer.value?.id || '')
  const customerSecureKey = computed(() => customer.value?.secureKey || '')

  return {
    store,
    customer,
    session,
    isAuthenticated,
    isGuest,
    isRealCustomer,
    customerName,
    customerId,
    customerSecureKey,
    login:          store.login,
    loginByEmail:   store.loginByEmail,
    loginAsCustomer: store.loginAsCustomer,
    logout:         store.logout,
    restoreSession: store.restoreSession,
  }
}

export { useCustomerAuth }
