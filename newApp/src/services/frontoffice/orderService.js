import { getWebserviceEnv } from '../../config/runtimeEnv'
import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'
import { getShopContext } from './contextService'
import { getStockAvailable } from './stockService'
import { computePriceHt, computePriceTtc, getTaxRateForGroup } from './taxService'
import { getCombinationById, getFrontProductById } from './products'
import { upsertCart } from './cartService'

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

const normalizeForMatch = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const extractPrestashopError = (error) => {
  const raw = error?.response?.data
  if (!raw || typeof raw !== 'string') {
    return error?.message || 'Erreur API PrestaShop.'
  }

  try {
    const json = xmlToJson(raw)
    const root = json.prestashop || {}
    const errorsNode = root.errors || json.errors || {}
    const errorList = asArray(errorsNode.error)
    const message = errorList
      .map((item) => readText(item.message))
      .filter(Boolean)
      .join(' / ')

    return message || raw
  } catch (parseError) {
    return raw
  }
}

const parseOrders = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const ordersRoot = root.orders || json.orders
  const singleOrder = root.order || json.order
  const nodes = ordersRoot ? asArray(ordersRoot.order) : asArray(singleOrder)

  return nodes.map((order) => ({
    id: readText(order.id) || readAttr(order, 'id'),
    reference: readText(order.reference),
    totalPaid: readText(order.total_paid_tax_incl) || readText(order.total_paid),
    totalProducts: readText(order.total_products_wt) || readText(order.total_products),
    totalShipping: readText(order.total_shipping),
    currentState: readText(order.current_state),
    payment: readText(order.payment),
    dateAdd: readText(order.date_add),
    dateUpd: readText(order.date_upd),
    cartId: readText(order.id_cart),
    addressId: readText(order.id_address_delivery),
    customerId: readText(order.id_customer),
  }))
}

const parseCartRows = (cartNode) => {
  const associations = cartNode?.associations || {}
  const cartRows = associations.cart_rows || {}
  const rows = asArray(cartRows.cart_row)

  return rows.map((row) => ({
    productId: readText(row.id_product),
    combinationId: readText(row.id_product_attribute),
    quantity: Number(readText(row.quantity) || 0),
  }))
}

const parseCarts = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const cartsRoot = root.carts || json.carts || {}
  const nodes = asArray(cartsRoot.cart)

  return nodes.map((cart) => ({
    id: readText(cart.id) || readAttr(cart, 'id'),
    customerId: readText(cart.id_customer),
    dateAdd: readText(cart.date_add),
    rows: parseCartRows(cart),
  }))
}

const parseOrderDetails = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const detailsRoot = root.order_details || json.order_details || {}
  const nodes = asArray(detailsRoot.order_detail)

  return nodes.map((detail) => ({
    id: readText(detail.id) || readAttr(detail, 'id'),
    productId: readText(detail.product_id),
    combinationId: readText(detail.product_attribute_id),
    name: readText(detail.product_name),
    reference: readText(detail.product_reference),
    quantity: Number(readText(detail.product_quantity) || 0),
    price: readText(detail.product_price),
    total: readText(detail.total_price_tax_incl),
  }))
}

const parseOrderHistories = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const historiesRoot = root.order_histories || json.order_histories || {}
  const nodes = asArray(historiesRoot.order_history)

  return nodes.map((history) => ({
    id: readText(history.id) || readAttr(history, 'id'),
    stateId: readText(history.id_order_state),
    dateAdd: readText(history.date_add),
  }))
}

const getCustomerOrders = async (customerId, { page = 1, pageSize = 20 } = {}) => {
  const client = getClient()
  const offset = Math.max(0, (page - 1) * pageSize)
  // date_add n'est pas triable via PS WS (erreur 38) — tri par id_DESC.
  const query = `display=full&filter[id_customer]=${encodeURIComponent(customerId)}&sort=[id_DESC]&limit=${offset},${pageSize}`
  const response = await client.get(`/orders?${query}`)
  return parseOrders(response.data)
}

