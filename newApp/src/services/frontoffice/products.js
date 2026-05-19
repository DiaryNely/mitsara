import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const getWebserviceConfig = () => {
  const { apiBaseUrl, apiKey } = getWebserviceEnv()
  return {
    apiUrl: normalizeApiUrl(apiBaseUrl),
    apiKey,
  }
}

const createClient = () => {
  const { apiUrl, apiKey } = getWebserviceConfig()
  return createXmlClient({ apiUrl, apiKey })
}

const readLocalized = (value) => {
  if (!value) {
    return ''
  }
  const languages = asArray(value.language)
  const preferred = languages.find((lang) => readText(lang)) || languages[0]
  return readText(preferred)
}

const readImageIds = (product) => {
  const associations = product?.associations || {}
  const imagesRoot = associations.images || {}
  const imageNodes = asArray(imagesRoot.image)

  return imageNodes
    .map((image) => readText(image.id) || readAttr(image, 'id'))
    .filter(Boolean)
}

const readCombinationIds = (product) => {
  const associations = product?.associations || {}
  const combinationsRoot = associations.combinations || {}
  const nodes = asArray(combinationsRoot.combination)

  return nodes
    .map((combo) => readText(combo.id) || readAttr(combo, 'id'))
    .filter(Boolean)
}

let hasLoggedDateFields = false

const logDateFields = (productNode) => {
  if (!import.meta.env.DEV || hasLoggedDateFields) {
    return
  }

  hasLoggedDateFields = true

  if (!productNode || typeof productNode !== 'object') {
    console.info('Product date fields: no product node available to inspect.')
    return
  }

  const keys = Object.keys(productNode).filter((key) => {
    return key.includes('date') || key.includes('availability')
  })

  if (!keys.length) {
    console.info('Product date fields: none found on product node.')
    return
  }

  const sample = {}
  keys.forEach((key) => {
    sample[key] = readText(productNode[key])
  })

  console.info('Product date fields from API:', keys)
  console.table([sample])
}

const parseProductNode = (product) => {
  const id = readText(product.id) || readAttr(product, 'id')
  const name = readLocalized(product.name)
  const description = readLocalized(product.description)
  const descriptionShort = readLocalized(product.description_short)
  const price = readText(product.price) || '0'
  const reference = readText(product.reference)
  const dateAvailability = readText(product.available_date) || readText(product.date_availability_produit)
  const taxRulesGroupId = readText(product.id_tax_rules_group)
  const categoryId = readText(product.id_category_default)
  const defaultImage = readText(product.id_default_image)
  const imageIds = readImageIds(product)
  const combinationIds = readCombinationIds(product)

  return {
    id,
    name,
    description,
    descriptionShort,
    price,
    reference,
    dateAvailability,
    taxRulesGroupId,
    categoryId,
    imageId: defaultImage || imageIds[0] || '',
    imageIds,
    combinationIds,
  }
}

const parseProducts = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const productsRoot = root.products || json.products || {}
  const productNodes = asArray(productsRoot.product)

  logDateFields(productNodes[0])

  return productNodes.map((product) => parseProductNode(product))
}

const encodeLike = (value) => `%25%5B${encodeURIComponent(value)}%5D%25`

const buildFilters = (filters = {}) => {
  const pairs = []

  if (filters.name) pairs.push(`filter[name]=${encodeLike(filters.name)}`)
  if (filters.reference) pairs.push(`filter[reference]=${encodeLike(filters.reference)}`)
  if (filters.categoryId) {
    pairs.push(`filter[id_category_default]=${encodeURIComponent(filters.categoryId)}`)
  }
  if (filters.active !== '' && filters.active !== undefined && filters.active !== null) {
    pairs.push(`filter[active]=${encodeURIComponent(String(filters.active))}`)
  }
  if (filters.visibility) pairs.push(`filter[visibility]=${encodeURIComponent(filters.visibility)}`)
  if (filters.priceMin || filters.priceMax) {
    const min = filters.priceMin ? String(filters.priceMin) : ''
    const max = filters.priceMax ? String(filters.priceMax) : ''
    pairs.push(`filter[price]=${encodeURIComponent(`[${min},${max}]`)}`)
  }

  return pairs
}

const buildProductsQuery = ({ page, pageSize, filters = {}, sort = null }) => {
  const offset = Math.max(0, (page - 1) * pageSize)
  const limit = `${offset},${pageSize}`

  const pairs = ['display=full']
  if (sort && sort.field) {
    const direction = sort.direction || 'ASC'
    pairs.push(`sort=${encodeURIComponent(`[${sort.field}_${direction}]`)}`)
  } else {
    pairs.push(`sort=${encodeURIComponent('[id_DESC]')}`)
  }
  pairs.push(`limit=${encodeURIComponent(limit)}`)

  const filterPairs = buildFilters(filters)
  filterPairs.forEach((pair) => pairs.push(pair))

  return pairs.join('&')
}

