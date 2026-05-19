// api/customers.js
import { getXmlClient } from './xmlClient'
import { xmlToJson, readText, buildXML } from '../utils/xml'

/**
 * Recherche un client par email
 */
export async function findCustomerByEmail(email) {
  const client = getXmlClient()

  try {
    const response = await client.get(`/customers?filter[email]=${encodeURIComponent(email)}&display=[id,email]`)
    const json = xmlToJson(response.data)

    let customers = json.prestashop?.customers?.customer || []
    if (!Array.isArray(customers)) customers = [customers]

    if (customers.length > 0 && customers[0]?.id) {
      const id = readText(customers[0].id)
      console.log(`✅ Client trouvé: ${email} (ID: ${id})`)
      return id
    }
    return null
  } catch (error) {
    console.log(`Client non trouvé: ${email}`)
    return null
  }
}

/**
 * Recherche en masse plusieurs clients par email (en parallèle, dédupliqué).
 * Retourne une Map<email, id> ne contenant que les emails existants côté PS.
 * Utilisé pour pré-hydrater le cache d'import et éviter un GET par commande.
 */
export async function findCustomersByEmails(emails) {
  const unique = Array.from(
    new Set(
      (emails || [])
        .map((email) => String(email || '').trim().toLowerCase())
        .filter(Boolean)
    )
  )
  if (!unique.length) return new Map()

  const results = await Promise.all(unique.map((email) => findCustomerByEmail(email)))

  const found = new Map()
  unique.forEach((email, idx) => {
    if (results[idx]) found.set(email, results[idx])
  })
  return found
}

/**
 * Crée un client PrestaShop
 */
export async function createCustomer(customerData) {
  const client = getXmlClient()

  const formatDateTime = (date) => {
    const pad2 = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  }

  const now = new Date()

  // Vérifier si le client existe déjà
  const existingId = await findCustomerByEmail(customerData.email)
  if (existingId) {
    console.info(`Existing customer reused: ${customerData.email} (ID: ${existingId})`)
    return { id: existingId, created: false }
  }

  const xml = buildXML({
    prestashop: {
      customer: {
        id_customer: customerData.id_customer,
        firstname: customerData.firstname || customerData.lastname || 'Client',
        lastname: customerData.lastname || 'Client',
        email: customerData.email,
        passwd: customerData.passwd,
        id_default_group: customerData.id_default_group ?? 3,
        id_shop_group: customerData.id_shop_group ?? 1,
        id_shop: customerData.id_shop ?? 1,
        id_gender: customerData.id_gender ?? 0,
        id_lang: customerData.id_lang ?? 1,
        id_risk: customerData.id_risk ?? 0,
        company: customerData.company ?? '',
        siret: customerData.siret ?? '',
        ape: customerData.ape ?? '',
        birthday: customerData.birthday ?? '0000-00-00',
        newsletter: customerData.newsletter ?? 0,
        ip_registration_newsletter: customerData.ip_registration_newsletter ?? '',
        newsletter_date_add: customerData.newsletter_date_add ?? '0000-00-00 00:00:00',
        optin: customerData.optin ?? 0,
        website: customerData.website ?? '',
        outstanding_allow_amount: customerData.outstanding_allow_amount ?? '0.000000',
        show_public_prices: customerData.show_public_prices ?? 0,
        max_payment_days: customerData.max_payment_days ?? 0,
        secure_key: customerData.secure_key,
        note: customerData.note ?? '',
        active: 1,
        is_guest: customerData.is_guest ?? 0,
        deleted: customerData.deleted ?? 0,
        last_passwd_gen: customerData.last_passwd_gen ?? formatDateTime(now),
        date_add: customerData.date_add ?? formatDateTime(now),
        date_upd: customerData.date_upd ?? formatDateTime(now),
        reset_password_token: customerData.reset_password_token ?? '',
        reset_password_validity: customerData.reset_password_validity ?? '0000-00-00 00:00:00',
      }
    }
  })

  try {
    const response = await client.post('/customers', xml)
    const json = xmlToJson(response.data)
    const id = readText(json.prestashop?.customer?.id)
    return { id, created: true }
  } catch (error) {
    throw error
  }
}