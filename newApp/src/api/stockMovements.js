// api/stockMovements.js
// Native PrestaShop Webservice implementation for stock movements.

import { getXmlClient } from './xmlClient'
import {
  getStockAvailable,
  getAllStockAvailables,
  updateStockAvailable,
  getStockMovementReasons,
  recordStockMovement,
} from './stock'
import { asArray, readAttr, readText, xmlToJson } from '../utils/xml'

const DEFAULT_LIMIT = 100
const MAX_BATCH = 500
const DELETE_BATCH = 200

const STOCK_MOVEMENT_FIELDS = [
  'id',
  'id_stock',
  'id_product',
  'id_product_attribute',
  'id_employee',
  'id_stock_mvt_reason',
  'physical_quantity',
  'sign',
  'date_add',
  'reference',
  'id_order',
].join(',')

const productCache = new Map()
const employeeCache = new Map()
let reasonCache = null

const chunkArray = (items, size) => {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const normalizeDateOnly = (value) => String(value || '').slice(0, 10)

const parseProductName = (product) => {
  const languages = asArray(product?.name?.language)
  const preferred = languages.find((lang) => readText(lang)) || languages[0] || ''
  return readText(preferred) || ''
}

async function getReasonMap() {
  if (reasonCache) return reasonCache
  const reasons = await getStockMovementReasons().catch(() => [])
  const map = new Map()
  reasons.forEach((reason) => {
    if (!reason?.id) return
    map.set(String(reason.id), reason)
  })
  reasonCache = map
  return map
}

async function ensureProducts(ids) {
  const missing = ids
    .map((id) => String(id))
    .filter((id) => id && !productCache.has(id))

  if (!missing.length) return productCache

  const client = getXmlClient()
  const chunks = chunkArray(missing, 40)

  for (const chunk of chunks) {
    const filter = encodeURIComponent(`[${chunk.join('|')}]`)
    const query = `display=[id,name,reference]&filter[id]=${filter}`
    const resp = await client.get(`/products?${query}`)
    const json = xmlToJson(resp.data)
    const nodes = asArray(json?.prestashop?.products?.product)

    nodes.forEach((node) => {
      const id = readText(node?.id) || readAttr(node, 'id')
      if (!id) return
      productCache.set(String(id), {
        name: parseProductName(node),
        reference: readText(node?.reference) || '',
      })
    })
  }

  return productCache
}

async function ensureEmployees(ids) {
  const missing = ids
    .map((id) => String(id))
    .filter((id) => id && !employeeCache.has(id))

  if (!missing.length) return employeeCache

  const client = getXmlClient()
  const chunks = chunkArray(missing, 40)

  for (const chunk of chunks) {
    const filter = encodeURIComponent(`[${chunk.join('|')}]`)
    const query = `display=[id,firstname,lastname]&filter[id]=${filter}`
    const resp = await client.get(`/employees?${query}`)
    const json = xmlToJson(resp.data)
    const nodes = asArray(json?.prestashop?.employees?.employee)

    nodes.forEach((node) => {
      const id = readText(node?.id) || readAttr(node, 'id')
      if (!id) return
      employeeCache.set(String(id), {
        firstname: readText(node?.firstname) || '',
        lastname: readText(node?.lastname) || '',
      })
    })
  }

  return employeeCache
}

const resolveReasonId = async (sign) => {
  const map = await getReasonMap()
  const match = Array.from(map.values()).find((reason) => String(reason.sign) === String(sign))
  return match?.id || '1'
}

const buildMovement = (raw, reasonMap, productMap, employeeMap) => {
  const product = productMap.get(String(raw.id_product)) || {}
  const employee = employeeMap.get(String(raw.id_employee)) || {}
  const reason = reasonMap.get(String(raw.id_stock_mvt_reason)) || {}

  const fallbackName = raw.id_product ? `#${raw.id_product}` : ''

  return {
    ...raw,
    product_name: product.name || fallbackName,
    reference: raw.reference || product.reference || '',
    reason: reason.name || '',
    employee_firstname: employee.firstname || '',
    employee_lastname: employee.lastname || '',
  }
}

const sortMovementsDesc = (items) => {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a?.date_add || '')
    const bTime = Date.parse(b?.date_add || '')
    const aValid = Number.isFinite(aTime)
    const bValid = Number.isFinite(bTime)

    if (aValid && bValid && aTime !== bTime) return bTime - aTime
    if (aValid && !bValid) return -1
    if (!aValid && bValid) return 1

    return String(b?.id || '').localeCompare(String(a?.id || ''))
  })
}