const getCustomerCarts = async (customerId) => {
  if (!customerId) {
    return []
  }

  const client = getClient()
  const query = `display=full&filter[id_customer]=${encodeURIComponent(`[${customerId}]`)}&sort=[id_DESC]`

  try {
    const response = await client.get(`/carts?${query}`)
    const carts = parseCarts(response.data)
    if (carts.length) {
      return carts
    }
  } catch {
    // Fallback below
  }

  // Fallback: fetch all carts then filter by customer id
  const fallbackResponse = await client.get('/carts?display=full&sort=[id_DESC]')
  const allCarts = parseCarts(fallbackResponse.data)
  return allCarts.filter((cart) => String(cart.customerId || '') === String(customerId))
}

const buildCartTotals = async (carts) => {
  if (!carts.length) {
    return new Map()
  }

  const productCache = new Map()
  const comboCache = new Map()
  const taxCache = new Map()

  const getProduct = async (productId) => {
    const key = String(productId || '').trim()
    if (!key) return null
    if (productCache.has(key)) return productCache.get(key)
    const product = await getFrontProductById(key)
    productCache.set(key, product || null)
    return product
  }

  const getCombination = async (comboId) => {
    const key = String(comboId || '').trim()
    if (!key || key === '0') return { price: 0 }
    if (comboCache.has(key)) return comboCache.get(key)
    const combo = await getCombinationById(key)
    comboCache.set(key, combo || null)
    return combo
  }

  const getTaxRate = async (groupId) => {
    const key = String(groupId || '').trim()
    if (!key) return 0
    if (taxCache.has(key)) return taxCache.get(key)
    const rate = await getTaxRateForGroup(key)
    taxCache.set(key, rate)
    return rate
  }

  const totals = new Map()

  for (const cart of carts) {
    const rows = Array.isArray(cart.rows) ? cart.rows : []
    let total = 0

    for (const row of rows) {
      if (!row.productId || !row.quantity) {
        continue
      }

      const product = await getProduct(row.productId)
      if (!product) {
        continue
      }

      const taxRate = await getTaxRate(product.taxRulesGroupId)
      const combo = await getCombination(row.combinationId)
      const basePrice = Number(product.price || 0)
      const impact = Number(combo?.price || 0)
      const priceTtc = computePriceTtc(basePrice + impact, taxRate)
      total += priceTtc * Number(row.quantity || 0)
    }

    totals.set(cart.id, Number(total.toFixed(2)))
  }

  return totals
}

const sortByDateDesc = (items) => {
  return [...items].sort((a, b) => {
    const da = Date.parse(a.dateAdd || '') || 0
    const db = Date.parse(b.dateAdd || '') || 0
    return db - da
  })
}

const getCustomerOrdersWithCarts = async (customerId) => {
  const [orders, carts] = await Promise.all([
    getCustomerOrders(customerId),
    getCustomerCarts(customerId),
  ])

  const orderedCartIds = new Set(
    orders
      .map((order) => String(order.cartId || '').trim())
      .filter(Boolean)
  )

  const openCarts = carts.filter((cart) => {
    const id = String(cart.id || '').trim()
    return id && !orderedCartIds.has(id)
  })

  const totals = await buildCartTotals(openCarts)

  const cartRows = openCarts.map((cart) => ({
    id: cart.id,
    reference: 'Panier',
    totalPaid: totals.get(cart.id) || 0,
    totalProducts: totals.get(cart.id) || 0,
    totalShipping: '0',
    currentState: 'cart',
    payment: 'Panier',
    dateAdd: cart.dateAdd,
    dateUpd: cart.dateAdd,
    cartId: cart.id,
    isCart: true,
  }))

  return sortByDateDesc([...orders, ...cartRows])
}

const getOrderByCartId = async (cartId) => {
  if (!cartId) {
    return null
  }
  const client = getClient()
  const query = `display=full&filter[id_cart]=${encodeURIComponent(cartId)}&sort=[id_DESC]`
  const response = await client.get(`/orders?${query}`)
  const orders = parseOrders(response.data)
  return orders[0] || null
}

const getOrderById = async (orderId) => {
  const client = getClient()
  const response = await client.get(`/orders/${orderId}?display=full`)
  const orders = parseOrders(response.data)
  return orders[0] || null
}

