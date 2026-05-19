import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'
import bcrypt from 'bcryptjs'

const SESSION_KEY = 'Ranto-customer-session'
const SESSION_TTL_MS = 6 * 60 * 60 * 1000
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

const logAuth = (...args) => {
  if (isDev) {
    console.info('[front-auth]', ...args)
  }
}

class CustomerAuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CustomerAuthError'
    this.code = code
  }
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
      throw new CustomerAuthError('MISSING_API_KEY', 'Missing API key in .env.local')
    }
    throw new CustomerAuthError('MISSING_ENV', message)
  }
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const normalizePassword = (value) => String(value || '').trim()

const parseCustomers = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const customersRoot = root.customers || json.customers || {}
  const nodes = asArray(customersRoot.customer)

  return nodes.map((customer) => {
    const id = readText(customer.id) || readAttr(customer, 'id')
    const email = readText(customer.email)
    const firstname = readText(customer.firstname)
    const lastname = readText(customer.lastname)
    const passwd = readText(customer.passwd) || readText(customer.password)
    const active = readText(customer.active)
    const secureKey = readText(customer.secure_key)
    const isGuest = readText(customer.is_guest)

    return {
      id,
      email,
      firstname,
      lastname,
      passwd,
      active,
      secureKey,
      isGuest,
    }
  })
}

const buildCustomerQuery = (email) => {
  const encoded = encodeURIComponent(`[${email}]`)
  return `display=full&filter[email]=${encoded}`
}

const fetchCustomersByEmail = async (email) => {
  const { apiUrl, apiKey } = getWebserviceConfig()
  const client = createXmlClient({ apiUrl, apiKey })
  const query = buildCustomerQuery(email)
  const response = await client.get(`/customers?${query}`)
  return parseCustomers(response.data)
}

const findCustomerByEmail = async (email) => {
  const cleanEmail = normalizeEmail(email)
  if (!cleanEmail) {
    throw new CustomerAuthError('MISSING_FIELDS', 'Email required')
  }

  let customers
  try {
    customers = await fetchCustomersByEmail(cleanEmail)
  } catch (error) {
    if (error instanceof CustomerAuthError) {
      throw error
    }
    throw new CustomerAuthError('NETWORK_ERROR', 'Customer login request failed')
  }

  const customer = customers.find(
    (item) => normalizeEmail(item.email) === cleanEmail
  )

  if (!customer) {
    throw new CustomerAuthError('CUSTOMER_NOT_FOUND', 'Customer not found')
  }

  if (String(customer.active) === '0') {
    throw new CustomerAuthError('CUSTOMER_INACTIVE', 'Customer inactive')
  }

  return customer
}

const buildCustomerSession = (customer) => {
  const now = Date.now()
  return {
    customer: {
      id: customer.id,
      email: customer.email,
      firstname: customer.firstname,
      lastname: customer.lastname,
      secureKey: customer.secureKey,
    },
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  }
}

const normalizeSessionCustomer = (customer) => ({
  id: String(customer?.id || '').trim(),
  email: String(customer?.email || '').trim(),
  firstname: customer?.firstname || '',
  lastname: customer?.lastname || '',
  secureKey: customer?.secureKey || customer?.secure_key || '',
})

const saveCustomerSession = (customer) => {
  const session = buildCustomerSession(customer)
  // secure_key stocké uniquement en mémoire — jamais dans localStorage
  // (évite l'exposition via XSS ou accès physique à la machine)
  const { secureKey: _sk, ...customerWithoutKey } = session.customer
  const persisted = { ...session, customer: customerWithoutKey }
  localStorage.setItem(SESSION_KEY, JSON.stringify(persisted))
  return session // retourne la version complète (en mémoire uniquement)
}

const createCustomerSession = (customer) => {
  const normalized = normalizeSessionCustomer(customer)
  if (!normalized.id || !normalized.email) {
    throw new CustomerAuthError('MISSING_CUSTOMER', 'Customer required')
  }
  return saveCustomerSession(normalized)
}

const getStoredCustomerSession = () => {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const session = JSON.parse(raw)
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch (error) {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

const clearCustomerSession = () => {
  localStorage.removeItem(SESSION_KEY)
}

const normalizeHash = (hash) => {
  if (!hash) {
    return ''
  }
  const text = String(hash).trim()
  if (text.startsWith('$2y$')) {
    return `$2a$${text.slice(4)}`
  }
  return text
}

const isPasswordValid = (storedPassword, inputPassword) => {
  if (!storedPassword || !inputPassword) {
    return false
  }

  const hash = normalizeHash(storedPassword)
  if (!hash) {
    return false
  }

  return bcrypt.compareSync(String(inputPassword), hash)
}

const loginCustomer = async ({ email, password }) => {
  const cleanEmail = normalizeEmail(email)
  const cleanPassword = normalizePassword(password)

  logAuth('login start', { email: cleanEmail })

  if (!cleanEmail || !cleanPassword) {
    logAuth('login failed: missing fields', { email: cleanEmail })
    throw new CustomerAuthError('MISSING_FIELDS', 'Email and password required')
  }

  let customer
  try {
    customer = await findCustomerByEmail(cleanEmail)
    logAuth('customers fetched', { count: 1 })
  } catch (error) {
    if (error instanceof CustomerAuthError) {
      logAuth('login failed: env error', { code: error.code })
      throw error
    }
    logAuth('login failed: network error')
    throw new CustomerAuthError('NETWORK_ERROR', 'Customer login request failed')
  }

  const storedHash = customer.passwd || ''
  if (!storedHash) {
    logAuth('login failed: passwd not returned by WS', { id: customer.id })
    throw new CustomerAuthError(
      'INVALID_CREDENTIALS',
      'Le WebService PrestaShop ne retourne pas le mot de passe. Vérifiez les permissions de la clé API.'
    )
  }

  const hashPrefix = storedHash.slice(0, 4)
  logAuth('password check', { id: customer.id, hashPrefix, hashLength: storedHash.length })

  if (!isPasswordValid(storedHash, cleanPassword)) {
    logAuth('login failed: invalid credentials', { id: customer.id, hashPrefix })
    throw new CustomerAuthError('INVALID_CREDENTIALS', 'Identifiants invalides')
  }

  logAuth('login success', { id: customer.id })
  return saveCustomerSession(customer)
}

const loginCustomerByEmail = async ({ email }) => {
  const cleanEmail = normalizeEmail(email)

  logAuth('email login start', { email: cleanEmail })

  const customer = await findCustomerByEmail(cleanEmail)

  if (String(customer.isGuest) === '1') {
    logAuth('email login blocked: guest account', { id: customer.id })
    throw new CustomerAuthError('GUEST_NOT_ALLOWED', 'Guest account not allowed')
  }

  logAuth('email login success', { id: customer.id })
  return saveCustomerSession(customer)
}

export {
  CustomerAuthError,
  loginCustomer,
  loginCustomerByEmail,
  createCustomerSession,
  getStoredCustomerSession,
  clearCustomerSession,
}
