// services/benefice/beneficeService.js
//
// Orchestration haut niveau : combine la couche API (fetch) avec le calculator (calculs purs).
// Expose une interface simple à la vue / store : "donne-moi le bénéfice du jour", "donne-moi le total".

import {
  fetchAllOrdersForBenefice,
  fetchOrdersByDateForBenefice,
  fetchOrderLinesBatch,
} from '../../api/benefice'
import { getProducts } from '../../api/products'
import { getStockMovements } from '../../api/stockMovements'
import {
  computeTotalBenefice,
  computeRealBenefice,
  computeDailyBenefice,
  computeTotalSalesHt,
  computeTotalPurchasesHt,
  computeTotalCostOfGoodsSold,
  computeLineBenefice,
  groupBeneficeByCategory,
  detailBeneficeByCategory,
  groupBeneficeByDay,
  runStrategy,
  registerStrategy,
  listStrategies,
} from './beneficeCalculator'

const pad2 = (value) => String(value).padStart(2, '0')

export const getTodayDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

const normalizeDateKey = (dateString) => {
  const text = String(dateString || '').trim()
  if (!text) return ''
  const ymd = text.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const dmy = text.match(/^([0-9]{2})\/([0-9]{2})\/([0-9]{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return ''
}

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const DEFAULT_PRODUCT_PAGE_SIZE = 200
const DEFAULT_STOCK_MOVEMENTS_LIMIT = 2000
const DEFAULT_STOCK_CONCURRENCY = 4

const runWithConcurrency = async (items, concurrency, task) => {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await task(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

const fetchAllProductsForBenefice = async (opts = {}) => {
  const pageSize = opts.pageSize ?? DEFAULT_PRODUCT_PAGE_SIZE
  const items = []
  let page = 1

  while (true) {
    if (opts.signal?.aborted) break
    const result = await getProducts({ page, pageSize, sort: { field: 'id', direction: 'ASC' } })
    const batch = Array.isArray(result.items) ? result.items : []
    items.push(...batch)
    if (!result.hasMore || batch.length < pageSize) break
    page += 1
  }

  return items
}

const buildProductMaps = (products = []) => {
  const categoryByProductId = {}
  const wholesaleByProductId = new Map()
  const productIds = []

  products.forEach((product) => {
    const id = String(product?.id || '').trim()
    if (!id) return
    productIds.push(id)
    categoryByProductId[id] = String(product?.categoryId || '').trim()
    wholesaleByProductId.set(id, toNumber(product?.wholesalePrice))
  })

  return { productIds, categoryByProductId, wholesaleByProductId }
}

const fetchPurchaseLinesForProducts = async (productIds, opts = {}) => {
  const ids = Array.isArray(productIds) ? productIds.filter(Boolean) : []
  if (!ids.length) return []

  const dateKey = normalizeDateKey(opts.date)
  const limit = opts.limit ?? DEFAULT_STOCK_MOVEMENTS_LIMIT
  const concurrency = opts.concurrency ?? DEFAULT_STOCK_CONCURRENCY
  const wholesaleByProductId = opts.wholesaleByProductId

  const movementBatches = await runWithConcurrency(ids, concurrency, async (productId) => {
    if (opts.signal?.aborted) return []
    const result = await getStockMovements({
      id_product: productId,
      limit,
      ...(dateKey ? { date_from: dateKey, date_to: dateKey } : {}),
    })
    return Array.isArray(result?.movements) ? result.movements : []
  })

  const purchases = []

  movementBatches.forEach((movements, idx) => {
    const fallbackProductId = String(ids[idx])
    const fallbackPrice = wholesaleByProductId?.get(fallbackProductId) ?? 0
    const list = Array.isArray(movements) ? movements : []

    list.forEach((movement) => {
      const quantity = toNumber(movement?.quantity_delta)
      if (quantity <= 0) return

      const movementDate = normalizeDateKey(movement?.date_add)
      if (dateKey && movementDate !== dateKey) return

      const productId = String(movement?.id_product || fallbackProductId)
      const unitPurchasePrice = wholesaleByProductId?.get(productId) ?? fallbackPrice

      purchases.push({
        productId,
        productAttributeId: String(movement?.id_product_attribute || '0'),
        quantity,
        unitPurchasePrice,
        dateAdd: movement?.date_add || '',
      })
    })
  })

  return purchases
}

/**
 * Charge toutes les lignes (orders → order_rows enrichies) d'une date donnée
 * et calcule le bénéfice journalier.
 *
 * @param {string} date YYYY-MM-DD
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ date: string, benefice: number, salesHt: number, purchasesHt: number, lines: object[], purchaseLines: object[], orderCount: number }>}
 */
export async function loadDailyBenefice(date, opts = {}) {
  const target = String(date || '').trim() || getTodayDate()
  const orders = await fetchOrdersByDateForBenefice(target, { signal: opts.signal })

  const orderIds = orders.map((o) => o.orderId).filter(Boolean)
  const lines = orderIds.length
    ? await fetchOrderLinesBatch(orderIds, { signal: opts.signal })
    : []

  const products = await fetchAllProductsForBenefice({ signal: opts.signal })
  const { productIds, wholesaleByProductId } = buildProductMaps(products)
  const purchaseLines = await fetchPurchaseLinesForProducts(productIds, {
    date: target,
    signal: opts.signal,
    wholesaleByProductId,
  })

  const orderDateById = new Map(orders.map((o) => [String(o.orderId), o.dateAdd]))
  const enriched = lines.map((line) => ({
    ...line,
    dateAdd: orderDateById.get(String(line.orderId)) || '',
  }))

  const salesHt        = computeTotalSalesHt(enriched)
  const purchasesHt    = computeTotalPurchasesHt(purchaseLines)
  const realPurchasesHt = computeTotalCostOfGoodsSold(enriched, wholesaleByProductId)

  return {
    date: target,
    benefice:      computeDailyBenefice(enriched, target, purchaseLines),
    realBenefice:  computeRealBenefice(enriched, wholesaleByProductId),
    salesHt,
    purchasesHt,
    realPurchasesHt,
    lines: enriched,
    purchaseLines,
    orderCount: orders.length,
  }
}

/**
 * Charge l'ensemble des commandes et calcule le bénéfice total cumulé.
 *
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ benefice: number, salesHt: number, purchasesHt: number, lines: object[], purchaseLines: object[], orderCount: number, byDay: Record<string, number>, byCategory: Record<string, number> }>}
 */
export async function loadTotalBenefice(opts = {}) {
  const orders = await fetchAllOrdersForBenefice({ signal: opts.signal })

  const orderIds = orders.map((o) => o.orderId).filter(Boolean)
  const lines = orderIds.length
    ? await fetchOrderLinesBatch(orderIds, { signal: opts.signal })
    : []

  const products = await fetchAllProductsForBenefice({ signal: opts.signal })
  const { productIds, categoryByProductId, wholesaleByProductId } = buildProductMaps(products)
  const purchaseLines = await fetchPurchaseLinesForProducts(productIds, {
    signal: opts.signal,
    wholesaleByProductId,
  })

  const orderDateById = new Map(orders.map((o) => [String(o.orderId), o.dateAdd]))
  const enriched = lines.map((line) => ({
    ...line,
    dateAdd: orderDateById.get(String(line.orderId)) || '',
  }))

  const salesHt        = computeTotalSalesHt(enriched)
  const purchasesHt    = computeTotalPurchasesHt(purchaseLines)
  const realPurchasesHt = computeTotalCostOfGoodsSold(enriched, wholesaleByProductId)

  return {
    benefice:      computeTotalBenefice(enriched, purchaseLines),
    realBenefice:  computeRealBenefice(enriched, wholesaleByProductId),
    salesHt,
    purchasesHt,
    realPurchasesHt,
    lines: enriched,
    purchaseLines,
    categoryByProductId,
    orderCount: orders.length,
    byDay: groupBeneficeByDay(enriched, purchaseLines),
    byCategory: groupBeneficeByCategory(enriched, { purchaseLines, categoryByProductId }),
    byCategoryDetailed: detailBeneficeByCategory(enriched, {
      purchaseLines,
      categoryByProductId,
      wholesaleByProductId,
    }),
  }
}

/**
 * Helper : applique une stratégie nommée sur les lignes enrichies déjà chargées.
 * Utilisé par les vues pour pivoter (daily / total / byDay / extensions futures).
 *
 * @param {string} strategy
 * @param {object[]} lines
 * @param {object} [options]
 */
export function applyStrategy(strategy, lines, options) {
  return runStrategy(strategy, lines, options)
}

// Re-export pour étendre depuis l'extérieur (consommateur peut enregistrer ses
// propres stratégies sans importer le calculator directement).
export { registerStrategy, listStrategies, computeLineBenefice }
