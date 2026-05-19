import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { parseXml, parseEmployeeXml } from '../../api/xmlParser'

const SESSION_KEY = 'ps-session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

const extractPermissions = (xmlText) => {
  const doc = parseXml(xmlText)
  const apiNode = doc.querySelector('prestashop > api') || doc.querySelector('api')
  if (!apiNode) {
    return []
  }

  return Array.from(apiNode.children).map((child) => child.tagName)
}

const buildSession = ({ apiUrl, apiKey, employee, permissions }) => {
  const now = Date.now()

  return {
    apiUrl: normalizeApiUrl(apiUrl),
    apiKey,
    employee,
    permissions,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  }
}

const validateApiKey = async ({ apiUrl, apiKey }) => {
  const client = createXmlClient({ apiUrl, apiKey })

  const [rootResponse, employeesResponse] = await Promise.all([
    client.get('/'),
    client.get('/employees?display=full&limit=1'),
  ])

  const permissions = extractPermissions(rootResponse.data)
  const employee = parseEmployeeXml(employeesResponse.data)

  return {
    apiUrl: normalizeApiUrl(apiUrl),
    apiKey,
    employee,
    permissions,
  }
}

const saveSession = ({ apiUrl, apiKey, employee, permissions }) => {
  const session = buildSession({ apiUrl, apiKey, employee, permissions })
  const encoded = btoa(JSON.stringify(session))
  sessionStorage.setItem(SESSION_KEY, encoded)
  return session
}

const getStoredSession = () => {
  const encoded = sessionStorage.getItem(SESSION_KEY)
  if (!encoded) {
    return null
  }

  try {
    const decoded = atob(encoded)
    const session = JSON.parse(decoded)
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch (error) {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

const verifyStoredSession = async () => {
  const session = getStoredSession()
  if (!session) {
    return null
  }

  try {
    const client = createXmlClient({
      apiUrl: session.apiUrl,
      apiKey: session.apiKey,
    })

    const [rootResponse, employeesResponse] = await Promise.all([
      client.get('/'),
      client.get('/employees?display=full&limit=1'),
    ])

    const permissions = extractPermissions(rootResponse.data)
    const employee = parseEmployeeXml(employeesResponse.data)

    return saveSession({
      apiUrl: session.apiUrl,
      apiKey: session.apiKey,
      employee,
      permissions,
    })
  } catch (error) {
    clearSession()
    return null
  }
}

const clearSession = () => {
  sessionStorage.removeItem(SESSION_KEY)
}

export {
  validateApiKey,
  saveSession,
  getStoredSession,
  verifyStoredSession,
  clearSession,
}
