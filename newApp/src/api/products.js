// api/products.js
import { getXmlClient } from './xmlClient'
import { asArray, readAttr, readText, xmlToJson, buildXML } from '../utils/xml'
import { normalizeCategoryName } from '../services/mapper'

// ============================================
// FONCTIONS INTERNES
// ============================================

// Fonction manquante : récupérer le template vide
async function getProductTemplate() {
  const client = getXmlClient()
  const response = await client.get('/products?schema=blank')
  return xmlToJson(response.data)
}

// Fonction manquante : nettoyer le nom pour l'URL
function sanitizeForLinkRewrite(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Fonction manquante : calcul prix HT
function calculatePriceHT(priceTTC, taxRate) {
  if (!taxRate || taxRate === '') return parseFloat(priceTTC)
  const rateStr = taxRate.replace(',', '.').replace('%', '')
  const rate = parseFloat(rateStr) / 100
  const priceHT = parseFloat(priceTTC) / (1 + rate)
  return Math.round(priceHT * 100) / 100
}

// Parsing des produits pour getProducts
const parseProducts = (xmlText) => {
  const json = xmlToJson(xmlText)
  const prestashop = json.prestashop || {}
  const productsRoot = prestashop.products || json.products || {}
  const productNodes = asArray(productsRoot.product)

  return productNodes.map((product) => {
    const id = readText(product.id) || readAttr(product, 'id')
    const languages = product.name ? asArray(product.name.language) : []
    const preferred = languages.find((lang) => readText(lang)) || (languages.length ? languages[0] : '')
    const name = readText(preferred)
    const price = readText(product.price) || '0'
    const categoryId = readText(product.id_category_default) || ''

    return {
      id,
      name,
      price,
      wholesalePrice: Number(readText(product.wholesale_price) || 0),
      categoryId,
      reference: readText(product.reference) || '',
      active:    readText(product.active) === '1',
    }
  })
}

const encodeLike = (value) => `%25%5B${encodeURIComponent(value)}%5D%25`

const buildFilters = (filters = {}) => {
  const pairs = []

  if (filters.name) pairs.push(`filter[name]=${encodeLike(filters.name)}`)
  if (filters.reference) pairs.push(`filter[reference]=${encodeLike(filters.reference)}`)
  if (filters.categoryId) pairs.push(`filter[id_category_default]=${encodeURIComponent(filters.categoryId)}`)
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

const buildProductsQuery = ({ filters, page, pageSize, sort }) => {
  const pairs = ['display=full']

  if (sort && sort.field) {
    const direction = sort.direction || 'ASC'
    pairs.push(`sort=${encodeURIComponent(`[${sort.field}_${direction}]`)}`)
  }

  if (page && pageSize) {
    const offset = Math.max(0, (page - 1) * pageSize)
    pairs.push(`limit=${encodeURIComponent(`${offset},${pageSize + 1}`)}`)
  }

  const filterPairs = buildFilters(filters)
  filterPairs.forEach((pair) => pairs.push(pair))

  return pairs.join('&')
}

// ============================================
// FONCTIONS EXPORTÉES
// ============================================

/**
 * Crée un produit simple (version simplifiée qui fonctionne)
 */// api/products.js - Ajoutez 'state' dans la création du produit
export async function createProduct(productData) {
  const client = getXmlClient()

  const name = productData.name || 'Produit'
  const linkRewrite = normalizeCategoryName(name)

  const defaultCategoryId = productData.id_category_default || 2
  const categoryIds = Array.from(
    new Set([String(defaultCategoryId), '2'].filter(Boolean))
  )

  const priceValue = Number(productData.price ?? 0)
  const wholesaleValue = Number(productData.wholesalePrice ?? 0)
  const price = Number.isFinite(priceValue) ? priceValue.toFixed(6) : '0.000000'
  const wholesalePrice = Number.isFinite(wholesaleValue)
    ? wholesaleValue.toFixed(6)
    : '0.000000'

  const xml = buildXML({
    prestashop: {
      product: {
        name: {
          language: {
            '@_id': '1',
            '#text': name,
          },
        },
        link_rewrite: {
          language: {
            '@_id': '1',
            '#text': linkRewrite,
          },
        },
        reference: productData.reference || '',
        price,
        wholesale_price: wholesalePrice,
        ...(productData.available_date
          ? { available_date: productData.available_date }
          : {}),
        ...(productData.id_tax_rules_group
          ? { id_tax_rules_group: productData.id_tax_rules_group }
          : {}),
        id_category_default: defaultCategoryId,
        associations: {
          categories: {
            category: categoryIds.map((id) => ({ id })),
          },
        },
        active: 1,
        state: 1,  // 🔑 AJOUTER CETTE LIGNE - 1 = visible, 0 = masqué
        available_for_order: 1, // Disponible à la commande
        show_price: 1, // Afficher le prix sur le front
        visibility: 'both', // Visible sur le front et dans le catalogue
      },
    },
  })

  const response = await client.post('/products', xml)
  const json = xmlToJson(response.data)
  return readText(json.prestashop?.product?.id)
}
/**
 * Crée un produit avec gestion de la taxe
 */// api/products.js - Dans createProductWithTax
export async function createProductWithTax(productData) {
  const template = await getProductTemplate()
  
  const cleanName = sanitizeForLinkRewrite(productData.name)
  
  template.prestashop.product.name = {
    language: {
      '@_id': '1',
      '#text': productData.name
    }
  }
  
  let priceHT = productData.price
  
  if (productData.taxRate && productData.priceType === 'TTC') {
    priceHT = calculatePriceHT(productData.price, productData.taxRate)
  }
  
  template.prestashop.product.price = parseFloat(priceHT)
  template.prestashop.product.wholesale_price = productData.wholesalePrice || 0
  
  if (productData.id_tax_rules_group) {
    template.prestashop.product.id_tax_rules_group = productData.id_tax_rules_group
  }

  if (productData.available_date) {
    template.prestashop.product.available_date = productData.available_date
  }
  
  const defaultCategoryId = productData.id_category_default || 2
  template.prestashop.product.id_category_default = defaultCategoryId

  const categoryIds = Array.from(new Set([String(defaultCategoryId), '2'].filter(Boolean)))
  template.prestashop.product.associations = template.prestashop.product.associations || {}
  template.prestashop.product.associations.categories = {
    category: categoryIds.map((id) => ({ id })),
  }
  template.prestashop.product.link_rewrite = {
    language: {
      '@_id': '1',
      '#text': cleanName
    }
  }
  template.prestashop.product.active = 1
  template.prestashop.product.state = 1  // 🔑 AJOUTER CETTE LIGNE
  template.prestashop.product.show_price = 1  // Afficher le prix sur le front
  template.prestashop.product.available_for_order = 1  // Disponible à la commande
  template.prestashop.product.visibility = 'both'  // Visible sur le front et dans le catalogue
  
  const xmlToSend = buildXML(template)
  const response = await getXmlClient().post('/products', xmlToSend)
  const json = xmlToJson(response.data)
  return readText(json.prestashop.product.id)
}
/**
 * Récupère les produits
 */
export async function getProducts(options = {}) {
  const { filters = {}, page = null, pageSize = 25, sort = null } = options
  const client = getXmlClient()
  const query = buildProductsQuery({ filters, page, pageSize, sort })
  const response = await client.get(`/products?${query}`)
  const xmlText = response.data

  const items = parseProducts(xmlText)
  let hasMore = false

  if (page && pageSize && items.length > pageSize) {
    hasMore = true
    items.length = pageSize
  }

  return {
    items,
    rawXml: xmlText,
    page: page || 1,
    pageSize: pageSize || items.length,
    hasMore,
  }
}

/**
 * Recherche produits par nom, référence ou ID (filtre OR PrestaShop WS).
 * Utilisé par la page d'ajout de stock et les écrans nécessitant une recherche textuelle fiable.
 */
export async function searchProducts(query, options = {}) {
  const q = (query || '').trim()
  const { page = 1, pageSize = 25, sort = null, active } = options

  if (!q) {
    return { items: [], page, pageSize, hasMore: false }
  }

  const client = getXmlClient()
  const pairs = ['display=[id,name,reference,active,price]']

  if (/^\d+$/.test(q)) {
    pairs.push(`filter[id]=${encodeURIComponent(`[${q}]`)}`)
  } else {
    const encoded = encodeLike(q)
    pairs.push(`filter[name]=${encoded}|filter[reference]=${encoded}`)
  }

  if (active !== '' && active !== undefined && active !== null) {
    pairs.push(`filter[active]=${encodeURIComponent(String(active))}`)
  }

  if (sort?.field) {
    const direction = sort.direction || 'ASC'
    pairs.push(`sort=${encodeURIComponent(`[${sort.field}_${direction}]`)}`)
  }

  if (page && pageSize) {
    const offset = Math.max(0, (page - 1) * pageSize)
    pairs.push(`limit=${encodeURIComponent(`${offset},${pageSize + 1}`)}`)
  }

  const response = await client.get(`/products?${pairs.join('&')}`)
  const items = parseProducts(response.data)

  let hasMore = false
  if (page && pageSize && items.length > pageSize) {
    hasMore = true
    items.length = pageSize
  }

  return { items, page, pageSize, hasMore }
}

/**
 * Met à jour le stock d'un produit
 */
export async function updateProductStock(productId, quantity) {
  const client = getXmlClient()
  const getStockId = (stock) => readText(stock?.id) || readAttr(stock, 'id')

  const response = await client.get(
    `/stock_availables?display=[id,id_product,id_product_attribute,id_shop,id_shop_group,depends_on_stock,out_of_stock]&filter[id_product]=${productId}`
  )
  const json = xmlToJson(response.data)

  let stockId = null
  const stocks = json.prestashop?.stock_availables?.stock_available
  if (Array.isArray(stocks)) {
    stockId = getStockId(stocks[0])
  } else if (stocks) {
    stockId = getStockId(stocks)
  }

  if (stockId) {
    const stockNode = Array.isArray(stocks) ? stocks[0] : stocks
    const idProduct = readText(stockNode?.id_product) || String(productId)
    const idProductAttribute = readText(stockNode?.id_product_attribute) || '0'
    const idShop = readText(stockNode?.id_shop) || '1'
    const idShopGroup = readText(stockNode?.id_shop_group) || '0'
    const dependsOnStock = readText(stockNode?.depends_on_stock) || '0'
    const outOfStock = readText(stockNode?.out_of_stock) || '2'

    const updateXml = buildXML({
      prestashop: {
        stock_available: {
          id: stockId,
          id_product: idProduct,
          id_product_attribute: idProductAttribute,
          id_shop: idShop,
          id_shop_group: idShopGroup,
          depends_on_stock: dependsOnStock,
          out_of_stock: outOfStock,
          quantity: quantity,
        },
      },
    })
    await client.put(`/stock_availables/${stockId}`, updateXml)
    return stockId
  }

  throw new Error(`Stock indisponible pour le produit ${productId}`)
}