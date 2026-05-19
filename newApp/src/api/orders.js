import { getXmlClient } from './xmlClient'
import { asArray, buildXML, readAttr, readText, xmlToJson } from '../utils/xml'
import { getCombinationById, getFrontProductById } from '../services/frontoffice/products'
import { computePriceTtc, getTaxRateForGroup } from '../services/frontoffice/taxService'

let orderStatesCache = null

const readLocalizedTexts = (node) => {
  if (!node) {
    return []
  }

  const languages = node.language ? asArray(node.language) : []
  if (languages.length) {
    const texts = languages
      .map((lang) => readText(lang))
      .map((text) => String(text || '').trim())
      .filter(Boolean)

    // Dé-dupliquer tout en gardant l'ordre.
    return Array.from(new Set(texts))
  }

  const text = String(readText(node) || '').trim()
  return text ? [text] : []
}

const normalizeLabel = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const toFiniteNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const loadOrderStates = async (client) => {
  if (orderStatesCache) {
    return orderStatesCache
  }

  const response = await client.get('/order_states?display=[id,name]')
  const json = xmlToJson(response.data)

  let states = json.prestashop?.order_states?.order_state || []
  states = asArray(states)

  orderStatesCache = states
    .map((state) => {
      const id = readText(state.id) || readAttr(state, 'id')
      const labels = readLocalizedTexts(state.name)
      const name = labels[0] || ''
      return { id, name, labels }
    })
    .filter((state) => state.id)

  return orderStatesCache
}

const resolveOrderStateId = async (client, etat) => {
  const desired = normalizeLabel(etat)
  if (!desired) {
    return null
  }

  const states = await loadOrderStates(client)

  const findBy = (predicate) => {
    return states.find((state) => {
      const labels = Array.isArray(state.labels) && state.labels.length
        ? state.labels
        : [state.name]
      return labels.some((label) => predicate(normalizeLabel(label)))
    })
  }

  const includesAll = (text, parts) => {
    return parts.every((part) => part && text.includes(part))
  }

  const isDistancePaymentLabel = (label) =>
    String(label || '').includes('distance') || String(label || '').includes('remote')

  // 1) Meilleur cas: match exact.
  let match = findBy((name) => name === desired)
  if (match) return match.id

  // 2) Match plus large: texte CSV contenu dans le libellé du statut.
  match = findBy((name) => name.includes(desired))
  if (match) return match.id

  // 3) Heuristiques basées sur les libellés du CSV.
  if ((desired.includes('non') && desired.includes('commande')) || desired.includes('non command')) {
    match = findBy((name) =>
      includesAll(name, ['non', 'commande']) ||
      includesAll(name, ['non', 'command']) ||
      name.includes('non commande') ||
      name.includes('non command')
    )
  } else if (desired.includes('panier') || desired.includes('cart')) {
    match = findBy((name) =>
      name.includes('non commande') ||
      name.includes('non command') ||
      name.includes('panier') ||
      name.includes('cart')
    )
  } else if (desired.includes('paiement') && (desired.includes('accepte') || desired.includes('effectue'))) {
    match =
      findBy((name) => includesAll(name, ['paiement', 'accepte']) && !isDistancePaymentLabel(name)) ||
      findBy((name) => includesAll(name, ['paiement', 'effectue']) && !isDistancePaymentLabel(name)) ||
      findBy((name) => includesAll(name, ['payment', 'accepted']) && !isDistancePaymentLabel(name)) ||
      findBy((name) => includesAll(name, ['payment', 'successful']) && !isDistancePaymentLabel(name)) ||
      findBy((name) => includesAll(name, ['payment', 'complete']) && !isDistancePaymentLabel(name))
  } else if ((desired.includes('erreur') || desired.includes('echec')) && desired.includes('paiement')) {
    match = findBy((name) =>
      includesAll(name, ['erreur', 'paiement']) ||
      includesAll(name, ['echec', 'paiement']) ||
      includesAll(name, ['payment', 'error']) ||
      includesAll(name, ['payment', 'failed'])
    )
  } else if (desired.includes('livraison') && desired.includes('paiement')) {
    // Priorité: "en attente" + "paiement" + "livraison" puis "paiement"+"livraison".
    match =
      findBy((name) => includesAll(name, ['attente', 'paiement', 'livraison'])) ||
      findBy((name) => includesAll(name, ['paiement', 'livraison'])) ||
      findBy((name) =>
        name.includes('cash on delivery') ||
        name.includes('contre remboursement') ||
        name.includes('cod')
      )
  } else if (desired.includes('attente') && desired.includes('paiement')) {
    match = findBy((name) => includesAll(name, ['attente', 'paiement']))
  }

  return match ? match.id : null
}

const normalizeOrderStateLabel = (label) => {
  return normalizeLabel(String(label || ''))
}

