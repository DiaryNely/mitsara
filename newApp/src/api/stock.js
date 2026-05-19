// api/stock.js
import { getXmlClient } from './xmlClient'
import { searchProducts } from './products'
import { xmlToJson, buildXML, readText, readAttr, asArray } from '../utils/xml'

// ─── Helpers internes ──────────────────────────────────────────────────────────

const getStockId = (node) => readText(node?.id) || readAttr(node, 'id')

const stockIdCache = new Map()

let stockMovementReasonsCache = null

const loadStockMovementReasons = async () => {
  if (stockMovementReasonsCache) return stockMovementReasonsCache
  try {
    stockMovementReasonsCache = await getStockMovementReasons()
  } catch {
    stockMovementReasonsCache = []
  }
  return stockMovementReasonsCache
}

const getDefaultReasonIdForSign = async (sign) => {
  const reasons = await loadStockMovementReasons()
  const desired = sign === -1 ? '-1' : '1'
  const match = reasons.find((r) => String(r.sign) === desired)
  return match?.id || reasons[0]?.id || 1
}

function parseStockAvailableNode(node) {
  return {
    id:                   getStockId(node),
    id_product:           readText(node?.id_product)           || '0',
    id_product_attribute: readText(node?.id_product_attribute) || '0',
    id_shop:              readText(node?.id_shop)              || '1',
    id_shop_group:        readText(node?.id_shop_group)        || '0',
    depends_on_stock:     readText(node?.depends_on_stock)     || '0',
    out_of_stock:         readText(node?.out_of_stock)         || '2',
    quantity:             parseInt(readText(node?.quantity)    || '0', 10),
    reserved_quantity:    parseInt(readText(node?.reserved_quantity) || '0', 10),
  }
}

function parseStockNode(node) {
  return {
    id:                   getStockId(node),
    id_product:           readText(node?.id_product)           || '0',
    id_product_attribute: readText(node?.id_product_attribute) || '0',
  }
}

export function clearStockIdCache() {
  stockIdCache.clear()
}

/**
 * Récupère l'id_stock (id stock_available) pour un produit + déclinaison.
 * Nécessaire pour POST /api/stock_movements.
 */
export async function getStockIdForProduct({
  productId,
  attributeId = 0,
} = {}) {
  if (!productId) return null

  const key = `${productId}:${attributeId || 0}`
  if (stockIdCache.has(key)) return stockIdCache.get(key)

  const client = getXmlClient()
  const filters = [
    `filter[id_product]=${encodeURIComponent(productId)}`,
    `filter[id_product_attribute]=${encodeURIComponent(attributeId || 0)}`,
  ]
  const query = `display=[id,id_product,id_product_attribute]&${filters.join('&')}`
  const resp = await client.get(`/stock_availables?${query}`)
  const json = xmlToJson(resp.data)
  const nodes = asArray(json?.prestashop?.stock_availables?.stock_available)
  const items = nodes.map(parseStockNode)

  const match = items.find((item) => {
    if (String(item.id_product) !== String(productId)) return false
    if (String(item.id_product_attribute) !== String(attributeId || 0)) return false
    return true
  }) || items[0]

  const resolvedId = match?.id || null
  if (resolvedId) {
    stockIdCache.set(key, resolvedId)
  }
  return resolvedId
}

// ─── Produits ─────────────────────────────────────────────────────────────────

/**
 * Recherche des produits par nom, référence ou ID (délègue à api/products.searchProducts).
 */
export async function searchProductsForStock(query, options = {}) {
  const result = await searchProducts(query, options)
  return result.items
}

/**
 * Récupère les déclinaisons d'un produit avec leur référence et valeurs d'options.
 */
export async function getProductCombinations(productId) {
  const client = getXmlClient()
  try {
    const resp = await client.get(
      `/combinations?display=[id,id_product,reference]&filter[id_product]=${productId}`
    )
    const json  = xmlToJson(resp.data)
    const nodes = asArray(json?.prestashop?.combinations?.combination)

    return nodes.map((c) => ({
      id:        readText(c?.id) || readAttr(c, 'id'),
      reference: readText(c?.reference) || '',
    })).filter((c) => c.id)
  } catch {
    // Produit sans déclinaisons ou endpoint inaccessible → liste vide
    return []
  }
}

// ─── Stock disponible ──────────────────────────────────────────────────────────

/**
 * Récupère l'entrée stock_available pour un produit (+ déclinaison optionnelle).
 * Retourne null si introuvable.
 */
