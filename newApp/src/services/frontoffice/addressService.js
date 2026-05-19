import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'
import { getShopContext } from './contextService'

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const getClient = () => {
  const { apiBaseUrl, apiKey } = getWebserviceEnv()
  return createXmlClient({ apiUrl: normalizeApiUrl(apiBaseUrl), apiKey })
}

const parseAddresses = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const addressesRoot = root.addresses || json.addresses || {}
  const nodes = asArray(addressesRoot.address)

  return nodes.map((address) => ({
    id: readText(address.id) || readAttr(address, 'id'),
    alias: readText(address.alias),
    firstname: readText(address.firstname),
    lastname: readText(address.lastname),
    address1: readText(address.address1),
    address2: readText(address.address2),
    postcode: readText(address.postcode),
    city: readText(address.city),
    countryId: readText(address.id_country),
    phone: readText(address.phone),
    phoneMobile: readText(address.phone_mobile),
  }))
}

const getCustomerAddresses = async (customerId) => {
  const client = getClient()
  const query = `display=full&filter[id_customer]=[${encodeURIComponent(customerId)}]`
  const response = await client.get(`/addresses?${query}`)
  return parseAddresses(response.data)
}

const buildAddressXml = (payload) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>${escapeXml(payload.customerId)}</id_customer>
    <id_country>${escapeXml(payload.countryId)}</id_country>
    <alias>${escapeXml(payload.alias)}</alias>
    <firstname>${escapeXml(payload.firstname)}</firstname>
    <lastname>${escapeXml(payload.lastname)}</lastname>
    <address1>${escapeXml(payload.address1)}</address1>
    <address2>${escapeXml(payload.address2 || '')}</address2>
    <postcode>${escapeXml(payload.postcode)}</postcode>
    <city>${escapeXml(payload.city)}</city>
    <phone>${escapeXml(payload.phone || '')}</phone>
    <phone_mobile>${escapeXml(payload.phoneMobile || '')}</phone_mobile>
  </address>
</prestashop>`
}

const createAddress = async (payload) => {
  const context = await getShopContext()
  const client = getClient()
  const xml = buildAddressXml({
    ...payload,
    countryId: payload.countryId || context.countryId,
  })
  const response = await client.post('/addresses', xml)
  const addresses = parseAddresses(response.data)
  return addresses[0] || null
}

export { getCustomerAddresses, createAddress }
