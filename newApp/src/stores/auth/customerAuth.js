import { defineStore } from 'pinia'
import {
  loginCustomer,
  loginCustomerByEmail,
  createCustomerSession,
  getStoredCustomerSession,
  clearCustomerSession,
} from '../../services/frontoffice/customerAuthService'
import { useFrontCartStore } from '../front/cart'
import { GDPR_ANONYMOUS_EMAIL } from '../../config/guestUser'

const useCustomerAuthStore = defineStore('customerAuth', {
  state: () => ({
    session: null,
    customer: null,
    hasRestored: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.customer),
    // Vrai si le compte chargé est le compte anonyme GDPR (pas un vrai client)
    isGuest: (state) => state.customer?.email === GDPR_ANONYMOUS_EMAIL,
    customerName: (state) => {
      if (!state.customer) return ''
      const first = state.customer.firstname || ''
      const last  = state.customer.lastname  || ''
      return `${first} ${last}`.trim()
    },
  },
  actions: {
    async login({ email, password }) {
      const session = await loginCustomer({ email, password })
      this.session = session
      this.customer = session.customer
      const cartStore = useFrontCartStore()
      await cartStore.switchCustomer(session.customer?.id || '')
      return session
    },

    async loginByEmail({ email }) {
      const session = await loginCustomerByEmail({ email })
      this.session = session
      this.customer = session.customer
      const cartStore = useFrontCartStore()
      await cartStore.switchCustomer(session.customer?.id || '')
      return session
    },

    async loginAsCustomer(customer) {
      const session = createCustomerSession(customer)
      this.session = session
      this.customer = session.customer
      this.hasRestored = true
      const cartStore = useFrontCartStore()
      await cartStore.switchCustomer(session.customer?.id || '')
      return session
    },

    restoreSession() {
      if (this.hasRestored) return this.session
      this.hasRestored = true

      const session = getStoredCustomerSession()
      if (!session) {
        this.session  = null
        this.customer = null
        return null
      }

      this.session = session
      this.customer = session.customer
      const cartStore = useFrontCartStore()
      cartStore.switchCustomer(session.customer?.id || '').catch(() => {})
      return session
    },

    logout() {
      clearCustomerSession()
      this.session  = null
      this.customer = null

      // Réinitialiser le panier de façon synchrone → totalItems = 0, items = []
      // se propagent immédiatement dans le header et toutes les vues réactives.
      // ownerId vide = état anonyme, pas de client guest à charger.
      const cartStore = useFrontCartStore()
      cartStore.$patch({
        cartId:      '',
        addressId:   '',
        items:       [],
        error:       '',
        syncing:     false,
        initialized: false,
        ownerId:     '',
      })
    },
  },
})

export { useCustomerAuthStore }