export async function getStockAvailable(productId, attributeId = 0) {
  const client = getXmlClient()
  const attrFilter = attributeId
    ? `&filter[id_product_attribute]=${attributeId}`
    : '&filter[id_product_attribute]=0'

  const resp = await client.get(
    `/stock_availables?display=full&filter[id_product]=${productId}${attrFilter}`
  )
  const json   = xmlToJson(resp.data)
  const stocks = json?.prestashop?.stock_availables?.stock_available

  if (!stocks) return null

  const node = Array.isArray(stocks) ? stocks[0] : stocks
  return parseStockAvailableNode(node)
}

/**
 * Récupère tous les stock_availables d'un produit (1 par déclinaison + 1 global).
 */
export async function getAllStockAvailables(productId) {
  const client = getXmlClient()
  const resp = await client.get(
    `/stock_availables?display=full&filter[id_product]=${productId}`
  )
  const json   = xmlToJson(resp.data)
  const stocks = asArray(json?.prestashop?.stock_availables?.stock_available)
  return stocks.map(parseStockAvailableNode)
}

/**
 * Synchronise la quantité du stock global (id_product_attribute=0)
 * avec la somme des déclinaisons.
 */
export async function syncProductStockFromCombinations(productId) {
  if (!productId) return null

  const stocks = await getAllStockAvailables(productId)
  if (!stocks.length) return null

  const comboStocks = stocks.filter((s) => String(s.id_product_attribute || '0') !== '0')
  if (!comboStocks.length) return null

  const total = comboStocks.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
  const root = stocks.find((s) => String(s.id_product_attribute || '0') === '0')
  if (!root) return null

  if (Number(root.quantity) === total) return total

  await updateStockAvailable(root, total)
  return total
}

/**
 * Met à jour la quantité d'un stock_available existant.
 * stockNode = objet retourné par getStockAvailable()
 */
export async function updateStockAvailable(stockNode, newQuantity) {
  const client = getXmlClient()

  const xml = buildXML({
    prestashop: {
      stock_available: {
        id:                   stockNode.id,
        id_product:           stockNode.id_product,
        id_product_attribute: stockNode.id_product_attribute,
        id_shop:              stockNode.id_shop,
        id_shop_group:        stockNode.id_shop_group,
        depends_on_stock:     stockNode.depends_on_stock,
        out_of_stock:         stockNode.out_of_stock,
        quantity:             newQuantity,
      },
    },
  })

  await client.put(`/stock_availables/${stockNode.id}`, xml)
}

// ─── Mouvements de stock ──────────────────────────────────────────────────────

/**
 * Récupère les motifs de mouvements natifs PrestaShop.
 */
export async function getStockMovementReasons() {
  const client = getXmlClient()
  const resp   = await client.get('/stock_movement_reasons?display=full')
  const json   = xmlToJson(resp.data)
  const nodes  = asArray(json?.prestashop?.stock_movement_reasons?.stock_movement_reason)

  return nodes.map((r) => {
    const langs = asArray(r?.name?.language)
    const nameNode = langs.find((l) => readText(l)) || langs[0] || ''
    return {
      id:   readText(r?.id) || readAttr(r, 'id'),
      name: readText(nameNode),
      sign: readText(r?.sign) || '1',
    }
  }).filter((r) => r.id)
}

/**
 * Enregistre un mouvement dans ps_stock_mvt via /api/stock_movements.
 * Nécessite un id_stock valide (id stock_available).
 *
 * @returns {string} id du mouvement
 */