const filterMovement = (m, params) => {
  if (
    params.id_product &&
    m.id_product &&
    String(m.id_product) !== '0' &&
    String(m.id_product) !== String(params.id_product)
  ) {
    return false
  }
  if (
    params.id_product_attribute &&
    m.id_product_attribute &&
    String(m.id_product_attribute) !== '0' &&
    String(m.id_product_attribute) !== String(params.id_product_attribute)
  ) {
    return false
  }

  const date = normalizeDateOnly(m.date_add)
  if (params.date_from && date && date < params.date_from) return false
  if (params.date_to && date && date > params.date_to) return false

  return true
}

const parseStockMovementNode = (node) => {
  const sign = parseInt(readText(node?.sign) || '1', 10)
  const physical = parseInt(readText(node?.physical_quantity) || '0', 10)

  return {
    id: readText(node?.id) || readAttr(node, 'id'),
    id_stock: readText(node?.id_stock) || '0',
    id_product: readText(node?.id_product) || '0',
    id_product_attribute: readText(node?.id_product_attribute) || '0',
    id_employee: readText(node?.id_employee) || '0',
    id_stock_mvt_reason: readText(node?.id_stock_mvt_reason) || '0',
    physical_quantity: physical,
    sign,
    quantity_delta: sign * physical,
    reference: readText(node?.reference) || '',
    id_order: readText(node?.id_order) || '0',
    date_add: readText(node?.date_add) || '',
  }
}

const resolveStockContextForProduct = async (productId, attributeId) => {
  if (!productId) return { stockIds: [], stockMap: new Map() }

  if (attributeId) {
    const stock = await getStockAvailable(productId, attributeId)
    const stockIds = stock?.id ? [String(stock.id)] : []
    const stockMap = new Map()
    if (stock?.id) {
      stockMap.set(String(stock.id), {
        id_product: String(stock.id_product || productId),
        id_product_attribute: String(stock.id_product_attribute || attributeId || 0),
      })
    }
    return { stockIds, stockMap }
  }

  const stocks = await getAllStockAvailables(productId)
  const stockIds = stocks.map((s) => String(s.id)).filter(Boolean)
  const stockMap = new Map()
  stocks.forEach((s) => {
    if (!s?.id) return
    stockMap.set(String(s.id), {
      id_product: String(s.id_product || productId),
      id_product_attribute: String(s.id_product_attribute || 0),
    })
  })
  return { stockIds, stockMap }
}

const fetchMovementsByStockId = async (stockId, limit) => {
  if (!stockId) return []

  const client = getXmlClient()
  const query = new URLSearchParams()
  query.set('display', `[${STOCK_MOVEMENT_FIELDS}]`)
  query.set('filter[id_stock]', String(stockId))
  query.set('sort', '[id_DESC]')
  query.set('limit', String(limit))

  const resp = await client.get(`/stock_movements?${query.toString()}`)
  const json = xmlToJson(resp.data)
  const nodes = asArray(
    json?.prestashop?.stock_movements?.stock_movement ||
    json?.prestashop?.stock_mvts?.stock_mvt
  )
  return nodes.map(parseStockMovementNode)
}

const fetchMovementsBatch = async (offset, limit) => {
  const client = getXmlClient()
  const query = new URLSearchParams()
  query.set('display', `[${STOCK_MOVEMENT_FIELDS}]`)
  query.set('sort', '[id_DESC]')
  query.set('limit', `${offset},${limit}`)

  const resp = await client.get(`/stock_movements?${query.toString()}`)
  const json = xmlToJson(resp.data)
  const nodes = asArray(
    json?.prestashop?.stock_movements?.stock_movement ||
    json?.prestashop?.stock_mvts?.stock_mvt
  )
  return nodes.map(parseStockMovementNode)
}