const getOrderDetails = async (orderId) => {
  const client = getClient()
  // Filtre d'égalité exacte → pas de brackets (format range PS)
  const query = `display=full&filter[id_order]=${encodeURIComponent(orderId)}`
  const response = await client.get(`/order_details?${query}`)
  return parseOrderDetails(response.data)
}

const getOrderHistories = async (orderId) => {
  const client = getClient()
  const query = `display=full&filter[id_order]=${encodeURIComponent(orderId)}`
  const response = await client.get(`/order_histories?${query}`)
  return parseOrderHistories(response.data)
}

// Cache du premier ID entrepôt disponible (ASM).
// Retourne '0' si aucun entrepôt n'est configuré (ASM désactivé).
let _warehouseIdCache = null
const fetchWarehouseId = async () => {
  if (_warehouseIdCache !== null) return _warehouseIdCache
  try {
    const client = getClient()
    const response = await client.get('/warehouses?display=[id]&limit=1')
    const json = xmlToJson(response.data)
    const root = json.prestashop || {}
    const warehousesRoot = root.warehouses || json.warehouses || {}
    const nodes = asArray(warehousesRoot.warehouse)
    const firstId = nodes.length
      ? readText(nodes[0].id) || readAttr(nodes[0], 'id')
      : ''
    _warehouseIdCache = firstId || '0'
  } catch {
    _warehouseIdCache = '0'
  }
  return _warehouseIdCache
}

const getOrderStateMap = async () => {
  const client = getClient()
  const response = await client.get('/order_states?display=full')
  const json = xmlToJson(response.data)
  const root = json.prestashop || {}
  const statesRoot = root.order_states || json.order_states || {}
  const nodes = asArray(statesRoot.order_state)

  const map = nodes.reduce((acc, state) => {
    const id = readText(state.id) || readAttr(state, 'id')
    const name = readText(state.name?.language?.['#text']) || readText(state.name)
    acc[id] = name || `Etat ${id}`
    return acc
  }, {})

  map.cart = 'Non commande'
  return map
}

const buildOrderXml = ({ orderId, payload }) => {
  const idBlock = orderId ? `<id>${escapeXml(orderId)}</id>` : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    ${idBlock}
    <id_address_delivery>${escapeXml(payload.addressId)}</id_address_delivery>
    <id_address_invoice>${escapeXml(payload.addressId)}</id_address_invoice>
    <id_cart>${escapeXml(payload.cartId)}</id_cart>
    <id_currency>${escapeXml(payload.currencyId)}</id_currency>
    <id_lang>${escapeXml(payload.langId)}</id_lang>
    <id_customer>${escapeXml(payload.customerId)}</id_customer>
    <id_carrier>${escapeXml(payload.carrierId)}</id_carrier>
    <current_state>${escapeXml(payload.currentState)}</current_state>
    <module>${escapeXml(payload.module)}</module>
    <payment>${escapeXml(payload.payment)}</payment>
    <conversion_rate>1</conversion_rate>
    <total_paid>${escapeXml(payload.totalPaidIncl)}</total_paid>
    <total_paid_tax_incl>${escapeXml(payload.totalPaidIncl)}</total_paid_tax_incl>
    <total_paid_tax_excl>${escapeXml(payload.totalPaidExcl)}</total_paid_tax_excl>
    <total_paid_real>${escapeXml(payload.totalPaidIncl)}</total_paid_real>
    <total_products>${escapeXml(payload.totalProductsExcl)}</total_products>
    <total_products_wt>${escapeXml(payload.totalProductsIncl)}</total_products_wt>
    <total_shipping>0</total_shipping>
    <total_shipping_tax_incl>0</total_shipping_tax_incl>
    <total_shipping_tax_excl>0</total_shipping_tax_excl>
    <total_discounts>0</total_discounts>
    <total_discounts_tax_incl>0</total_discounts_tax_incl>
    <total_discounts_tax_excl>0</total_discounts_tax_excl>
    <carrier_tax_rate>0</carrier_tax_rate>
    <round_mode>2</round_mode>
    <round_type>1</round_type>
    <secure_key>${escapeXml(payload.secureKey)}</secure_key>
    <id_shop>${escapeXml(payload.shopId)}</id_shop>
    <id_shop_group>${escapeXml(payload.shopGroupId)}</id_shop_group>
  </order>
</prestashop>`
}

const buildOrderDetailXml = ({ payload }) => {
  // id_warehouse = 0 → pas d'entrepôt spécifique (ASM désactivé ou entrepôt par défaut).
  // Si ASM est activé, warehouseId doit être l'ID d'un entrepôt réel (voir fetchWarehouseId).
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_detail>
    <id_order>${escapeXml(payload.orderId)}</id_order>
    <id_warehouse>${escapeXml(payload.warehouseId || '0')}</id_warehouse>
    <product_id>${escapeXml(payload.productId)}</product_id>
    <product_attribute_id>${escapeXml(payload.combinationId || 0)}</product_attribute_id>
    <product_name>${escapeXml(payload.productName)}</product_name>
    <product_reference>${escapeXml(payload.productReference || '')}</product_reference>
    <product_quantity>${escapeXml(payload.quantity)}</product_quantity>
    <product_price>${escapeXml(payload.unitPriceExcl)}</product_price>
    <unit_price_tax_incl>${escapeXml(payload.unitPriceIncl)}</unit_price_tax_incl>
    <unit_price_tax_excl>${escapeXml(payload.unitPriceExcl)}</unit_price_tax_excl>
    <total_price_tax_incl>${escapeXml(payload.totalPriceIncl)}</total_price_tax_incl>
    <total_price_tax_excl>${escapeXml(payload.totalPriceExcl)}</total_price_tax_excl>
    <id_shop>${escapeXml(payload.shopId)}</id_shop>
    <id_shop_group>${escapeXml(payload.shopGroupId)}</id_shop_group>
  </order_detail>
</prestashop>`
}

