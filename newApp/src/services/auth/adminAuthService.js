import axios from 'axios'
import { getAdminEnv } from '../../config/runtimeEnv'

const ADMIN_SESSION_KEY = 'ps-admin-session'
class AuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

const getAdminBasePath = () => {
  try {
    const { adminBasePath } = getAdminEnv()
    return adminBasePath.replace(/\/+$/, '')
  } catch (error) {
    throw new AuthError(
      'MISSING_ADMIN_ENV',
      error?.message || 'Missing admin env'
    )
  }
}

const buildAdminLoginUrl = () =>
  `${getAdminBasePath()}/index.php?controller=AdminLogin&ajax=1&action=login`

const buildAdminLogoutUrl = (token) =>
  `${getAdminBasePath()}/index.php?controller=AdminLogin&logout=1&token=${encodeURIComponent(
    token
  )}`

const createAdminClient = () =>
  axios.create({
    withCredentials: true,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

const extractAdminToken = (redirectUrl) => {
  const match = /[?&]token=([a-zA-Z0-9]+)/.exec(redirectUrl || '')
  return match ? match[1] : ''
}

const saveAdminSession = ({ email, adminToken }) => {
  const session = {
    email,
    adminToken,
    createdAt: Date.now(),
  }
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
  return session
}

const getStoredAdminSession = () => {
  const raw = localStorage.getItem(ADMIN_SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const session = JSON.parse(raw)
    if (!session || !session.email || !session.adminToken) {
      throw new Error('Invalid admin session')
    }
    return session
  } catch (error) {
    localStorage.removeItem(ADMIN_SESSION_KEY)
    return null
  }
}

const clearAdminSession = () => {
  localStorage.removeItem(ADMIN_SESSION_KEY)
}

const loginAdmin = async ({ email, password }) => {
  const client = createAdminClient()
  const payload = new URLSearchParams({
    email,
    passwd: password,
    submitLogin: '1',
    ajax: '1',
    stay_logged_in: '1',
    redirect: 'AdminDashboard',
  })

  let response
  try {
    response = await client.post(buildAdminLoginUrl(), payload)
  } catch (error) {
    if (error?.code === 'MISSING_ADMIN_ENV') {
      throw error
    }
    throw new AuthError('NETWORK_ERROR', 'Admin login request failed')
  }

  const data = response?.data || {}
  if (data.hasErrors || (Array.isArray(data.errors) && data.errors.length)) {
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials')
  }

  const token = extractAdminToken(data.redirect)
  if (!token) {
    throw new AuthError('TOKEN_MISSING', 'Admin token missing')
  }

  return saveAdminSession({ email, adminToken: token })
}

const logoutAdmin = async (adminToken) => {
  if (!adminToken) {
    clearAdminSession()
    return
  }

  const client = createAdminClient()

  try {
    await client.get(buildAdminLogoutUrl(adminToken))
  } catch (error) {
    // Ignore logout errors but always clear local session.
  } finally {
    clearAdminSession()
  }
}

export {
  AuthError,
  loginAdmin,
  logoutAdmin,
  getStoredAdminSession,
  clearAdminSession,
  getAdminBasePath,
}