const isPaidOrderStateLabel = (label) => {
  const normalized = normalizeOrderStateLabel(label)
  if (!normalized) return false

  if (normalized.includes('distance') || normalized.includes('remote')) return false

  const isPaymentFailure = (text) =>
    text.includes('erreur') ||
    text.includes('echec') ||
    text.includes('refus') ||
    text.includes('error') ||
    text.includes('failed') ||
    text.includes('declined')

  if (isPaymentFailure(normalized)) return false

  return (
    (normalized.includes('paiement') && (normalized.includes('accepte') || normalized.includes('effectue'))) ||
    (normalized.includes('payment') && (normalized.includes('accepted') || normalized.includes('successful') || normalized.includes('complete')))
  )
}

const isShippedOrderStateLabel = (label) => {
  const normalized = normalizeOrderStateLabel(label)
  if (!normalized) return false

  if (normalized.includes('distance') || normalized.includes('remote')) return false

  return (
    normalized.includes('livre') || normalized.includes('livree') ||
    normalized.includes('shipped') || normalized.includes('delivered') ||
    normalized.includes('expedie') || normalized.includes('expediee') ||
    normalized.includes('remis') || normalized.includes('handed') ||
    normalized.includes('collected')
  )
}

export async function getPaidOrderStateIds(client) {
  const envStateId = typeof import.meta !== 'undefined' && import.meta.env?.VITE_PRESTASHOP_PAID_STATE_ID
  const envId = envStateId ? String(envStateId).trim() : ''
  if (envId) {
    return [envId]
  }

  const states = await loadOrderStates(client)
  return states
    .filter((state) => {
      const labelsToCheck = Array.isArray(state.labels) && state.labels.length
        ? state.labels
        : [state.name]
      return labelsToCheck.some(isPaidOrderStateLabel)
    })
    .map((state) => state.id)
}

export async function getShippedOrPaidOrderStateIds(client) {
  const states = await loadOrderStates(client)
  return states
    .filter((state) => {
      const labelsToCheck = Array.isArray(state.labels) && state.labels.length
        ? state.labels
        : [state.name]
      return labelsToCheck.some((label) => isPaidOrderStateLabel(label) || isShippedOrderStateLabel(label))
    })
    .map((state) => state.id)
}

export async function getOrderStates() {
  const client = getXmlClient()
  return loadOrderStates(client)
}

export async function resolveOrderStateIdByLabel(label) {
  const client = getXmlClient()
  return resolveOrderStateId(client, label)
}

const pad2 = (value) => String(value).padStart(2, '0')

const formatDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const normalizeDateOnly = (value) => {
  if (!value) {
    return ''
  }

  if (value instanceof Date) {
    return formatDateOnly(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }

    const parsed = new Date(trimmed)
    return formatDateOnly(parsed)
  }

  return ''
}

const buildDateRangeBounds = (dateValue) => {
  const date = normalizeDateOnly(dateValue)
  if (!date) {
    return null
  }

  const parts = date.split('-').map((value) => Number(value))
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    return null
  }

  const [year, month, day] = parts
  const start = new Date(year, month - 1, day, 0, 0, 0)
  const end = new Date(year, month - 1, day, 23, 59, 59)

  return { start, end }
}

const parsePsDateTimeLocal = (value) => {
  const text = String(value || '').trim()
  if (!text) {
    return null
  }

  const match = text.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:\s+([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?$/)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4] || 0)
  const minute = Number(match[5] || 0)
  const second = Number(match[6] || 0)
  const parsed = new Date(year, month - 1, day, hour, minute, second)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatPsDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

// Accepts: YYYY-MM-DD, YYYY-MM-DD HH:MM[:SS], ISO strings, DD/MM/YYYY
const normalizePsDateTime = (value) => {
  if (!value) {
    return ''
  }

  if (value instanceof Date) {
    return formatPsDateTime(value)
  }

  if (typeof value === 'number') {
    return formatPsDateTime(new Date(value))
  }

  if (typeof value !== 'string') {
    return ''
  }

  const input = value.trim()
  if (!input) {
    return ''
  }

  // ISO date time -> normalize to space separator.
  const isoMatch = input.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/)
  if (isoMatch) {
    const parsed = new Date(input)
    return formatPsDateTime(parsed)
  }

  // YYYY-MM-DD [HH:MM[:SS]]
  const ymd = input.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:\s+([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?$/)
  if (ymd) {
    const year = Number(ymd[1])
    const month = Number(ymd[2])
    const day = Number(ymd[3])
    const hour = Number(ymd[4] ?? 0)
    const minute = Number(ymd[5] ?? 0)
    const second = Number(ymd[6] ?? 0)
    const parsed = new Date(year, month - 1, day, hour, minute, second)
    return formatPsDateTime(parsed)
  }

  // DD/MM/YYYY [HH:MM[:SS]] (common CSV format)
  const dmy = input.match(/^([0-9]{2})[\/\-]([0-9]{2})[\/\-]([0-9]{4})(?:\s+([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3])
    const hour = Number(dmy[4] ?? 0)
    const minute = Number(dmy[5] ?? 0)
    const second = Number(dmy[6] ?? 0)
    const parsed = new Date(year, month - 1, day, hour, minute, second)
    return formatPsDateTime(parsed)
  }

  // Last resort: attempt Date parsing.
  const parsed = new Date(input)
  return formatPsDateTime(parsed)
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

// Supprime récursivement les @attributes (xlink:href, etc.) d'un nœud JSON.
// Nécessaire avant un PUT : PrestaShop retourne ces attributs dans les GET
// mais les rejette dans les PUT si le namespace xmlns:xlink n'est pas déclaré.
const stripAttributes = (node) => {
  if (!node || typeof node !== 'object') {
    return node
  }
  if (Array.isArray(node)) {
    return node.map(stripAttributes)
  }
  const result = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '@attributes') {
      continue
    }
    result[key] = stripAttributes(value)
  }
  return result
}

