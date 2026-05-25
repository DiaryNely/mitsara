// api/addresses.js
import { getXmlClient } from './xmlClient'
import { xmlToJson, buildXML, readText } from '../utils/xml'

function parseCityFromAddress(address1) {
  if (!address1 || typeof address1 !== 'string') {
    return ''
  }

  const parts = address1.split(',')
  if (parts.length < 2) {
    return ''
  }

  return parts[1].trim()
}

/**
 * Crée une adresse
 */
export async function createAddress(addressData) {
  const client = getXmlClient()
  
  // La France a l'ID 8 par défaut dans PrestaShop
  const idCountry = addressData.id_country || 8
  const cityFromAddress = parseCityFromAddress(addressData.address1)
  const city = addressData.city || cityFromAddress || 'Antananarivo'
  
  const xml = buildXML({
    prestashop: {
      address: {
        id_customer: addressData.id_customer,
        id_country: idCountry,
        alias: addressData.alias || 'Mon adresse',
        lastname: addressData.lastname,
        firstname: addressData.firstname || addressData.lastname,
        address1: addressData.address1,
        postcode: addressData.postcode || '00000',
        city: city,
        phone: addressData.phone || ''
      }
    }
  })
  
  const response = await client.post('/addresses', xml)
  const json = xmlToJson(response.data)
  return readText(json.prestashop.address.id)
}