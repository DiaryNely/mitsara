import { defineStore } from 'pinia'
import {
  validateApiKey,
  saveSession,
  verifyStoredSession,
  clearSession,
} from '../../services/auth/authService'
import { initXmlClient, destroyXmlClient } from '../../api/xmlClient'
import {
  loginAdmin,
  logoutAdmin,
  getStoredAdminSession,
  clearAdminSession,
  AuthError,
} from '../../services/auth/adminAuthService'
import { normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'

const redirectToLogin = (redirectPath) => {
  if (typeof window === 'undefined') {
    return
  }

  if (redirectPath) {
    const encoded = encodeURIComponent(redirectPath)
    window.location.assign(`/login?redirect=${encoded}`)
    return
  }

  window.location.assign('/login')
}

const getCurrentPath = () => {
  if (typeof window === 'undefined') {
    return ''
  }
  return `${window.location.pathname}${window.location.search}${
    window.location.hash
  }`
}

const getWebserviceConfig = () => {
  try {
    const { apiBaseUrl, apiKey } = getWebserviceEnv()
    return {
      apiUrl: normalizeApiUrl(apiBaseUrl),
      apiKey,
    }
  } catch (error) {
    const message = error?.message || 'Missing env'
    if (message.includes('VITE_PRESTASHOP_API_KEY')) {
      throw new AuthError('MISSING_API_KEY', 'Missing API key in .env.local')
    }
    throw new AuthError('MISSING_ENV', message)
  }
}

const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null,
    employee: null,
    permissions: [],
    adminSession: null,
    hasRestored: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.adminSession),
    employeeFullName: (state) => {
      if (!state.employee) {
        return ''
      }
      const first = state.employee.firstname || ''
      const last = state.employee.lastname || ''
      return `${first} ${last}`.trim()
    },
    hasPermission: (state) => (permission) => {
      if (!permission) {
        return true
      }
      const list = Array.isArray(permission) ? permission : [permission]
      return list.every((item) => state.permissions.includes(item))
    },
  },
  actions: {
    // Login -> admin login -> validateApiKey -> saveSession -> initXmlClient
    async login({ email, password }) {
      const adminSession = await loginAdmin({ email, password })

      try {
        const { apiUrl, apiKey } = getWebserviceConfig()
        const result = await validateApiKey({ apiUrl, apiKey })
        const session = saveSession(result)

        this.adminSession = adminSession
        this.session = session
        this.employee = session.employee
        this.permissions = session.permissions

        initXmlClient({
          apiUrl: session.apiUrl,
          apiKey: session.apiKey,
          onAuthError: () => {
            this.clearAuthState()
            redirectToLogin(getCurrentPath())
          },
        })

        return session
      } catch (error) {
        await logoutAdmin(adminSession.adminToken)
        this.clearAuthState()
        throw error
      }
    },
    // Refresh -> restoreSession -> verifyStoredSession -> restore state
    async restoreSession() {
      if (this.hasRestored) {
        return this.session
      }
      this.hasRestored = true

      const adminSession = getStoredAdminSession()
      if (!adminSession) {
        this.clearAuthState()
        return null
      }

      this.adminSession = adminSession

      let session = await verifyStoredSession()
      if (!session) {
        try {
          const { apiUrl, apiKey } = getWebserviceConfig()
          const result = await validateApiKey({ apiUrl, apiKey })
          session = saveSession(result)
        } catch (error) {
          this.clearAuthState()
          return null
        }
      }

      this.session = session
      this.employee = session.employee
      this.permissions = session.permissions

      initXmlClient({
        apiUrl: session.apiUrl,
        apiKey: session.apiKey,
        onAuthError: () => {
          this.clearAuthState()
          redirectToLogin(getCurrentPath())
        },
      })

      return session
    },
    // Logout -> clearSession -> destroyXmlClient -> redirect /login
    async logout() {
      await logoutAdmin(this.adminSession?.adminToken)
      this.clearAuthState()
      redirectToLogin()
    },
    // 401 received -> interceptor -> clearSession -> redirect /login
    clearAuthState() {
      clearAdminSession()
      clearSession()
      destroyXmlClient()
      this.session = null
      this.employee = null
      this.permissions = []
      this.adminSession = null
    },
  },
})

export { useAuthStore }