const updateOrderDates = async ({ client, orderId, dateAdd, dateUpd, onLog }) => {
  if (!orderId || !dateAdd) {
    throw new Error('orderId et dateAdd sont requis pour forcer la date de commande.')
  }

  try {
    const response = await client.get(`/orders/${encodeURIComponent(orderId)}?display=full`)
    const json = xmlToJson(response.data)
    const orderNode = json.prestashop?.order || json.order

    if (!orderNode || typeof orderNode !== 'object') {
      throw new Error('Commande introuvable pour mise a jour de date.')
    }

    const cleanNode = stripAttributes(orderNode)
    cleanNode.id = readText(orderNode.id) || String(orderId)
    cleanNode.date_add = dateAdd
    cleanNode.date_upd = dateUpd || dateAdd

    const updateXml = buildXML({ prestashop: { order: cleanNode } })
    await client.put(`/orders/${encodeURIComponent(orderId)}`, updateXml)

    if (typeof onLog === 'function') {
      onLog(`  ✅ Date de commande mise à jour: ${dateAdd}`)
    }
  } catch (error) {
    const detail = extractPrestashopError(error)
    throw new Error(`Impossible de forcer la date de commande ${orderId}: ${detail}`)
  }
}

// Crée les lignes de commande via POST /order_details (sans hook de stock PS).
// À appeler après createOrder quand la commande a été créée sans associations.order_rows,
// afin d'éviter la double décrément automatique de PS.
// id_warehouse = '0' : ASM (gestion avancée des stocks) non utilisé.
export async function createOrderDetails(orderId, items) {
  if (!orderId || !Array.isArray(items) || !items.length) return

  const client = getXmlClient()

  for (const item of items) {
    if (!item?.productId || !item?.quantity) continue

    const unitPriceExcl = Number(item.unitPrice ?? 0)
    const unitPriceIncl = Number(item.unitPriceTTC ?? item.unitPrice ?? 0)
    const qty = Number(item.quantity)

    const detailXml = buildXML({
      prestashop: {
        order_detail: {
          id_order:              String(orderId),
          id_warehouse:          '0',
          product_id:            String(item.productId),
          product_attribute_id:  String(item.productAttributeId ?? item.combinationId ?? 0),
          product_name:          String(item.productName ?? item.name ?? ''),
          product_reference:     String(item.reference ?? ''),
          product_quantity:      String(qty),
          product_price:         unitPriceExcl.toFixed(2),
          unit_price_tax_incl:   unitPriceIncl.toFixed(2),
          unit_price_tax_excl:   unitPriceExcl.toFixed(2),
          total_price_tax_incl:  (unitPriceIncl * qty).toFixed(2),
          total_price_tax_excl:  (unitPriceExcl * qty).toFixed(2),
          id_shop:               '1',
          id_shop_group:         '1',
        },
      },
    })

    try {
      await client.post('/order_details', detailXml)
    } catch (err) {
      console.warn(
        `[createOrderDetails] Ligne ignorée (${item.productName ?? item.productId}): ${err?.message ?? err}`
      )
    }
  }
}