export async function recordStockMovement(data) {
  const client = getXmlClient()

  if (!data?.id_stock) {
    throw new Error('id_stock est obligatoire pour créer un stock_movement.')
  }

  const xml = buildXML({
    prestashop: {
      stock_movement: {
        id_stock:            data.id_stock            || 0,
        id_stock_mvt_reason: data.id_stock_mvt_reason || 1,
        id_employee:         data.id_employee         || 0,
        employee_firstname:  data.employee_firstname  || '',
        employee_lastname:   data.employee_lastname   || '',
        ...(data.id_order ? { id_order: data.id_order } : {}),
        ...(data.id_supply_order ? { id_supply_order: data.id_supply_order } : {}),
        physical_quantity:   Math.abs(data.physical_quantity || 0),
        date_add:            data.date_add            || new Date().toISOString().slice(0, 19).replace('T', ' '),
        sign:                data.sign === -1 ? -1 : 1,
        price_te:            '0.000000',
        last_wa:             '0.000000',
        current_wa:          '0.000000',
      },
    },
  })

  const resp = await client.post('/stock_movements', xml)
  const json = xmlToJson(resp.data)
  const node = json?.prestashop?.stock_movement
    || json?.prestashop?.stock_movements?.stock_movement

  const resolvedNode = Array.isArray(node) ? node[0] : node

  let id = readText(resolvedNode?.id) || readAttr(resolvedNode, 'id')

  if (!id) {
    // Fallback: extraire l'id depuis xlink:href (ex: ".../stock_movements/42")
    const href = readAttr(resolvedNode, 'xlink:href') || ''
    const hrefMatch = href.match(/\/(\d+)\/?$/)
    if (hrefMatch) id = hrefMatch[1]
  }

  // HTTP 2xx = le mouvement a bien été créé côté PS.
  // Si l'id est absent de la réponse (comportement variable selon la version PS),
  // on retourne null sans planter — les appelants n'utilisent pas cet id.
  if (!id) {
    console.warn('[recordStockMovement] id introuvable dans la réponse PS — mouvement probablement créé (HTTP 2xx).')
    return null
  }

  return id
}

/**
 * Enregistre un mouvement via l'endpoint custom pour conserver date_add.
 */
export async function recordStockMovementViaModule(data) {
  const client = getXmlClient()

  const xml = buildXML({
    prestashop: {
      stock_movement_insert: {
        id_stock: data.id_stock || 0,
        id_product: data.id_product || data.productId || 0,
        id_product_attribute: data.id_product_attribute || data.attributeId || 0,
        id_stock_mvt_reason: data.id_stock_mvt_reason || 1,
        physical_quantity: Math.abs(data.physical_quantity || 0),
        sign: data.sign === -1 ? -1 : 1,
        ...(data.date_add ? { date_add: data.date_add } : {}),
        ...(data.id_employee ? { id_employee: data.id_employee } : {}),
        ...(data.employee_firstname ? { employee_firstname: data.employee_firstname } : {}),
        ...(data.employee_lastname ? { employee_lastname: data.employee_lastname } : {}),
      },
    },
  })

  try {
    const resp = await client.post('/stock_movement_insert', xml)
    const json = xmlToJson(resp.data)
    const node = json?.prestashop?.stock_movement_insert
    return readText(node?.id) || readText(node?.id_stock_mvt) || null
  } catch (err) {
    console.debug('[stock_movement_insert] POST ignore :', err?.response?.status)
    return null
  }
}

/**
 * Enregistre un mouvement via /stock_movements en résolvant l'id_stock.
 */
export async function recordStockMovementForProduct(params) {
  const {
    productId,
    attributeId = 0,
    physical_quantity,
    sign,
    date_add,
    id_stock_mvt_reason,
    id_employee,
    employee_firstname,
    employee_lastname,
    stockId,
    preferModule = false,
  } = params || {}

  if (!productId || !physical_quantity) return null

  const resolvedStockId = stockId || await getStockIdForProduct({ productId, attributeId })
  if (!resolvedStockId) {
    console.warn(
      `[stock_movements] id_stock_available introuvable (productId=${productId}, attributeId=${attributeId}). ` +
      'Verifier stock_available pour ce produit/declinaison.'
    )
    return null
  }

  const reasonId = id_stock_mvt_reason || await getDefaultReasonIdForSign(sign)

  if (preferModule || date_add) {
    const moduleId = await recordStockMovementViaModule({
      id_stock: resolvedStockId,
      productId,
      attributeId,
      id_stock_mvt_reason: reasonId,
      id_employee,
      employee_firstname,
      employee_lastname,
      physical_quantity,
      sign,
      date_add,
    })

    if (moduleId) return moduleId
  }

  return recordStockMovement({
    id_stock: resolvedStockId,
    id_stock_mvt_reason: reasonId,
    id_employee,
    employee_firstname,
    employee_lastname,
    physical_quantity,
    sign,
    date_add,
  })
}

/**
 * Lit les mouvements de stock depuis /api/stock_movements.
 * Le schéma WS expose id_product, id_product_attribute, product_name, reference —
 * filtrage par produit pleinement supporté sans ASM.
 *
 * @param {object} filters  — id_product, id_product_attribute, id_stock_mvt_reason, date_from, date_to
 * @param {number} page
 * @param {number} limit
 */
