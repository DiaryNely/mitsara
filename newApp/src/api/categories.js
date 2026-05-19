// api/categories.js
import { getXmlClient } from './xmlClient'
import { xmlToJson, asArray, readText, buildXML } from '../utils/xml'
import { normalizeCategoryName } from '../services/mapper'

/**
 * Récupère toutes les catégories
 */
export async function getCategories() {
  const client = getXmlClient()
  const response = await client.get('/categories?display=[id,name,link_rewrite]')
  const json = xmlToJson(response.data)
  
  let categories = json.prestashop?.categories?.category || []
  categories = asArray(categories)
  
  return categories.map(cat => ({
    id: readText(cat.id),
    name: readText(cat.name?.language),
    link_rewrite: readText(cat.link_rewrite?.language)
  }))
}

/**
 * Récupère une catégorie par son nom
 */
export async function getCategoryByName(name) {
  const categories = await getCategories()
  return categories.find(c => c.name.toLowerCase() === name.toLowerCase())
}

/**
 * Crée une nouvelle catégorie
 */
export async function createCategory(name, parentId = 2) {
  const client = getXmlClient()
  const linkRewrite = normalizeCategoryName(name)
  
  const xml = buildXML({
    prestashop: {
      category: {
        id_parent: parentId,
        active: 1,
        name: {
          language: {
            '@_id': '1',
            '#text': name
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
  
  const response = await client.post('/categories', xml)
  const json = xmlToJson(response.data)
  return readText(json.prestashop.category.id)
}

/**
 * Récupère ou crée une catégorie. Retourne {id, created}.
 */
export async function getOrCreateCategory(name) {
  const existing = await getCategoryByName(name)
  if (existing) {
    return { id: existing.id, created: false }
  }
  const id = await createCategory(name)
  return { id, created: true }
}