const buildOrderHistoryXml = ({ payload }) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_order_state>${escapeXml(payload.stateId)}</id_order_state>
    <id_order>${escapeXml(payload.orderId)}</id_order>
  </order_history>
</prestashop>`
}

const validateStock = async ({ items, shopId }) => {
  for (const item of items) {
    const stock = await getStockAvailable({
      productId: item.productId,
      combinationId: item.combinationId || 0,
      shopId,
    })

    if (!stock) {
      throw new Error(`Stock introuvable pour le produit ${item.productId}.`)
    }

    if (stock.quantity < item.quantity) {
      throw new Error(`Stock insuffisant pour ${item.name}.`)
    }
  }
}

const placeOrder = async ({ cartId, customer, addressId, items }) => {
  if (!items.length) {
    throw new Error('Panier vide.')
  }

  const context = await getShopContext()
  await validateStock({ items, shopId: context.shopId })

  if (!context.paidStateId) {
    throw new Error('Etat « Paiement effectué » introuvable. Configurez VITE_PRESTASHOP_PAID_STATE_ID.')
  }

  const totals = items.reduce(
    (acc, item) => {
      const priceIncl = Number(item.price || 0)
      const rate = Number(item.taxRate || 0)
      const priceExcl = computePriceHt(priceIncl, rate)
      acc.totalIncl += priceIncl * item.quantity
      acc.totalExcl += priceExcl * item.quantity
      return acc
    },
    { totalIncl: 0, totalExcl: 0 }
  )

  const client = getClient()
  const orderPayload = {
    cartId,
    customerId: customer.id,
    addressId,
    currencyId: context.currencyId,
    langId: context.langId,
    carrierId: context.carrierId,
    // État initial = "Paiement effectué" (validation panier frontoffice).
    // Si paidStateId est vide → configurer VITE_PRESTASHOP_PAID_STATE_ID dans .env.local.
    currentState: context.paidStateId,
    module: context.codModule,
    payment: context.codPaymentLabel,
    totalPaidIncl: totals.totalIncl.toFixed(2),
    totalPaidExcl: totals.totalExcl.toFixed(2),
    totalProductsIncl: totals.totalIncl.toFixed(2),
    totalProductsExcl: totals.totalExcl.toFixed(2),
    secureKey: customer.secureKey || customer.secure_key || '',
    shopId: context.shopId,
    shopGroupId: context.shopGroupId,
  }

  const orderXml = buildOrderXml({ payload: orderPayload })
  let orderId = ''
  let recovered = false

  const existingOrder = await getOrderByCartId(cartId)
  if (existingOrder?.id) {
    orderId = existingOrder.id
    recovered = true
  } else {
    try {
      const orderResponse = await client.post('/orders', orderXml)
      const orderData = parseOrders(orderResponse.data)
      orderId = orderData[0]?.id || ''
    } catch (error) {
      const detail = extractPrestashopError(error)
      const normalized = normalizeForMatch(detail)
      const isDeprecatedHook =
        normalized.includes('neworder') && normalized.includes('gamification')
      const isCartAlreadyUsed =
        normalized.includes('panier ne peut etre charge') ||
        normalized.includes('commande a deja ete realisee avec ce panier') ||
        normalized.includes('cart cannot be loaded') ||
        normalized.includes('order already been placed with this cart')

      if ((isDeprecatedHook || isCartAlreadyUsed) && cartId) {
        const recoveredOrder = await getOrderByCartId(cartId)
        if (recoveredOrder?.id) {
          orderId = recoveredOrder.id
          recovered = true
        }
      }

      if (!orderId) {
        throw new Error(`Creation commande impossible: ${detail}`)
      }
    }
  }

  if (!orderId) {
    throw new Error('Impossible de creer la commande.')
  }

  // Toujours vérifier si PS a déjà créé les order_details automatiquement
  // (PrestaShop le fait à partir des cart_rows quand l'ordre est créé via WS).
  // Ce check évite la tentative de double-création qui déclenchait le 400 id_warehouse.
  const existingDetails = await getOrderDetails(orderId)
  const existingHistories = await getOrderHistories(orderId)

  if (!existingDetails.length) {
    // PS n'a pas auto-créé les détails → création manuelle nécessaire.
    // On récupère l'id_warehouse pour satisfaire l'API quand ASM est activé.
    const warehouseId = await fetchWarehouseId()

    for (const item of items) {
      const unitPriceIncl = Number(item.price || 0)
      const unitPriceExcl = computePriceHt(unitPriceIncl, item.taxRate || 0)
      const detailXml = buildOrderDetailXml({
        payload: {
          orderId,
          warehouseId,
          productId: item.productId,
          combinationId: item.combinationId || 0,
          productName: item.name,
          productReference: item.reference || '',
          quantity: item.quantity,
          unitPriceIncl: unitPriceIncl.toFixed(2),
          unitPriceExcl: unitPriceExcl.toFixed(2),
          totalPriceIncl: (unitPriceIncl * item.quantity).toFixed(2),
          totalPriceExcl: (unitPriceExcl * item.quantity).toFixed(2),
          shopId: context.shopId,
          shopGroupId: context.shopGroupId,
        },
      })

      try {
        await client.post('/order_details', detailXml)
      } catch (detailError) {
        // Si la création échoue malgré le warehouseId, on log et on continue.
        // L'ordre existe et PS peut avoir créé les détails entre-temps.
        const detail = extractPrestashopError(detailError)
        console.warn(`order_detail création ignorée (${item.name}): ${detail}`)
      }
    }
  }

  // Vérifier si PS a forcé un état différent de celui demandé.
  // PS peut ignorer current_state du payload et assigner son propre état via hooks
  // (ex: état par défaut PS différent de « Paiement effectué »).
  const orderCheck = await getOrderById(orderId)
  const actualState = String(orderCheck?.currentState || '')
  const targetState = String(orderPayload.currentState)

  if (actualState !== targetState || !existingHistories.length) {
    // Forcer l'état « Paiement effectué » même si un historique existe déjà.
    // Un history supplémentaire avec l'état correct est sans conséquence côté PS BO.
    const historyXml = buildOrderHistoryXml({
      payload: {
        orderId,
        stateId: targetState,
      },
    })
    try {
      await client.post('/order_histories', historyXml)
    } catch {
      // Non critique — l'ordre est valide même sans historique forcé
    }
  }

  // Commande en état "Paiement accepté" : aucun mouvement de stock à enregistrer ici.
  // Les mouvements sortie sont créés uniquement lors du passage à "Livré"
  // (dans duplicateOrder ou manuellement en BO).

  return orderId
}

// Retourne les lignes de commande enrichies avec le stock courant et le prix actuel.
// Utilisé par la page de confirmation de duplication.
const getOrderItemWithStock = async (orderId) => {
  const [details, context] = await Promise.all([
    getOrderDetails(orderId),
    getShopContext(),
  ])

  const items = await Promise.all(details.map(async (detail) => {
    let productExists = false
    let stockQty = 0
    let currentPrice = Number(detail.price || 0)
    let taxRate = 0

    try {
      const product = await getFrontProductById(detail.productId)
      if (product) {
        productExists = true
        taxRate = await getTaxRateForGroup(product.taxRulesGroupId)
        let basePrice = Number(product.price || 0)

        if (detail.combinationId && String(detail.combinationId) !== '0') {
          const combo = await getCombinationById(detail.combinationId)
          basePrice += Number(combo?.price || 0)
        }

        currentPrice = computePriceTtc(basePrice, taxRate)

        const stock = await getStockAvailable({
          productId: detail.productId,
          combinationId: detail.combinationId || 0,
          shopId: context.shopId,
        })
        stockQty = stock?.quantity ?? 0
      }
    } catch {
      productExists = false
    }

    return { ...detail, currentPrice, taxRate, productExists, stockQty }
  }))

  return items
}

// Cache des raisons de mouvements stock pour éviter des refetchs répétés.
const stockReasonIdCache = new Map()

const readReasonName = (node) => {
  const langs = asArray(node?.name?.language)
  const nameNode = langs.find((lang) => readText(lang)) || langs[0] || ''
  return readText(nameNode) || readText(node?.name) || ''
}

const normalizeReasonLabel = (value) => {
  return normalizeForMatch(value).replace(/\s+/g, ' ').trim()
}

const getStockOutReasonId = async (options = {}) => {
  const preferredLabel = options?.preferredLabel ? normalizeReasonLabel(options.preferredLabel) : ''
  const cacheKey = preferredLabel || 'sign:-1'

  if (stockReasonIdCache.has(cacheKey)) return stockReasonIdCache.get(cacheKey)

  try {
    const client = getClient()
    const response = await client.get('/stock_movement_reasons?display=full')
    const json = xmlToJson(response.data)
    const root = json.prestashop || {}
    const reasonsRoot = root.stock_movement_reasons || json.stock_movement_reasons || {}
    const nodes = asArray(reasonsRoot.stock_movement_reason)

    if (preferredLabel) {
      const preferredNode = nodes.find((n) => normalizeReasonLabel(readReasonName(n)) === preferredLabel)
      if (preferredNode) {
        const id = readText(preferredNode.id) || readAttr(preferredNode, 'id') || '2'
        stockReasonIdCache.set(cacheKey, id)
        return id
      }
    }

    const outNode = nodes.find((n) => readText(n.sign) === '-1')
    const id = outNode ? (readText(outNode.id) || readAttr(outNode, 'id') || '2') : '2'
    stockReasonIdCache.set(cacheKey, id)
    return id
  } catch {
    stockReasonIdCache.set(cacheKey, '2')
    return '2'
  }
}

const buildStockMovementXml = ({ stockId, reasonId, quantity, orderId }) => {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const orderLine = orderId ? `\n    <id_order>${escapeXml(String(orderId))}</id_order>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <stock_movement>
    <id_stock>${escapeXml(String(stockId))}</id_stock>
    <id_stock_mvt_reason>${escapeXml(String(reasonId))}</id_stock_mvt_reason>
    <id_employee>0</id_employee>
    <employee_firstname></employee_firstname>
    <employee_lastname></employee_lastname>${orderLine}
    <physical_quantity>${escapeXml(String(Math.abs(quantity)))}</physical_quantity>
    <sign>-1</sign>
    <date_add>${escapeXml(now)}</date_add>
    <price_te>0.000000</price_te>
    <last_wa>0.000000</last_wa>
    <current_wa>0.000000</current_wa>
  </stock_movement>
