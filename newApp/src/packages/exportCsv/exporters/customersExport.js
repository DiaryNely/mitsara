import { getXmlClient } from '../../api/xmlClient'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'
import { buildCsv } from '../utils/csvWriter'
import { buildCsvFilename } from '../utils/naming'
import { fetchAllByOffset } from '../utils/pagination'
import { toBoolFlag, toText } from '../utils/normalize'

const CUSTOMER_COLUMNS = [
  { key: 'customer_id', label: 'customer_id' },
  { key: 'firstname', label: 'firstname' },
  { key: 'lastname', label: 'lastname' },
  { key: 'email', label: 'email' },
  { key: 'active', label: 'active' },
  { key: 'is_guest', label: 'is_guest' },
  { key: 'secure_key', label: 'secure_key' },
  { key: 'date_add', label: 'date_add' },
]

const parseCustomersPage = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const customersRoot = root.customers || json.customers || {}
  const nodes = asArray(customersRoot.customer)

  return nodes.map((node) => ({
    id: readText(node?.id) || readAttr(node, 'id'),
    firstname: readText(node?.firstname) || '',
    lastname: readText(node?.lastname) || '',
    email: readText(node?.email) || '',
    active: readText(node?.active) || '0',
    isGuest: readText(node?.is_guest) || '0',
    secureKey: readText(node?.secure_key) || '',
    dateAdd: readText(node?.date_add) || '',
  }))
}

const fetchCustomersPage = async ({ limit, offset }) => {
  const client = getXmlClient()
  const query = new URLSearchParams()
  query.set('display', '[id,firstname,lastname,email,active,is_guest,secure_key,date_add]')
  query.set('limit', `${offset},${limit}`)

  const response = await client.get(`/customers?${query.toString()}`)
  return parseCustomersPage(response.data)
}

export async function exportCustomersCsv(options = {}) {
  const pageSize = options.pageSize || 200
  const customers = await fetchAllByOffset(fetchCustomersPage, {
    pageSize,
    maxItems: options.maxItems,
  })

  const rows = customers.map((customer) => ({
    customer_id: toText(customer.id),
    firstname: toText(customer.firstname),
    lastname: toText(customer.lastname),
    email: toText(customer.email),
    active: toBoolFlag(String(customer.active) === '1'),
    is_guest: toBoolFlag(String(customer.isGuest) === '1'),
    secure_key: toText(customer.secureKey),
    date_add: toText(customer.dateAdd),
  }))

  const csvText = buildCsv({
    rows,
    columns: CUSTOMER_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename('customers'),
    csvText,
    rowCount: rows.length,
    columns: CUSTOMER_COLUMNS,
  }
}
