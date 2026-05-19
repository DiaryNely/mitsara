// services/benefice/stockByCategoryService.js
//
// Calcul du stock par catégorie identique au backoffice PS :
//   available = stock_available.quantity  (déjà décrémenté par les réservations)
//   reserved  = sum(product_quantity) des commandes actives (état ≠ livré/annulé)
//   physical  = available + reserved
//
// reserved_quantity de ps_stock_available n'est PAS maintenu automatiquement par PS
// (colonne souvent à 0). On le recalcule depuis les order_details, comme le BO.
//
// Stratégie de fetch : 4 ressources en parallèle (paginées), puis jonction en mémoire.

import { getXmlClient } from '../../api/xmlClient'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const PAGE_SIZE = 500

// États finaux : commande livrée (5) ou annulée (6) → le stock n'est plus réservé.
const FINAL_STATES = new Set(['5', '6'])

// ── Pagination générique ────────────────────────────────────────────────────────

const fetchAllPages = async (client, baseUrl, parsePage) => {
  const items = []
  let offset = 0

  while (true) {
    const sep  = baseUrl.includes('?') ? '&' : '?'
    const resp = await client.get(`${baseUrl}${sep}limit=${offset},${PAGE_SIZE}`)
    const batch = parsePage(resp.data)
    items.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return items
}

// ── Parseurs ────────────────────────────────────────────────────────────────────

const parseProductPage = (xmlText) => {
  const json  = xmlToJson(xmlText)
  const nodes = asArray(json?.prestashop?.products?.product)
  return nodes
    .map((p) => ({
      id:         readText(p?.id) || readAttr(p, 'id'),
      categoryId: readText(p?.id_category_default) || '',
    }))
    .filter((p) => p.id)
}

const parseStockPage = (xmlText) => {
  const json  = xmlToJson(xmlText)
  const nodes = asArray(json?.prestashop?.stock_availables?.stock_available)
  return nodes
    .map((s) => ({
      id_product:           readText(s?.id_product)           || '0',
      id_product_attribute: readText(s?.id_product_attribute) || '0',
      quantity:             parseInt(readText(s?.quantity)    || '0', 10),
    }))
    .filter((s) => s.id_product !== '0')
}

const parseOrderPage = (xmlText) => {
  const json  = xmlToJson(xmlText)
  const nodes = asArray(json?.prestashop?.orders?.order)
  return nodes
    .map((o) => ({
      id:           readText(o?.id) || readAttr(o, 'id'),
      currentState: readText(o?.current_state) || '',
    }))
    .filter((o) => o.id)
}

const parseOrderDetailPage = (xmlText) => {
  const json  = xmlToJson(xmlText)
  const nodes = asArray(json?.prestashop?.order_details?.order_detail)
  return nodes
    .map((d) => ({
      id_order:             readText(d?.id_order)             || '0',
      product_id:           readText(d?.product_id)           || '0',
      product_attribute_id: readText(d?.product_attribute_id) || '0',
      product_quantity:     parseInt(readText(d?.product_quantity) || '0', 10),
    }))
    .filter((d) => d.id_order !== '0' && d.product_id !== '0')
}

// ── Point d'entrée ──────────────────────────────────────────────────────────────

export async function loadStockSummaryByCategory() {
  const client = getXmlClient()

  // Les 4 ressources sont indépendantes → fetch en parallèle.
  const [products, stocks, orders, orderDetails] = await Promise.all([
    fetchAllPages(client, '/products?display=[id,id_category_default]',                                        parseProductPage),
    fetchAllPages(client, '/stock_availables?display=[id,id_product,id_product_attribute,quantity]',           parseStockPage),
    fetchAllPages(client, '/orders?display=[id,current_state]',                                                parseOrderPage),
    fetchAllPages(client, '/order_details?display=[id,id_order,product_id,product_attribute_id,product_quantity]', parseOrderDetailPage),
  ])

  // ── Carte produit → catégorie ─────────────────────────────────────────────
  const productCategoryMap = new Map()
  products.forEach((p) => {
    productCategoryMap.set(String(p.id), String(p.categoryId || ''))
  })

  // ── IDs des commandes actives (non livrées, non annulées) ─────────────────
  const activeOrderIds = new Set()
  orders.forEach((o) => {
    if (!FINAL_STATES.has(String(o.currentState))) {
      activeOrderIds.add(String(o.id))
    }
  })

  // ── Quantité réservée par (product_id:attribute_id) ───────────────────────
  // = sum des product_quantity des commandes actives
  const reservedMap = new Map()
  orderDetails.forEach((d) => {
    if (!activeOrderIds.has(String(d.id_order))) return
    if (d.product_quantity <= 0) return
    const key = `${d.product_id}:${d.product_attribute_id}`
    reservedMap.set(key, (reservedMap.get(key) || 0) + d.product_quantity)
  })

  // ── Entrées stock regroupées par produit (pour dédupliquer les déclinaisons) ──
  const stocksByProduct = new Map()
  stocks.forEach((s) => {
    const pid = String(s.id_product)
    if (!stocksByProduct.has(pid)) stocksByProduct.set(pid, [])
    stocksByProduct.get(pid).push(s)
  })

  // ── Agrégation par catégorie ──────────────────────────────────────────────
  const totalsMap = new Map()

  stocksByProduct.forEach((productStocks, productId) => {
    const categoryId = productCategoryMap.get(productId) || 'uncategorized'

    // Produit avec déclinaisons : l'entrée globale (attribute=0) est un agrégat PS
    // potentiellement désynchronisé — on ne l'utilise pas pour éviter le doublon.
    const hasCombinations = productStocks.some((s) => s.id_product_attribute !== '0')
    const entries = hasCombinations
      ? productStocks.filter((s) => s.id_product_attribute !== '0')
      : productStocks

    const bucket = totalsMap.get(categoryId) || { physical: 0, reserved: 0, available: 0 }

    entries.forEach((s) => {
      const key      = `${s.id_product}:${s.id_product_attribute}`
      const available = s.quantity
      const reserved  = reservedMap.get(key) || 0
      bucket.available += available
      bucket.reserved  += reserved
      bucket.physical  += available + reserved
    })

    totalsMap.set(categoryId, bucket)
  })

  return {
    byCategory:   Object.fromEntries(totalsMap.entries()),
    productCount: products.length,
  }
}