const fetchMovementsForStockIds = async (stockIds, limit) => {
  if (!stockIds.length) return []

  const batchLimit = Math.min(MAX_BATCH, Math.max(100, limit))
  const batches = await Promise.all(
    stockIds.map((stockId) => fetchMovementsByStockId(stockId, batchLimit))
  )

  return batches.flat()
}

const applyStockDelta = async ({
  productId,
  attributeId = 0,
  delta,
  reasonId,
  employee,
  orderId,
  movementOnly,
  stockNode,
}) => {
  const resolvedStockNode = stockNode || await getStockAvailable(productId, attributeId)
  if (!resolvedStockNode) {
    throw new Error(`Stock introuvable pour le produit ${productId}`)
  }

  const stockId = resolvedStockNode.id
  if (!stockId) {
    throw new Error(`id_stock_available introuvable pour le produit ${productId}`)
  }

  const previousQty = Number(resolvedStockNode.quantity || 0)
  const nextQty = previousQty + delta

  if (!movementOnly) {
    await updateStockAvailable(resolvedStockNode, nextQty)
  }

  try {
    await recordStockMovement({
      id_stock: stockId,
      id_stock_mvt_reason: reasonId,
      id_employee: employee?.id || 0,
      employee_firstname: employee?.firstname || '',
      employee_lastname: employee?.lastname || '',
      id_order: orderId || 0,
      physical_quantity: Math.abs(delta),
      sign: delta < 0 ? -1 : 1,
    })
  } catch (err) {
    if (!movementOnly) {
      try {
        await updateStockAvailable(resolvedStockNode, previousQty)
      } catch { /* ignore rollback errors */ }
    }
    throw err
  }

  return { previousQty, nextQty }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getStockMovements(params = {}) {
  if (!params.id_product) {
    throw new Error('id_product est obligatoire')
  }

  const limit = Math.min(Number(params.limit || DEFAULT_LIMIT), 2000)
  const { stockIds, stockMap } = await resolveStockContextForProduct(
    params.id_product,
    params.id_product_attribute
  )
  const rawMovements = await fetchMovementsForStockIds(stockIds, limit)

  // Filtre client-side sur id_stock : filet de sécurité si le filtre WS
  // filter[id_stock] est ignoré ou retourne plus de lignes que prévu.
  // id_stock dans ps_stock_mvt = id_stock_available sur cette installation PS.
  const byStockId = stockIds.length
    ? rawMovements.filter((m) => stockIds.includes(String(m.id_stock || '')))
    : rawMovements

  const hydrated = byStockId.map((m) => {
    const stockInfo = stockMap.get(String(m.id_stock || ''))
    if (!stockInfo) return m

    return {
      ...m,
      id_product: m.id_product && m.id_product !== '0' ? m.id_product : stockInfo.id_product,
      id_product_attribute: m.id_product_attribute && m.id_product_attribute !== '0'
        ? m.id_product_attribute
        : stockInfo.id_product_attribute,
    }
  })

  const filtered = hydrated.filter((m) => filterMovement(m, params))
  const reasonMap = await getReasonMap()

  const productIds = new Set()
  const employeeIds = new Set()

  filtered.forEach((m) => {
    if (m.id_product && String(m.id_product) !== '0') productIds.add(String(m.id_product))
    if (m.id_employee && String(m.id_employee) !== '0') employeeIds.add(String(m.id_employee))
  })

  const [productMap, employeeMap] = await Promise.all([
    ensureProducts([...productIds]).catch(() => productCache),
    ensureEmployees([...employeeIds]).catch(() => employeeCache),
  ])

  const enriched = filtered.map((m) => buildMovement(m, reasonMap, productMap, employeeMap))
  const sorted = sortMovementsDesc(enriched).slice(0, limit)

  return { movements: sorted, total: sorted.length }
}

export async function updateStockWithMovement(idProduct, idProductAttribute, delta, employee = {}) {
  const sign = delta < 0 ? -1 : 1
  const reasonId = await resolveReasonId(sign)

  const stockNode = await getStockAvailable(idProduct, idProductAttribute || 0)
  if (!stockNode) {
    throw new Error(
      `Stock introuvable pour le produit ${idProduct}` +
      (idProductAttribute ? ` / declinaison ${idProductAttribute}` : '')
    )
  }

  const previousQty = Number(stockNode.quantity || 0)
  const nextQty = previousQty + delta

  await applyStockDelta({
    productId: idProduct,
    attributeId: idProductAttribute || 0,
    delta,
    reasonId,
    employee,
    stockNode,
  })

  return {
    success: true,
    old_quantity: previousQty,
    new_quantity: nextQty,
    delta,
  }
}

export async function recordOrderStockOut(orderId, items, options = {}) {
  if (!orderId || !items?.length) return { success: false, movementsCreated: 0 }

  const sign = -1
  const reasonId = await resolveReasonId(sign)

  const filteredItems = items.filter((item) => item.productId && item.quantity > 0)
  if (!filteredItems.length) return { success: false, movementsCreated: 0 }

  const prepared = await Promise.all(
    filteredItems.map(async (item) => {
      const stockNode = await getStockAvailable(item.productId, item.combinationId || 0)
      if (!stockNode) {
        throw new Error(`Stock introuvable pour le produit ${item.productId}`)
      }
      if (!stockNode.id) {
        throw new Error(`id_stock_available introuvable pour le produit ${item.productId}`)
      }

      return { item, stockNode }
    })
  )

  let movementsCreated = 0

  for (const entry of prepared) {
    const delta = -Number(entry.item.quantity || 0)
    if (!delta) continue

    const employeeId = options?.employee?.id ?? 1
    await recordStockMovement({
      id_stock: entry.stockNode.id,
      id_stock_mvt_reason: reasonId,
      id_employee: employeeId,
      employee_firstname: options?.employee?.firstname || '',
      employee_lastname: options?.employee?.lastname || '',
      id_order: orderId || 0,
      physical_quantity: Math.abs(delta),
      sign: -1,
    })

    movementsCreated += 1
  }

  return { success: true, movementsCreated }
}

export async function clearStockMovements(opts = {}) {
  const client = getXmlClient()
  const targetProductId = opts.id_product ? String(opts.id_product) : null
  const ids = []

  const stockIds = targetProductId
    ? (await resolveStockContextForProduct(targetProductId)).stockIds
    : []

  if (targetProductId && !stockIds.length) {
    return { success: true, deleted: 0, total_before: 0, total_after: 0 }
  }

  if (targetProductId) {
    const movements = await fetchMovementsForStockIds(stockIds, 2000)
    ids.push(...movements.map((m) => m.id).filter(Boolean))
  } else {
    let offset = 0
    while (true) {
      const batch = await fetchMovementsBatch(offset, DELETE_BATCH).catch(() => [])
      if (!batch.length) break

      ids.push(...batch.map((m) => m.id).filter(Boolean))

      if (batch.length < DELETE_BATCH) break
      offset += DELETE_BATCH
    }
  }

  let deleted = 0
  const totalBefore = ids.length

  for (const id of ids) {
    try {
      await client.delete(`/stock_movements/${id}`)
      deleted += 1
    } catch (err) {
      const status = err?.response?.status
      if (status === 404) {
        // Déjà supprimé (cascade PS) — compté comme succès.
        deleted += 1
        continue
      }
      if (status === 405) {
        // DELETE non supporté pour stock_movements sur cette installation PS.
        // Inutile de tenter les suivants, même résultat.
        console.warn('[clearStockMovements] DELETE /stock_movements non supporté (405) — étape ignorée.')
        break
      }
      throw err
    }
  }

  return {
    success: true,
    deleted,
    total_before: totalBefore,
    total_after: Math.max(0, totalBefore - deleted),
  }
}