</prestashop>`
}

// Enregistre les mouvements de stock sortie (ps_stock_mvt) pour chaque produit d'une commande.
// BLOQUANT : toute erreur (stock introuvable, WS inaccessible, 4xx/5xx) est propagée.
// PS décrémente le stock_available via ses hooks mais n'écrit pas toujours ps_stock_mvt via le WS.
const recordItemStockMovements = async (items, orderId, shopId, options = {}) => {
  const reasonId = await getStockOutReasonId({ preferredLabel: options.preferredLabel })
  const client = getClient()

  for (const item of items) {
    const stock = await getStockAvailable({
      productId: item.productId,
      combinationId: item.combinationId || 0,
      shopId,
    })

    if (!stock?.id) {
      throw new Error(
        `Mouvement de stock impossible : stock_available introuvable pour le produit ${item.productId}` +
        (item.combinationId && String(item.combinationId) !== '0' ? ` / déclinaison ${item.combinationId}` : '') +
        '. Vérifiez les permissions de la clé WS sur stock_availables et stock_movements.'
      )
    }

    const mvtXml = buildStockMovementXml({
      stockId: stock.id,
      reasonId,
      quantity: item.quantity,
      orderId,
    })

    await client.post('/stock_movements', mvtXml)
  }
}

// Crée une nouvelle commande en dupliquant une commande existante.
// Workflow : placeOrder (paidStateId COD, pas de décrémentation) →
//   order_history deliveredStateId (PS décrémente le stock physique via actionOrderStatusUpdate) →
//   POST /stock_movements pour chaque produit (PS ne crée pas le ps_stock_mvt via WS, on le force).
const duplicateOrder = async ({ orderId, multiplier = 1, customer, addressId }) => {
  const mul = Math.max(1, Math.min(999, Number(multiplier) || 1))

  const [originalOrder, details, context] = await Promise.all([
    getOrderById(orderId),
    getOrderDetails(orderId),
    getShopContext(),
  ])

  if (!originalOrder) throw new Error('Commande introuvable.')
  if (!details.length) throw new Error('Aucun produit dans la commande originale.')

  const items = await Promise.all(details.map(async (detail) => {
    const product = await getFrontProductById(detail.productId)
    if (!product) throw new Error(`Produit "${detail.name}" introuvable.`)

    const taxRate = await getTaxRateForGroup(product.taxRulesGroupId)
    let basePrice = Number(product.price || 0)

    if (detail.combinationId && String(detail.combinationId) !== '0') {
      const combo = await getCombinationById(detail.combinationId)
      basePrice += Number(combo?.price || 0)
    }

    return {
      productId: detail.productId,
      combinationId: detail.combinationId || 0,
      name: detail.name,
      reference: detail.reference || '',
      quantity: detail.quantity * mul,
      price: computePriceTtc(basePrice, taxRate),
      taxRate,
    }
  }))

  const effectiveAddressId = addressId || originalOrder.addressId || 0

  const { id: cartId } = await upsertCart({
    customerId: customer.id,
    addressId: effectiveAddressId,
    items,
  })

  if (!cartId) throw new Error('Impossible de créer le panier.')

  // Crée la commande avec le workflow normal (validation stock incluse).
  // Pas de mouvement de stock ici : la règle métier est que les mouvements sortie
  // sont enregistrés uniquement au passage à "Livré", pas au "Paiement accepté".
  const newOrderId = await placeOrder({
    cartId,
    customer,
    addressId: effectiveAddressId,
    items,
  })

  // Passage bloquant à "Livré" : PS décrémente stock_available.quantity via actionOrderStatusUpdate.
  if (!context.deliveredStateId) {
    throw new Error('État "Livré" introuvable. Configurez VITE_PRESTASHOP_DELIVERED_STATE_ID.')
  }
  const client = getClient()
  await client.post('/order_histories', buildOrderHistoryXml({
    payload: { orderId: newOrderId, stateId: context.deliveredStateId },
  }))

  // Enregistrement bloquant des mouvements de stock sortie (ps_stock_mvt).
  // Doit suivre le passage à "Livré" : c'est à cet instant que le stock est physiquement sorti.
  await recordItemStockMovements(items, newOrderId, context.shopId, {
    preferredLabel: 'Commande client',
  })

  return newOrderId
}

export {
  getCustomerOrders,
  getCustomerOrdersWithCarts,
  getOrderByCartId,
  getOrderById,
  getOrderDetails,
  getOrderHistories,
  getOrderStateMap,
  getOrderItemWithStock,
  duplicateOrder,
  placeOrder,
}
