import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const getClient = () => {
  const { apiBaseUrl, apiKey } = getWebserviceEnv()
  return createXmlClient({ apiUrl: normalizeApiUrl(apiBaseUrl), apiKey })
}

const parseCustomers = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const customersRoot = root.customers || json.customers || {}
  const nodes = asArray(customersRoot.customer)

  return nodes.map((customer) => ({
    id: readText(customer.id) || readAttr(customer, 'id'),
    firstname: readText(customer.firstname),
    lastname: readText(customer.lastname),
    email: readText(customer.email),
    secureKey: readText(customer.secure_key),
    active: Number(readText(customer.active) || 0),
    isGuest: Number(readText(customer.is_guest) || 0),
  }))
}

const buildCustomersQuery = ({ page, pageSize }) => {
  const offset = Math.max(0, (page - 1) * pageSize)
  const limit = `${offset},${pageSize}`

  return [
    'display=[id,firstname,lastname,email,secure_key,active,is_guest]',
    `sort=${encodeURIComponent('[id_DESC]')}`,
    `limit=${encodeURIComponent(limit)}`,
  ].join('&')
}

const getFrontCustomers = async ({ page = 1, pageSize = 200 } = {}) => {
  const client = getClient()
  const query = buildCustomersQuery({ page, pageSize })
  const response = await client.get(`/customers?${query}`)

  return {
    items: parseCustomers(response.data),
    page,
    pageSize,
  }
}

// Récupère un client PS par ID (utilisé notamment pour le compte guest).
// GET /customers/{id} retourne <prestashop><customer>…</customer></prestashop>
const getCustomerById = async (customerId) => {
  const client = getClient()
  const response = await client.get(
    `/customers/${customerId}?display=[id,firstname,lastname,email,secure_key,active,is_guest]`
  )
  const json = xmlToJson(response.data)
  const root = json.prestashop || {}
  const node = root.customer || json.customer
  if (!node) return null
  return {
    id:        readText(node.id)         || readAttr(node, 'id'),
    firstname: readText(node.firstname)  || '',
    lastname:  readText(node.lastname)   || '',
    email:     readText(node.email)      || '',
    secureKey: readText(node.secure_key) || '',
    active:    Number(readText(node.active)   || 0),
    isGuest:   Number(readText(node.is_guest) || 0),
  }
}

export { getFrontCustomers, getCustomerById }