export async function createOrder(orderData) {
  let cartId = orderData?.id_cart

  const onLog = typeof orderData?.onLog === 'function' ? orderData.onLog : null

  try {
    const client = getXmlClient()

    const orderDetails = Array.isArray(orderData?.order_details)
      ? orderData.order_details
      : []

    const cartRows = orderDetails
      .filter((item) => item && item.productId && item.quantity)
      .map((item) => ({
        id_product: item.productId,
        id_product_attribute: item.productAttributeId || 0,
        quantity: item.quantity,
      }))

    if (!cartId) {
      const cartXml = buildXML({
        prestashop: {
          cart: {
            id_customer: orderData.id_customer,
            id_address_delivery: orderData.id_address_delivery,
            id_address_invoice: orderData.id_address_invoice,
            id_currency: 1,
            id_lang: 1,
            id_carrier: 1,
            id_shop: 1,
            ...(cartRows.length
              ? {
                  associations: {
                    cart_rows: {
                      cart_row: cartRows,
                    },
                  },
                }
              : {}),
          },
        },
      })

      const cartResponse = await client.post('/carts', cartXml)
      const cartJson = xmlToJson(cartResponse.data)
      cartId = readText(cartJson.prestashop?.cart?.id)

      if (!cartId) {
        throw new Error('Panier créé mais id_cart introuvable dans la réponse')
      }
    }

    const totalsFromLines = orderDetails.reduce(
      (acc, item) => {
        const qty = toFiniteNumber(item?.quantity) ?? 0
        const unitHT = toFiniteNumber(item?.unitPrice) ?? 0
        const unitTTC = toFiniteNumber(item?.unitPriceTTC)
        acc.totalHT += unitHT * qty
        if (unitTTC != null) {
          acc.totalTTC += unitTTC * qty
        }
        return acc
      },
      { totalHT: 0, totalTTC: 0 }
    )

    const totalPaidInclValue =
      toFiniteNumber(orderData?.total_paid_tax_incl) ??
      toFiniteNumber(orderData?.total_paid) ??
      totalsFromLines.totalTTC ??
      0

    const totalPaidExclValue =
      toFiniteNumber(orderData?.total_paid_tax_excl) ??
      totalsFromLines.totalHT ??
      totalPaidInclValue

    const totalPaid = totalPaidInclValue.toFixed(2)
    const totalHT = totalPaidExclValue.toFixed(2)

    const stateFromInput = orderData?.current_state
    const resolvedState = stateFromInput
      ? String(stateFromInput)
      : orderData?.etat
        ? await resolveOrderStateId(client, orderData.etat)
        : null
    const currentStateId = resolvedState || '1'

    if (onLog && orderData?.etat) {
      onLog(`  → État CSV "${orderData.etat}" → id_order_state: ${currentStateId}`)
    }

    const paymentLabel = orderData?.payment || 'Paiement à la livraison'
    const paymentNormalized = normalizeLabel(paymentLabel)
    const moduleFromInput = orderData?.module
    const moduleName = moduleFromInput
      ? String(moduleFromInput)
      : paymentNormalized.includes('livraison') ||
          paymentNormalized.includes('cash on delivery') ||
          paymentNormalized.includes('contre remboursement') ||
          paymentNormalized.includes('cod')
        ? 'ps_cashondelivery'
        : 'ps_wirepayment'

    const desiredDateAdd = normalizePsDateTime(orderData?.date_add)
    if (!desiredDateAdd) {
      throw new Error(
        `date_add manquante ou invalide pour la commande (reçu: "${orderData?.date_add ?? ''}"). ` +
        `La date doit provenir strictement du CSV.`
      )
    }
    const dateAdd = desiredDateAdd
    const dateUpd = desiredDateAdd

    const orderRows = orderDetails
      .filter((item) => item && item.productId && item.quantity)
      .map((item) => ({
        product_id: item.productId,
        product_attribute_id: item.productAttributeId || 0,
        product_quantity: item.quantity,
        product_name: item.productName || '',
        product_price: Number(item.unitPrice || 0).toFixed(6),
      }))

    const includeOrderRows = !orderData?.skipOrderRows && orderRows.length

    const xmlObject = {
      prestashop: {
        order: {
          id_address_delivery: orderData.id_address_delivery,
          id_address_invoice: orderData.id_address_invoice,
          id_cart: cartId,
          id_currency: 1,
          id_lang: 1,
          id_customer: orderData.id_customer,
          id_carrier: 1,
          id_shop: 1,
          id_shop_group: 1,
          current_state: currentStateId,
          module: moduleName,
          payment: paymentLabel,
          recyclable: 0,
          gift: 0,
          gift_message: '',
          mobile_theme: 0,
          total_discounts: '0.00',
          total_discounts_tax_incl: '0.00',
          total_discounts_tax_excl: '0.00',
          total_paid: totalPaid,
          total_paid_tax_incl: totalPaid,
          total_paid_tax_excl: totalHT,
          total_paid_real: totalPaid,
          total_products: totalHT,
          total_products_wt: totalPaid,
          total_shipping: '0.00',
          total_shipping_tax_incl: '0.00',
          total_shipping_tax_excl: '0.00',
          carrier_tax_rate: '0.00',
          total_wrapping: '0.00',
          total_wrapping_tax_incl: '0.00',
          total_wrapping_tax_excl: '0.00',
          round_mode: 2,
          round_type: 1,
          conversion_rate: 1,
          date_add: dateAdd,
          date_upd: dateUpd,
          ...(includeOrderRows
            ? {
                associations: {
                  order_rows: {
                    order_row: orderRows,
                  },
                },
              }
            : {}),
        },
      },
    }

    const xml = buildXML(xmlObject)
    const response = await client.post('/orders', xml)

    const json = xmlToJson(response.data)
    const orderId = readText(json.prestashop?.order?.id)
    if (!orderId) {
      throw new Error('Commande créée mais ID introuvable dans la réponse')
    }

    // PrestaShop force quasi-systématiquement l'état initial à la création.
    // On applique directement le statut CSV via order_histories sans GET préalable :
    // un order_history "identique" est sans effet de bord, et on économise 1 requête HTTP par commande.
    //
    // skipOrderHistory: true → utilisé lors de l'import CSV.
    // POST /order_histories déclenche le hook actionOrderStatusUpdate de PS qui
    // décrémente le stock automatiquement. Pendant l'import, recordOrderStockOut
    // gère la décrément de façon explicite — on évite donc ce POST pour ne pas
    // avoir une double décrémentation (PS hook + recordOrderStockOut).
    // L'état correct est déjà positionné dans current_state du XML de la commande.
    if (resolvedState && !orderData?.skipOrderHistory) {
      try {
        await updateOrderStatus(orderId, currentStateId)
        if (onLog) {
          onLog(`  ✅ État de commande appliqué: ${currentStateId}`)
        }
      } catch (stateError) {
        const detail = stateError?.message || stateError
        if (onLog) {
          onLog(`  ⚠️ Impossible de forcer l'état de commande: ${detail}`, 'error')
        }
      }
    }

    await updateOrderDates({
      client,
      orderId,
      dateAdd: desiredDateAdd,
      dateUpd: desiredDateAdd,
      onLog,
    })

    return { orderId, cartId }
  } catch (error) {
    const errorData = error?.response?.data

    // Erreur TCPDF/logo connue: l'ordre peut avoir été créé malgré le 500.
    if (
      typeof errorData === 'string' &&
      errorData.includes('imagecreatefrompng') &&
      errorData.includes('logo.png')
    ) {
      console.warn(
        "⚠️ Erreur TCPDF/logo lors de la création - tentative de récupération de l'ID commande"
      )

      try {
        const client = getXmlClient()

        // 1) Le plus fiable: retrouver la commande via le panier.
        if (cartId) {
          const searchByCart = await client.get(
            `/orders?filter[id_cart]=${encodeURIComponent(cartId)}&sort=[id_DESC]&limit=1&display=[id]`
          )
          const searchJson = xmlToJson(searchByCart.data)
          const orders = searchJson.prestashop?.orders?.order

          if (orders && !Array.isArray(orders)) {
            const orderId = readText(orders.id)
            if (orderId) {
              console.log(`✅ Commande trouvée (id_cart=${cartId}): ${orderId}`)
              return { orderId, cartId }
            }
          }

          if (Array.isArray(orders) && orders.length > 0) {
            const orderId = readText(orders[0].id)
            if (orderId) {
              console.log(`✅ Commande trouvée (id_cart=${cartId}): ${orderId}`)
              return { orderId, cartId }
            }
          }
        }

        // 2) Fallback: dernière commande du client.
        if (orderData?.id_customer) {
          const searchByCustomer = await client.get(
            `/orders?filter[id_customer]=${encodeURIComponent(orderData.id_customer)}&sort=[id_DESC]&limit=1&display=[id]`
          )
          const searchJson = xmlToJson(searchByCustomer.data)
          const orders = searchJson.prestashop?.orders?.order

          if (orders && !Array.isArray(orders)) {
            const foundId = readText(orders.id)
            if (foundId) {
              console.log(`✅ Commande trouvée malgré l'erreur: ${foundId}`)
              return { orderId: foundId, cartId }
            }
          }

          if (Array.isArray(orders) && orders.length > 0) {
            const foundId = readText(orders[0].id)
            if (foundId) {
              console.log(`✅ Commande trouvée malgré l'erreur: ${foundId}`)
              return { orderId: foundId, cartId }
            }
          }
        }
      } catch (recoveryError) {
        console.error(
          "Impossible de récupérer l'ID commande:",
          recoveryError?.message || recoveryError
        )
      }
    }

    console.error('❌ Erreur création commande:', errorData || error.message)
    throw error
  }
}

