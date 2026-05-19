import { API_BASE_URL, API_KEY } from '../../api/api'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const RESET_API_BASE_URL = API_BASE_URL
const DEFAULT_PAGE_SIZE = 200

const buildAuthHeader = () => {
  if (!API_KEY) {
    return {}
  }

  return { Authorization: `Basic ${btoa(`${API_KEY}:`)}` }
}

const normalizeBase = (base) => base.replace(/\/$/, '')

const requestXml = async (path, options = {}) => {
  const { method = 'GET', signal } = options
  const base = normalizeBase(RESET_API_BASE_URL)
  const cleanPath = path ? path.replace(/^\//, '') : ''
  const url = cleanPath ? `${base}/${cleanPath}` : `${base}/`

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/xml',
      ...buildAuthHeader(),
    },
    signal,
  })

  if (!response.ok) {
    const body = await response.text()
    const detail = body || response.statusText
    const err = new Error(`HTTP ${response.status}: ${detail}`)
    err.httpStatus = response.status
    throw err
  }

  return response.text()
}

const getApiRootXml = async () => requestXml('')

const parseApiRoot = (xmlText) => {
  const json = xmlToJson(xmlText)
  const api = (json.prestashop && json.prestashop.api) || json.api || {}
  const resources = []

  Object.entries(api).forEach(([key, value]) => {
    if (key.startsWith('@')) {
      return
    }
    if (key === 'description' || key === 'schema') {
      return
    }

    const attrs = value && typeof value === 'object' ? value['@attributes'] || {} : {}
    const schemas = asArray(value && value.schema)

    resources.push({
      name: key,
      href: attrs['xlink:href'] || attrs.href || '',
      methods: {
        get: attrs.get === 'true',
        post: attrs.post === 'true',
        put: attrs.put === 'true',
        delete: attrs.delete === 'true',
        patch: attrs.patch === 'true',
        head: attrs.head === 'true',
      },
      hasSchema: schemas.length > 0,
      description: readText(value && value.description),
    })
  })

  return resources
}

const getApiResources = async () => {
  const xmlText = await getApiRootXml()
  return {
    resources: parseApiRoot(xmlText),
    rawXml: xmlText,
  }
}

const getResourceSchemaSynopsis = async (resource) => requestXml(`${resource}?schema=synopsis`)

const parseResourceIds = (resource, xmlText) => {
  const json = xmlToJson(xmlText)
  const prestashop = json.prestashop || {}
  const listRoot = prestashop[resource] || json[resource] || {}

  if (!listRoot || typeof listRoot !== 'object') {
    return []
  }

  const itemKey = Object.keys(listRoot).find(
    (key) => !key.startsWith('@') && key !== 'description' && key !== 'schema'
  )

  if (!itemKey) {
    return []
  }

  const items = asArray(listRoot[itemKey])

  return items
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim()
      }

      return readAttr(item, 'id') || readText(item.id)
    })
    .filter(Boolean)
}

const listResourceIds = async (resource, options = {}) => {
  const { pageSize = DEFAULT_PAGE_SIZE, max = Infinity, signal } = options
  let offset = 0
  const allIds = []

  while (allIds.length < max) {
    const query = `display=[id]&limit=${offset},${pageSize}`
    const xmlText = await requestXml(`${resource}?${query}`, { signal })
    const ids = parseResourceIds(resource, xmlText)

    allIds.push(...ids)

    if (ids.length < pageSize) {
      break
    }

    offset += pageSize
  }

  return allIds.slice(0, max)
}

const deleteResourceItem = async (resource, id, options = {}) => {
  await requestXml(`${resource}/${id}`, { method: 'DELETE', signal: options.signal })
}

// PrestaShop 8.x : les images produit ont un endpoint hiérarchique
// GET  /api/images/products/{id_product}          → liste les images du produit
// DELETE /api/images/products/{id_product}/{id_image} → supprime une image
// Les IDs sont stockés sous forme de chaîne composite "productId:imageId"

const parseProductImageIds = (productId, xmlText) => {
  const re = new RegExp(`/images/products/${productId}/(\\d+)`, 'g')
  const ids = new Set()
  let m
  while ((m = re.exec(xmlText)) !== null) {
    ids.add(m[1])
  }
  return Array.from(ids).map((imageId) => `${productId}:${imageId}`)
}

const listProductImages = async (productId, options = {}) => {
  const { signal } = options
  try {
    const xmlText = await requestXml(`images/products/${productId}`, { signal })
    return parseProductImageIds(productId, xmlText)
  } catch {
    return []
  }
}

const deleteProductImage = async (_resource, compositeId, options = {}) => {
  const sep = compositeId.indexOf(':')
  if (sep === -1) {
    throw new Error(`ID image invalide : ${compositeId}`)
  }
  const productId = compositeId.slice(0, sep)
  const imageId = compositeId.slice(sep + 1)
  await requestXml(`images/products/${productId}/${imageId}`, {
    method: 'DELETE',
    signal: options.signal,
  })
}

// Retourne uniquement les IDs de catégories dont level_depth > 1 (i.e. pas Root ni Home)
// Protège ainsi tous les nœuds racines quelle que soit leur ID effective dans l'installation.
const parseCategoryItemsWithDepth = (xmlText) => {
  const json = xmlToJson(xmlText)
  const prestashop = json.prestashop || {}
  const listRoot = prestashop['categories'] || json['categories'] || {}

  if (!listRoot || typeof listRoot !== 'object') {
    return []
  }

  const itemKey = Object.keys(listRoot).find(
    (key) => !key.startsWith('@') && key !== 'description' && key !== 'schema',
  )
  if (!itemKey) {
    return []
  }

  const items = asArray(listRoot[itemKey])
  return items
    .map((item) => {
      if (typeof item === 'string') {
        return null
      }
      const id = String(readAttr(item, 'id') || readText(item.id) || '')
      const rawDepth = readText(item.level_depth)
      const levelDepth = rawDepth !== null && rawDepth !== '' ? parseInt(rawDepth, 10) : 99
      return id ? { id, level_depth: isNaN(levelDepth) ? 99 : levelDepth } : null
    })
    .filter(Boolean)
}

const listCategoryIdsForDeletion = async (options = {}) => {
  const { pageSize = DEFAULT_PAGE_SIZE, signal } = options
  let offset = 0
  const deletableIds = []

  while (true) {
    const query = `display=[id,level_depth]&limit=${offset},${pageSize}`
    const xmlText = await requestXml(`categories?${query}`, { signal })
    const items = parseCategoryItemsWithDepth(xmlText)

    items.forEach(({ id, level_depth }) => {
      // Ne supprime jamais Root (depth 0) ni les nœuds de premier niveau (Home/shop roots, depth 1)
      if (level_depth > 1) {
        deletableIds.push(id)
      }
    })

    if (items.length < pageSize) {
      break
    }
    offset += pageSize
  }

  return deletableIds
}

export {
  RESET_API_BASE_URL,
  DEFAULT_PAGE_SIZE,
  requestXml,
  getApiResources,
  getResourceSchemaSynopsis,
  parseApiRoot,
  parseResourceIds,
  listResourceIds,
  deleteResourceItem,
  listProductImages,
  deleteProductImage,
  listCategoryIdsForDeletion,
}
