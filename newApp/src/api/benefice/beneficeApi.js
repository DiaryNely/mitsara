// api/benefice/beneficeApi.js
//
// Couche d'accès aux données PrestaShop pour la fonctionnalité Bénéfice.
// Ne contient AUCUNE logique métier — uniquement des appels WS et de la normalisation.
//
// Les calculs sont délégués à `services/benefice/beneficeCalculator.js`.

import { getXmlClient } from '../xmlClient'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'
import { getOrders, getOrderRows, getOrdersByDateRangePage, getPaidOrderStateIds } from '../orders'
import { getTaxRateForGroup } from '../../services/frontoffice/taxService'
import { getShopContext } from '../../services/frontoffice/contextService'
import { validateAndEnrichLine } from './beneficeDataValidator'

const toNumber = (value) => {
  const normalized = String(value ?? '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

// Cache mémoire (productId → wholesalePrice). Réinitialisable via clearWholesalePriceCache().
const wholesalePriceCache = new Map()
const taxRulesGroupCache = new Map()

const parseWholesalePrice = (xmlText) => {
  const json = xmlToJson(xmlText)
  const product = json?.prestashop?.product || json?.product
  if (!product) return 0
  return toNumber(readText(product.wholesale_price))
}

const parseTaxRulesGroupId = (xmlText) => {
  const json = xmlToJson(xmlText)
  const product = json?.prestashop?.product || json?.product
  if (!product) return ''
  return String(readText(product.id_tax_rules_group) || '')
}

/**
 * Récupère le prix d'achat (wholesale_price HT) d'un produit PrestaShop.
 * Mis en cache pour éviter de re-fetcher le même produit à chaque ligne de commande.
 *
 * @param {string|number} productId
 * @returns {Promise<number>} prix HT (0 si absent ou erreur)
 */
export async function getWholesalePrice(productId) {
  const key = String(productId || '').trim()
  if (!key) return 0
  if (wholesalePriceCache.has(key)) return wholesalePriceCache.get(key)

  try {
    const client = getXmlClient()
    const response = await client.get(`/products/${encodeURIComponent(key)}?display=[wholesale_price]`)
    const price = parseWholesalePrice(response.data)
    wholesalePriceCache.set(key, price)
    return price
  } catch {
    wholesalePriceCache.set(key, 0)
    return 0
  }
}

const getProductTaxRulesGroupId = async (productId) => {
  const key = String(productId || '').trim()
  if (!key) return ''
  if (taxRulesGroupCache.has(key)) return taxRulesGroupCache.get(key)

  try {
    const client = getXmlClient()
    const response = await client.get(`/products/${encodeURIComponent(key)}?display=[id_tax_rules_group]`)
    const groupId = parseTaxRulesGroupId(response.data)
    taxRulesGroupCache.set(key, groupId)
    return groupId
  } catch {
    taxRulesGroupCache.set(key, '')
    return ''
  }
}

const getProductTaxRate = async (productId) => {
  const groupId = await getProductTaxRulesGroupId(productId)
  return getTaxRateForGroup(groupId)
}

export function clearWholesalePriceCache() {
  wholesalePriceCache.clear()
}

// Retourne les IDs d'état à inclure dans les calculs de bénéfice :
// "Paiement accepté" + "Livré" — les deux états représentent des ventes effectives.
const getBeneficeStateIds = async (client) => {
  const paid = await getPaidOrderStateIds(client)
  const context = await getShopContext()
  const ids = new Set(paid.map(String))
  if (context.deliveredStateId) ids.add(String(context.deliveredStateId))
  return Array.from(ids)
}

/**
 * Récupère toutes les commandes (toutes pages), normalisées au format Benefice.
 * Format de retour : Array<{ orderId, reference, dateAdd, statusId }>
 *
 * @param {object} [opts]
 * @param {number} [opts.pageSize=200]
 * @param {AbortSignal} [opts.signal]
 */
export async function fetchAllOrdersForBenefice(opts = {}) {
  const pageSize = opts.pageSize ?? 200
  let offset = 0
  const orders = []
  const client = getXmlClient()
  const validStateIds = await getBeneficeStateIds(client)

  while (true) {
    if (opts.signal?.aborted) break
    const page = await getOrders({ limit: pageSize, offset })
    if (!page.length) break
    orders.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }

  const filtered = orders.filter((order) => validStateIds.includes(String(order.statusId || '')))

  return filtered.map(normalizeOrder)
}

/**
 * Récupère les commandes pour une date donnée (YYYY-MM-DD).
 *
 * @param {string} date
 * @param {object} [opts]
 * @param {number} [opts.pageSize=120]
 * @param {AbortSignal} [opts.signal]
 */
export async function fetchOrdersByDateForBenefice(date, opts = {}) {
  const pageSize = opts.pageSize ?? 120
  let offset = 0
  const orders = []
  const client = getXmlClient()
  const validStateIds = await getBeneficeStateIds(client)

  while (true) {
    if (opts.signal?.aborted) break
    const result = await getOrdersByDateRangePage(date, { limit: pageSize, offset })
    const items = Array.isArray(result.items) ? result.items : []
    orders.push(...items)
    if (result.shouldStop || items.length < pageSize) break
    offset += pageSize
  }

  const filtered = orders.filter((order) => validStateIds.includes(String(order.statusId || '')))

  return filtered.map(normalizeOrder)
}

const normalizeOrder = (order) => ({
  orderId: order?.id || '',
  reference: order?.reference || '',
  dateAdd: order?.dateAdd || '',
  statusId: order?.statusId || '',
})

/**
 * Récupère les lignes de commande enrichies des montants TTC/HT et du taux de taxe.
 * Format de retour : Array<{ orderId, productId, productAttributeId, productName, quantity, totalPriceTtc, totalPriceHt, taxRate }>
 *
 * @param {string|number} orderId
 */
export async function fetchOrderLinesWithWholesale(orderId) {
  if (!orderId) return []
  const rows = await getOrderRows(orderId)

  const enriched = []
  for (const row of rows) {
    const taxRate = await getProductTaxRate(row.productId)
    const quantity = toNumber(row.quantity)
    
    // ⚠️ CORRECTION: totalPriceHt/TTC peuvent être 0 dans Prestashop
    // Calculer à partir des prix unitaires si montants totaux manquants
    let totalPriceTtc = toNumber(row.totalPriceTtc)
    let totalPriceHt = toNumber(row.totalPriceHt)
    
    // Fallback: calculer total à partir prix unitaire × quantité
    if (!totalPriceTtc && !totalPriceHt && quantity > 0) {
      const unitPriceTtc = toNumber(row.unitPriceTtc)
      const unitPriceHt = toNumber(row.unitPriceHt)
      
      if (unitPriceTtc > 0) {
        totalPriceTtc = unitPriceTtc * quantity
        console.warn('⚠️ Benefice: TTC calculé (montant manquant):', {
          orderId,
          productId: row.productId,
          unitPriceTtc,
          quantity,
          totalPriceTtc,
        })
      }
      
      if (unitPriceHt > 0) {
        totalPriceHt = unitPriceHt * quantity
        console.warn('⚠️ Benefice: HT calculé (montant manquant):', {
          orderId,
          productId: row.productId,
          unitPriceHt,
          quantity,
          totalPriceHt,
        })
      }
    }

    // Log si toujours aucun montant
    if (!totalPriceTtc && !totalPriceHt) {
      console.warn('⚠️ Benefice: Ligne sans montants TTC/HT:', {
        orderId,
        productId: row.productId,
        quantity: row.quantity,
        unitPriceTtc: row.unitPriceTtc,
        unitPriceHt: row.unitPriceHt,
      })
    }

    const line = {
      orderId: String(orderId),
      orderReference: row.orderReference || '',
      productId: row.productId,
      productAttributeId: row.productAttributeId || '0',
      productName: row.productName || '',
      quantity,
      totalPriceTtc,
      totalPriceHt,
      taxRate,
    }

    // ✅ Valider et enrichir si montants manquants
    try {
      const validated = validateAndEnrichLine(line)
      if (validated) enriched.push(validated)
    } catch (err) {
      console.error('❌ Benefice: Impossible enrichir ligne:', err.message)
      // Fallback: ajouter la ligne même incomplete (pour ne pas tout arrêter)
      enriched.push(line)
    }
  }
  return enriched
}

/**
 * Helper : récupère pour un lot d'IDs commandes toutes les lignes enrichies (en parallèle borné).
 *
 * @param {Array<string|number>} orderIds
 * @param {object} [opts]
 * @param {number} [opts.concurrency=4]
 * @param {AbortSignal} [opts.signal]
 */
export async function fetchOrderLinesBatch(orderIds, opts = {}) {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, orderIds.length || 1))
  const results = new Array(orderIds.length)
  let cursor = 0

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      if (opts.signal?.aborted) return
      const idx = cursor++
      if (idx >= orderIds.length) return
      results[idx] = await fetchOrderLinesWithWholesale(orderIds[idx])
    }
  })

  await Promise.all(workers)
  return results.flat().filter(Boolean)
}

// Re-export pour pouvoir importer depuis `api/benefice` uniquement.
export { getOrders, getOrderRows, getOrdersByDateRangePage }
