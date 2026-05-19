import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

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

const getStockAvailable = async ({ productId, combinationId = 0, shopId }) => {
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

const buildStockXml = (stock) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

const updateStockAvailable = async (stock) => {
  const client = getClient()
  const xml = buildStockXml(stock)
  await client.put(`/stock_availables/${stock.id}`, xml)
}

export { getStockAvailable, updateStockAvailable }