// Récupère le nombre total de produits correspondant aux filtres.
// PS WS expose ce total dans le header X-Total-Count (certaines versions)
// ou via une requête avec display=[id] sans limit.
const countFrontProducts = async (filters = {}) => {
  try {
    const client = createClient()
    const filterPairs = buildFilters({ ...filters, active: filters.active ?? 1 })
    const query = ['display=[id]', ...filterPairs].join('&')
    const response = await client.get(`/products?${query}`)
    const json = xmlToJson(response.data)
    const root = json.prestashop || {}
    const productsRoot = root.products || json.products || {}
    const nodes = asArray(productsRoot.product)
    return nodes.length
  } catch {
    return 0
  }
}

const getFrontProducts = async ({ page = 1, pageSize = 24, filters = {}, sort = null, withTotal = false } = {}) => {
  const client = createClient()
  // Forcer active=1 si non précisé pour ne pas afficher les produits désactivés
  const effectiveFilters = { active: 1, ...filters }
  const query = buildProductsQuery({ page, pageSize, filters: effectiveFilters, sort })
  const [response, total] = await Promise.all([
    client.get(`/products?${query}`),
    withTotal ? countFrontProducts(effectiveFilters) : Promise.resolve(null),
  ])

  return {
    items: parseProducts(response.data),
    page,
    pageSize,
    total,
    totalPages: total != null ? Math.ceil(total / pageSize) : null,
  }
}

const getFrontProductById = async (id) => {
  const client = createClient()
  const response = await client.get(`/products/${id}?display=full`)
  const json = xmlToJson(response.data)
  const root = json.prestashop || {}
  const productNode = root.product || json.product

  if (!productNode) {
    return null
  }

  return parseProductNode(productNode)
}

const readOptionValueIds = (combo) => {
  const associations = combo?.associations || {}
  const pov = associations.product_option_values || {}
  const nodes = asArray(pov.product_option_value)
  return nodes
    .map((node) => readText(node.id) || readAttr(node, 'id'))
    .filter(Boolean)
}

const parseCombinationNode = (combo) => {
  return {
    id: readText(combo.id) || readAttr(combo, 'id'),
    productId: readText(combo.id_product),
    reference: readText(combo.reference),
    price: readText(combo.price) || '0',
    quantity: readText(combo.quantity),
    optionValueIds: readOptionValueIds(combo),
  }
}

const getOptionValueLabel = async (client, optionValueId) => {
  try {
    const response = await client.get(`/product_option_values/${optionValueId}?display=full`)
    const json = xmlToJson(response.data)
    const root = json.prestashop || {}
    const node = root.product_option_value || json.product_option_value || {}
    const groupId = readText(node.id_attribute_group)

    let groupName = ''
    if (groupId) {
      try {
        const groupResponse = await client.get(`/product_options/${groupId}?display=full`)
        const groupJson = xmlToJson(groupResponse.data)
        const groupRoot = groupJson.prestashop || {}
        const groupNode = groupRoot.product_option || groupJson.product_option || {}
        groupName = readLocalized(groupNode.name)
      } catch {
        // ignore
      }
    }

    const valueName = readLocalized(node.name)
    return groupName ? `${groupName}: ${valueName}` : valueName
  } catch {
    return ''
  }
}

const getCombinationById = async (id) => {
  const client = createClient()
  const response = await client.get(`/combinations/${id}?display=full`)
  const json = xmlToJson(response.data)
  const root = json.prestashop || {}
  const comboNode = root.combination || json.combination

  if (!comboNode) {
    return null
  }

  const combo = parseCombinationNode(comboNode)

  // Charger les libellés des attributs (taille: ngoza, couleur: mainty, etc.)
  if (combo.optionValueIds.length) {
    const labels = await Promise.all(
      combo.optionValueIds.map((vid) => getOptionValueLabel(client, vid))
    )
    combo.attributeLabel = labels.filter(Boolean).join(' · ')
  } else {
    combo.attributeLabel = combo.reference || ''
  }

  return combo
}

const getProductImageUrl = (productId, imageId) => {
  if (!productId || !imageId) {
    return ''
  }

  try {
    const { apiBaseUrl, apiKey } = getWebserviceEnv()
    const baseUrl = normalizeApiUrl(apiBaseUrl)
    const key = apiKey ? `?ws_key=${encodeURIComponent(apiKey)}` : ''
    return `${baseUrl}/images/products/${productId}/${imageId}${key}`
  } catch (error) {
    return ''
  }
}

export { getFrontProducts, getFrontProductById, getCombinationById, getProductImageUrl }
