import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const getClient = () => {
  const { apiBaseUrl, apiKey } = getWebserviceEnv()
  return createXmlClient({ apiUrl: normalizeApiUrl(apiBaseUrl), apiKey })
}

/* ── Parsers ─────────────────────────────────────────── */

const parseStockAvailables = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const stocksRoot = root.stock_availables || json.stock_availables || {}
  const nodes = asArray(stocksRoot.stock_available)

  return nodes.map((stock) => ({
    id: readText(stock.id) || readAttr(stock, 'id'),
    productId: readText(stock.id_product),
    combinationId: readText(stock.id_product_attribute),
    shopId: readText(stock.id_shop),
    shopGroupId: readText(stock.id_shop_group),
    quantity: Number(readText(stock.quantity) || 0),
    outOfStock: readText(stock.out_of_stock),
    dependsOnStock: readText(stock.depends_on_stock),
  }))
}

const readLocalizedName = (nameModel) => {
  if (!nameModel) return ''
  const language = asArray(nameModel.language)
  if (language.length) {
    const preferred = language.find((l) => readText(l)) || language[0]
    return readText(preferred)
  }
  return readText(nameModel)
}

const parseCategories = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const catsRoot = root.categories || json.categories || {}
  const nodes = asArray(catsRoot.category)

  return nodes
    .map((cat) => ({
      id: readText(cat.id) || readAttr(cat, 'id'),
      name: readLocalizedName(cat.name),
    }))
    .filter((c) => c.id && c.id !== '1' && c.id !== '2')
}

const parseProductList = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const productRoot = root.products || json.products || {}
  const nodes = asArray(productRoot.product)

  return nodes.map((p) => ({
    id: readText(p.id) || readAttr(p, 'id'),
    name: readLocalizedName(p.name),
  }))
}

const parseCombinations = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const combRoot = root.combinations || json.combinations || {}
  const nodes = asArray(combRoot.combination)

  return nodes.map((c) => ({
    id: readText(c.id) || readAttr(c, 'id'),
    reference: readText(c.reference) || '',
  }))
}


const fetchStocksByProduct = async (productId) => {
  const client = getClient()
  const response = await client.get(
    `/stock_availables?display=full&filter[id_product]=[${encodeURIComponent(productId)}]`
  )
  return parseStockAvailables(response.data)
}

const fetchCombinationsByProduct = async (productId) => {
  const client = getClient()
  const response = await client.get(
    `/combinations?display=full&filter[id_product]=[${encodeURIComponent(productId)}]`
  )
  return parseCombinations(response.data)
}

const getStockAvailable = async ({ productId, combinationId = 0, shopId } = {}) => {
  const client = getClient()
  const filters = [
    `filter[id_product]=[${encodeURIComponent(productId)}]`,
    `filter[id_product_attribute]=[${encodeURIComponent(combinationId || 0)}]`,
  ]

  if (shopId) {
    filters.push(`filter[id_shop]=[${encodeURIComponent(shopId)}]`)
  }

  const query = `display=full&${filters.join('&')}`
  const response = await client.get(`/stock_availables?${query}`)
  const stocks = parseStockAvailables(response.data)
  return stocks[0] || null
}

const buildStockXml = (stock) => `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_available>
    <id>${escapeXml(stock.id)}</id>
    <id_product>${escapeXml(stock.productId)}</id_product>
    <id_product_attribute>${escapeXml(stock.combinationId || 0)}</id_product_attribute>
    <id_shop>${escapeXml(stock.shopId)}</id_shop>
    <id_shop_group>${escapeXml(stock.shopGroupId)}</id_shop_group>
    <quantity>${escapeXml(stock.quantity)}</quantity>
    <depends_on_stock>${escapeXml(stock.dependsOnStock || 0)}</depends_on_stock>
    <out_of_stock>${escapeXml(stock.outOfStock || 0)}</out_of_stock>
  </stock_available>
</prestashop>`

const updateStockAvailable = async (stock) => {
  const client = getClient()
  const xml = buildStockXml(stock)
  await client.put(`/stock_availables/${stock.id}`, xml)
}

const fetchCategories = async () => {
  const client = getClient()
  const response = await client.get('/categories?display=full&filter[active]=[1]')
  return parseCategories(response.data)
}

const fetchProductsByCategory = async (categoryId) => {
  const client = getClient()
  const response = await client.get(
    `/products?display=full&filter[id_category_default]=[${encodeURIComponent(categoryId)}]`
  )
  return parseProductList(response.data)
}


const reduceStockByCategory = async (categoryId, quantity) => {
  const products = await fetchProductsByCategory(categoryId)
  const productCount = products.length
  let totalTheorique = 0
  let totalReallyReduced = 0
  const details = []

  for (const product of products) {
    const stocks = await fetchStocksByProduct(product.id)

    // Si le produit a des déclinaisons, on ignore le stock agrégat (combinationId=0)
    const hasCombinations = stocks.some((s) => s.combinationId !== '0' && s.combinationId !== 0)
    const targetStocks = hasCombinations
      ? stocks.filter((s) => s.combinationId !== '0' && s.combinationId !== 0)
      : stocks.filter((s) => s.combinationId === '0' || s.combinationId === 0 || !s.combinationId)

    let combinationMap = {}
    if (hasCombinations) {
      const combinations = await fetchCombinationsByProduct(product.id)
      combinations.forEach((c) => { combinationMap[c.id] = c.reference })
    }

    totalTheorique += quantity * targetStocks.length

    for (const stock of targetStocks) {
      const before = stock.quantity
      const reduced = Math.min(before, quantity)
      const after = Math.max(0, before - quantity)

      if (reduced > 0) {
        await updateStockAvailable({ ...stock, quantity: after })
      }

      totalReallyReduced += reduced

      let combinationLabel = null
      if (hasCombinations) {
        const ref = combinationMap[stock.combinationId]
        combinationLabel = ref || `Déclinaison #${stock.combinationId}`
      }

      details.push({
        productId: product.id,
        name: product.name,
        combinationId: stock.combinationId,
        combinationLabel,
        before,
        after,
        reduced,
      })
    }
  }

  return { totalTheorique, totalReallyReduced, productCount, details }
}

export {
  getStockAvailable,
  updateStockAvailable,
  fetchCategories,
  fetchProductsByCategory,
  fetchStocksByProduct,
  fetchCombinationsByProduct,
  reduceStockByCategory,
}