const parseCarts = (xmlText) => {
  const json = xmlToJson(xmlText)
  let carts = json.prestashop?.carts?.cart || []
  carts = asArray(carts)

  return carts.map(cart => ({
    id: readText(cart.id) || readAttr(cart, 'id'),
    customerId: readText(cart.id_customer),
    dateAdd: readText(cart.date_add),
  }))
}

const parseCartRows = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const cartNode = root.cart || json.cart || {}
  const associations = cartNode.associations || {}
  const cartRows = associations.cart_rows || {}
  const rows = asArray(cartRows.cart_row)

  return rows.map((row) => ({
    productId: readText(row.id_product),
    combinationId: readText(row.id_product_attribute),
    quantity: Number(readText(row.quantity) || 0),
  }))
}

const fetchCartRows = async (client, cartId) => {
  if (!cartId) return []
  try {
    const response = await client.get(`/carts/${encodeURIComponent(cartId)}?display=full`)
    return parseCartRows(response.data)
  } catch {
    return []
  }
}

const buildCartTotals = async (carts) => {
  if (!carts.length) return new Map()

  const productCache = new Map()
  const comboCache = new Map()

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

  const client = getXmlClient()
  const totals = new Map()

  await Promise.all(
    carts.map(async (cart) => {
      const rows = await fetchCartRows(client, cart.id)
      const rowTotals = await Promise.all(
        rows.map(async (row) => {
          if (!row.productId || !row.quantity) return 0
          const product = await getProduct(row.productId)
          if (!product) return 0

          const taxRate = await getTaxRateForGroup(product.taxRulesGroupId)
          const combo = await getCombination(row.combinationId)
          const basePrice = Number(product.price || 0)
          const impact = Number(combo?.price || 0)
          const priceTtc = computePriceTtc(basePrice + impact, taxRate)
          return priceTtc * row.quantity
        })
      )

      const total = rowTotals.reduce((sum, value) => sum + value, 0)
      totals.set(cart.id, Number(total.toFixed(2)))
    })
  )

  return totals
}