/**
 * Charge un batch de mouvements depuis /api/stock_movements.
 *
 * CONTRAINTES WS CONFIRMÉES :
 *  - filter[id_product] → 500 SQL (champ JOIN sans alias de table, bug PS)
 *  - sort / filter sur date_add → error 38 (champ non supporté)
 *  - display=full + filtre → 500 (JOIN i18n)
 * SOLUTION : display explicite, aucun filtre WS, tri et filtre côté client.
 *
 * @param {number} offset  début de la fenêtre
 * @param {number} limit   nombre d'entrées à récupérer
 */
export async function fetchStockMovementsBatch(offset = 0, limit = 500, options = {}) {
  const client = getXmlClient()

  const FIELDS = [
    'id', 'id_product', 'id_product_attribute', 'id_employee',
    'id_stock_mvt_reason', 'physical_quantity', 'sign', 'date_add',
    'reference', 'ean13', 'id_order',
  ].join(',')

  const sort = options.sort || 'id_DESC'
  const sortQuery = sort ? `&sort=[${encodeURIComponent(sort)}]` : ''
  const url = `/stock_movements?display=[${FIELDS}]${sortQuery}&limit=${encodeURIComponent(`${offset},${limit}`)}`

  const resp  = await client.get(url)
  const json  = xmlToJson(resp.data)
  const nodes = asArray(json?.prestashop?.stock_movements?.stock_movement)

  return nodes.map((m) => {
    const sign    = parseInt(readText(m?.sign)              || '1', 10)
    const physQty = parseInt(readText(m?.physical_quantity) || '0', 10)
    return {
      id:                   readText(m?.id)                   || readAttr(m, 'id'),
      id_product:           readText(m?.id_product)           || '0',
      id_product_attribute: readText(m?.id_product_attribute) || '0',
      id_stock_mvt_reason:  readText(m?.id_stock_mvt_reason)  || '0',
      id_employee:          readText(m?.id_employee)          || '0',
      reference:            readText(m?.reference)            || '',
      ean13:                readText(m?.ean13)                 || '',
      physical_quantity:    physQty,
      sign,
      quantity_delta:       sign * physQty,
      date_add:             readText(m?.date_add)             || '',
    }
  })
}

/**
 * Calcule la quantité réservée pour un produit + déclinaison.
 * 
 * PrestaShop ne maintient pas le champ reserved_quantity automatiquement.
 * On recalcule depuis les order_details actifs (commandes non livrées, non annulées).
 * 
 * États finaux (stock libéré) : 5 (livré), 6 (annulé)
 */
export async function getReservedQuantity(productId, attributeId = 0) {
  if (!productId) return 0

  const client = getXmlClient()
  const FINAL_STATES = new Set(['5', '6'])

  try {
    // Récupère les order_details pour ce produit/déclinaison
    const detailFilter = attributeId
      ? `&filter[product_attribute_id]=${attributeId}`
      : ''
    const detailResp = await client.get(
      `/order_details?display=[id,id_order,product_id,product_attribute_id,product_quantity]&filter[product_id]=${productId}${detailFilter}&limit=9999`
    )
    const detailJson = xmlToJson(detailResp.data)
    const details = asArray(detailJson?.prestashop?.order_details?.order_detail)

    if (!details.length) return 0

    // Récupère les états des commandes concernées
    const orderIds = [...new Set(details.map((d) => readText(d?.id_order) || ''))]
    const orderStates = new Map()

    if (orderIds.length) {
      const orderResp = await client.get(
        `/orders?display=[id,current_state]&limit=9999`
      )
      const orderJson = xmlToJson(orderResp.data)
      const orders = asArray(orderJson?.prestashop?.orders?.order)

      orders.forEach((o) => {
        const oid = readText(o?.id) || ''
        const state = readText(o?.current_state) || ''
        if (oid) orderStates.set(oid, state)
      })
    }

    // Somme les quantités des commandes actives
    let reserved = 0
    details.forEach((d) => {
      const orderId = readText(d?.id_order) || ''
      const state = orderStates.get(orderId) || ''
      const qty = parseInt(readText(d?.product_quantity) || '0', 10)

      // Si l'état n'est pas final (pas livré, pas annulé) → stock réservé
      if (!FINAL_STATES.has(state) && qty > 0) {
        reserved += qty
      }
    })

    return reserved
  } catch (err) {
    console.warn(`[getReservedQuantity] Erreur pour produit ${productId}:`, err?.message)
    return 0
  }
}
