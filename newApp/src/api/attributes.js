// api/attributes.js (product_options)
import { getXmlClient } from './xmlClient'
import { xmlToJson, asArray, readText, buildXML } from '../utils/xml'

/**
 * Récupère tous les groupes d'attributs
 */
export async function getAttributeGroups() {
  const client = getXmlClient()
  const response = await client.get('/product_options?display=[id,name]')
  const json = xmlToJson(response.data)
  
  let groups = json.prestashop?.product_options?.product_option || []
  groups = asArray(groups)
  
  return groups.map(group => ({
    id: readText(group.id),
    name: readText(group.name?.language)
  }))
}

/**
 * Récupère un groupe d'attributs par son nom
 */
export async function getAttributeGroupByName(name) {
  const groups = await getAttributeGroups()
  return groups.find(g => g.name === name)
}

/**
 * Crée un groupe d'attributs (ex: Taille, Couleur)
 */
export async function createAttributeGroup(name) {
  const client = getXmlClient()
  
  const xml = buildXML({
    prestashop: {
      product_option: {
        name: {
          language: {
            '@_id': '1',
            '#text': name
          }
        },
        public_name: {
          language: {
            '@_id': '1',
            '#text': name
          }
        },
        group_type: 'select',
        position: 0
      }
    }
  })
  
  const response = await client.post('/product_options', xml)
  const json = xmlToJson(response.data)
  return readText(json.prestashop.product_option.id)
}

/**
 * Récupère les valeurs d'un groupe d'attributs
 */
export async function getAttributeValues(groupId) {
  const client = getXmlClient()
  const response = await client.get(`/product_option_values?filter[id_attribute_group]=${groupId}&display=[id,name]`)
  const json = xmlToJson(response.data)
  
  let values = json.prestashop?.product_option_values?.product_option_value || []
  values = asArray(values)
  
  return values.map(val => ({
    id: readText(val.id),
    name: readText(val.name?.language)
  }))
}

/**
 * Récupère ou crée un groupe d'attributs. Retourne {id, created}.
 */
export async function getOrCreateAttributeGroup(name) {
  const existing = await getAttributeGroupByName(name)
  if (existing) {
    return { id: existing.id, created: false }
  }
  const id = await createAttributeGroup(name)
  return { id, created: true }
}

/**
 * Crée une valeur d'attribut (ex: ngoza, kely, mainty, fotsy)
 */
export async function createAttributeValue(groupId, valueName) {
  const client = getXmlClient()
  const normalizedValue = valueName === undefined || valueName === null ? '' : String(valueName).trim()
  if (!normalizedValue) {
    throw new Error('Valeur d\'attribut manquante')
  }
  const linkRewrite = normalizedValue.toLowerCase()
  
  const xml = buildXML({
    prestashop: {
      product_option_value: {
        id_attribute_group: groupId,
        color: '',
        position: 0,
        name: {
          language: {
            '@_id': '1',
            '#text': normalizedValue
          }
        },
        link_rewrite: {
          language: {
            '@_id': '1',
            '#text': linkRewrite
          }
        }
      }
    }
  })
  
  console.log('📤 XML création valeur attribut:', xml)
  
  try {
    const response = await client.post('/product_option_values', xml)
    const json = xmlToJson(response.data)
    return readText(json.prestashop.product_option_value.id)
  } catch (error) {
    console.error('❌ Erreur création valeur attribut:', error.response?.data)
    throw error
  }
}

/**
 * Récupère ou crée une valeur d'attribut. Retourne {id, created}.
 */
export async function getOrCreateAttributeValue(groupId, valueName) {
  const normalizedValue = valueName === undefined || valueName === null ? '' : String(valueName).trim()
  if (!normalizedValue) {
    throw new Error('Valeur d\'attribut manquante')
  }

  const values = await getAttributeValues(groupId)
  const existing = values.find(v => v.name === normalizedValue)
  if (existing) {
    return { id: existing.id, created: false }
  }
  const id = await createAttributeValue(groupId, normalizedValue)
  return { id, created: true }
}