export async function getOrders(limit = 50) {
  const options = typeof limit === 'number' ? { limit } : { ...(limit || {}) }
  const client = getXmlClient()

  const display = 'id,reference,id_customer,total_paid_tax_incl,current_state,date_add,id_cart'
  const queryParts = [`display=[${display}]`]

  if (options?.sort) {
    // date_add n'est pas un champ triable dans l'API PrestaShop (erreur 38).
    // On le traduit en tri par ID décroissant qui approxime l'ordre chronologique.
    const sortValue = options.sort === 'date_add_DESC' ? 'id_DESC'
                    : options.sort === 'date_add_ASC'  ? 'id_ASC'
                    : options.sort
    queryParts.push(`sort=[${sortValue}]`)
  }

  if (options?.offset != null) {
    queryParts.push(`limit=${options.offset},${options.limit ?? 50}`)
  } else if (options?.limit != null) {
    queryParts.push(`limit=${options.limit}`)
  }

  const response = await client.get(`/orders?${queryParts.join('&')}`)
  const json = xmlToJson(response.data)

  let orders = json.prestashop?.orders?.order || []
  if (!Array.isArray(orders)) orders = [orders]

  return orders.map(order => ({
    id: readText(order.id),
    reference: readText(order.reference),
    customerId: readText(order.id_customer),
    total: readText(order.total_paid_tax_incl),
    statusId: readText(order.current_state),
    dateAdd: readText(order.date_add),
    cartId: readText(order.id_cart),
  }))
}

export async function getCarts(limit = 50) {
  const options = typeof limit === 'number' ? { limit } : { ...(limit || {}) }
  const client = getXmlClient()

  const display = 'id,id_customer,date_add'
  const queryParts = [`display=[${display}]`]

  if (options?.sort) {
    const sortValue = options.sort === 'date_add_DESC' ? 'id_DESC'
                    : options.sort === 'date_add_ASC'  ? 'id_ASC'
                    : options.sort
    queryParts.push(`sort=[${sortValue}]`)
  } else {
    queryParts.push('sort=[id_DESC]')
  }

  if (options?.offset != null) {
    queryParts.push(`limit=${options.offset},${options.limit ?? 50}`)
  } else if (options?.limit != null) {
    queryParts.push(`limit=${options.limit}`)
  }

  const response = await client.get(`/carts?${queryParts.join('&')}`)
  return parseCarts(response.data)
}

const hasOrderForCart = async (client, cartId) => {
  const id = String(cartId || '').trim()
  if (!id) return false

  try {
    const response = await client.get(
      `/orders?filter[id_cart]=${encodeURIComponent(id)}&display=[id]&limit=1`
    )
    const json = xmlToJson(response.data)
    const node = json.prestashop?.orders?.order

    if (!node) return false

    if (Array.isArray(node)) {
      const first = node[0]
      const found = readText(first?.id) || readAttr(first, 'id')
      return Boolean(found)
    }

    const found = readText(node?.id) || readAttr(node, 'id')
    return Boolean(found)
  } catch {
    return false
  }
}

export async function getOrdersWithOpenCarts(limit = 50) {
  const options = typeof limit === 'number' ? { limit } : { ...(limit || {}) }
  const [orders, carts] = await Promise.all([
    getOrders(options),
    getCarts(options),
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

  const client = getXmlClient()
  const verified = await Promise.all(
    openCarts.map(async (cart) => (await hasOrderForCart(client, cart.id) ? null : cart))
  )
  const filteredCarts = verified.filter(Boolean)

  const cartTotals = await buildCartTotals(filteredCarts)

  const cartRows = filteredCarts.map((cart) => ({
    id: `cart-${cart.id}`,
    displayId: cart.id,
    reference: 'Panier',
    customerId: cart.customerId,
    total: cartTotals.get(cart.id) || 0,
    statusId: 'cart',
    dateAdd: cart.dateAdd,
    cartId: cart.id,
    isCart: true,
  }))

  return [...orders, ...cartRows]
}

export async function getOrdersByDateRangePage(dateValue, options = {}, filterStateIds = null) {
  const bounds = buildDateRangeBounds(dateValue)
  if (!bounds) {
    return { items: [], shouldStop: true }
  }

  const limit = options?.limit ?? 50
  const orders = await getOrders({
    ...options,
    limit,
    sort: options.sort || 'id_DESC',
  })

  const items = orders.filter((order) => {
    const date = parsePsDateTimeLocal(order?.dateAdd)
    if (!date) {
      return false
    }

    if (filterStateIds && Array.isArray(filterStateIds) && filterStateIds.length > 0) {
      if (!filterStateIds.includes(String(order.statusId || '').trim())) {
        return false
      }
    }

    return date >= bounds.start && date <= bounds.end
  })

  let shouldStop = false
  if (!orders.length || orders.length < limit) {
    shouldStop = true
  } else {
    const oldest = orders
      .map((order) => parsePsDateTimeLocal(order?.dateAdd))
      .filter(Boolean)
      .reduce((min, date) => (min && min < date ? min : date), null)

    if (oldest && oldest < bounds.start) {
      shouldStop = true
    }
  }

  return { items, shouldStop }
}

const parseOrderRows = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const orderNode = root.order || json.order || {}
  const reference = readText(orderNode.reference)
  const associations = orderNode.associations || {}
  const rowsRoot = associations.order_rows || {}
  const rows = asArray(rowsRoot.order_row)

  return rows.map((row) => ({
    orderReference: reference,
    productId: readText(row.product_id),
    productAttributeId: readText(row.product_attribute_id),
    productName: readText(row.product_name),
    productPrice: readText(row.product_price),
    unitPriceTtc: readText(row.unit_price_tax_incl),
    unitPriceHt: readText(row.unit_price_tax_excl),
    totalPriceTtc: readText(row.total_price_tax_incl),
    totalPriceHt: readText(row.total_price_tax_excl),
    quantity: Number(readText(row.product_quantity) || 0),
  }))
}

export async function getOrderRows(orderId) {
  const id = String(orderId || '').trim()
  if (!id) {
    return []
  }

  const client = getXmlClient()
  const response = await client.get(`/orders/${encodeURIComponent(id)}?display=full`)
  return parseOrderRows(response.data)
}

/**
 * Vérifie via requête directe sur /order_details si une commande a déjà des lignes.
 * Plus fiable que getOrderRows (qui lit associations.order_rows depuis le GET /orders,
 * parfois vide à cause d'une inconsistance WS PS même si les lignes existent en base).
 *
 * @param {string|number} orderId
 * @returns {Promise<boolean>} true si au moins une order_detail existe pour cet orderId
 */
export async function hasOrderDetails(orderId) {
  const id = String(orderId || '').trim()
  if (!id) return false
  try {
    const client = getXmlClient()
    const response = await client.get(
      `/order_details?display=[id]&filter[id_order]=${encodeURIComponent(id)}&limit=1`
    )
    const json = xmlToJson(response.data)
    const root = json?.prestashop || {}
    const detailsRoot = root.order_details || json.order_details || {}
    const nodes = asArray(detailsRoot.order_detail)
    return nodes.length > 0
  } catch {
    return false
  }
}

export async function getOrdersByDateRange(dateValue, options = {}) {
  const dateRange = buildDateRange(dateValue)
  if (!dateRange) {
    return []
  }

  return getOrders({
    ...options,
    dateRange,
    sort: options.sort || 'date_add_DESC',
  })
}

export async function updateOrderStatus(orderId, stateId) {
  const client = getXmlClient()
  const xmlObject = {
    prestashop: {
      order_history: {
        id_order: orderId,
        id_order_state: stateId
      }
    }
  }

  const xml = buildXML(xmlObject)
  await client.post('/order_histories', xml)
}

/**
 * Corrige la date_add d'une OrderHistory si elle ne correspond pas à la date attendue.
 * 
 * PrestaShop/Module bug : l'UPDATE de ps_order_history.date_add n'est pas appliqué
 * via /order_state_update. Cette fonction lit la dernière OrderHistory et la corrige
 * si sa date_add ≠ dateExpected.
 * 
 * Non-bloquant : si la correction échoue, log seulement, ne plante pas l'import.
 */
export async function fixOrderHistoryDate(orderId, expectedDate, onLog) {
  if (!orderId || !expectedDate) return false

  try {
    const client = getXmlClient()

    // Récupère les historiques de la commande (tri par ID DESC = plus récent d'abord)
    const response = await client.get(
      `/order_histories?display=[id,id_order,id_order_state,date_add]&filter[id_order]=${encodeURIComponent(orderId)}&sort=[id_DESC]&limit=1`
    )
    const json = xmlToJson(response.data)
    const histories = asArray(json?.prestashop?.order_histories?.order_history)

    if (!histories.length) {
      if (typeof onLog === 'function') {
        onLog(`  ℹ️ Aucun historique trouvé pour corriger la date`)
      }
      return false
    }

    const lastHistory = histories[0]
    const historyId = readText(lastHistory?.id) || readAttr(lastHistory, 'id')
    const currentDate = readText(lastHistory?.date_add)

    if (!historyId) {
      if (typeof onLog === 'function') {
        onLog(`  ℹ️ ID historique introuvable, correction ignorée`)
      }
      return false
    }

    // Normalisation pour comparaison (supprimer espaces, comparer le début)
    const currentNorm = String(currentDate || '').trim().slice(0, 19)
    const expectedNorm = String(expectedDate || '').trim().slice(0, 19)

    if (currentNorm === expectedNorm) {
      if (typeof onLog === 'function') {
        onLog(`  ✅ Date historique correcte: ${currentDate}`)
      }
      return true
    }

    // Correction nécessaire : UPDATE via PUT /order_histories/{id}
    const historyNode = stripAttributes(lastHistory)
    historyNode.id = historyId
    historyNode.date_add = expectedDate

    const updateXml = buildXML({ prestashop: { order_history: historyNode } })
    await client.put(`/order_histories/${encodeURIComponent(historyId)}`, updateXml)

    if (typeof onLog === 'function') {
      onLog(`  ✅ Date historique corrigée: ${currentDate} → ${expectedDate}`)
    }
    return true
  } catch (error) {
    if (typeof onLog === 'function') {
      onLog(`  ⚠️ Correction date historique échouée: ${error?.message || error} (non-bloquant)`)
    }
    return false
  }
}

export async function updateOrderStateWithStockMovement({ orderId, stateId, dateAdd }) {
  const client = getXmlClient()
  const payload = {
    prestashop: {
      order_state_update: {
        id_order: orderId,
        id_order_state: stateId,
        ...(dateAdd ? { date_add: dateAdd } : {}),
      },
    },
  }

  const xml = buildXML(payload)
  const response = await client.post('/order_state_update', xml)
  const json = xmlToJson(response.data)
  const node = json?.prestashop?.order_state_update

  return {
    id_order: readText(node?.id_order) || readText(node?.id) || String(orderId),
    id_order_state: readText(node?.id_order_state) || String(stateId),
    date_add: readText(node?.date_add) || dateAdd || '',
  }
}

export async function updateOrderStatusViaModule(orderId, stateId, options = {}) {
  if (!orderId || !stateId) {
    throw new Error('orderId et stateId sont requis pour updateOrderStatusViaModule.')
  }

  const client = getXmlClient()
  const payload = {
    prestashop: {
      order_state_update: {
        id_order: orderId,
        id_order_state: stateId,
        ...(options.dateAdd ? { date_add: options.dateAdd } : {}),
      }
    }
  }

  const xml = buildXML(payload)
  try {
    await client.post('/order_state_update', xml)
  } catch (error) {
    const detail = extractPrestashopError(error)
    throw new Error(detail)
  }
}

// Met à jour current_state d'une commande via PUT direct (sans order_history).
// Utilisé lors de l'import CSV pour appliquer l'état "livré" après création,
// en évitant le hook actionOrderStatusUpdate qui décrémenterait le stock une seconde fois.
export async function patchOrderState(orderId, stateId) {
  if (!orderId || !stateId) {
    throw new Error('orderId et stateId sont requis pour patchOrderState.')
  }
  const client = getXmlClient()

  const response = await client.get(`/orders/${encodeURIComponent(orderId)}?display=full`)
  const json = xmlToJson(response.data)
  const orderNode = json.prestashop?.order || json.order

  if (!orderNode || typeof orderNode !== 'object') {
    throw new Error(`Commande ${orderId} introuvable pour mise à jour de l'état.`)
  }

  const cleanNode = stripAttributes(orderNode)
  cleanNode.id = readText(orderNode.id) || String(orderId)
  cleanNode.current_state = String(stateId)
  delete cleanNode.associations

  const updateXml = buildXML({ prestashop: { order: cleanNode } })
  await client.put(`/orders/${encodeURIComponent(orderId)}`, updateXml)
}