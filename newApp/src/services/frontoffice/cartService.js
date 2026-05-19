import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'
import { getShopContext } from './contextService'

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

const parseCart = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const cartNode = root.cart || json.cart || {}
  const id = readText(cartNode.id) || readAttr(cartNode, 'id')
  return { id, raw: xmlText }
}

const parseCartRowsFromNode = (cartNode) => {
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
    rows: parseCartRowsFromNode(cart),
  }))
}

const buildCartXml = ({
  cartId,
  customerId,
  addressId,
  rows,
  context,
}) => {
  const cartRows = rows
    .map((row) => {
      return `
        <cart_row>
          <id_product>${escapeXml(row.productId)}</id_product>
          <id_product_attribute>${escapeXml(row.combinationId || 0)}</id_product_attribute>
          <id_address_delivery>${escapeXml(addressId)}</id_address_delivery>
          <quantity>${escapeXml(row.quantity)}</quantity>
        </cart_row>`
    })
    .join('')

  const idBlock = cartId ? `<id>${escapeXml(cartId)}</id>` : ''

  // id_carrier = 0 : transporteur pas encore sélectionné (valeur valide pour PS).
  // Évite le crash PS BO AdminCarts qui tente de calculer les frais de port
  // avec un transporteur sans zones tarifaires configurées.
  return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    ${idBlock}
    <id_customer>${escapeXml(customerId)}</id_customer>
    <id_address_delivery>${escapeXml(addressId)}</id_address_delivery>
    <id_address_invoice>${escapeXml(addressId)}</id_address_invoice>
    <id_currency>${escapeXml(context.currencyId)}</id_currency>
    <id_lang>${escapeXml(context.langId)}</id_lang>
    <id_shop>${escapeXml(context.shopId)}</id_shop>
    <id_shop_group>${escapeXml(context.shopGroupId)}</id_shop_group>
    <id_carrier>0</id_carrier>
    <recyclable>0</recyclable>
    <gift>0</gift>
    <associations>
      <cart_rows>
        ${cartRows}
      </cart_rows>
    </associations>
  </cart>
</prestashop>`
}

const upsertCart = async ({ cartId, customerId, addressId, items }) => {
  const context = await getShopContext()
  const rows = items.map((item) => ({
    productId: item.productId,
    combinationId: item.combinationId || 0,
    quantity: item.quantity,
  }))

  const xml = buildCartXml({
    cartId,
    customerId: customerId || 0,
    addressId: addressId || 0,
    rows,
    context,
  })

  const client = getClient()
  const response = cartId
    ? await client.put(`/carts/${cartId}`, xml)
    : await client.post('/carts', xml)

  return parseCart(response.data)
}

const getCart = async (cartId) => {
  if (!cartId) {
    return null
  }
  const client = getClient()
  const response = await client.get(`/carts/${cartId}`)
  return parseCart(response.data)
}

const emptyCart = async ({ cartId, customerId, addressId }) => {
  if (!cartId) {
    return { emptied: false }
  }

  const context = await getShopContext()
  const xml = buildCartXml({
    cartId,
    customerId: customerId || 0,
    addressId: addressId || 0,
    rows: [],
    context,
  })

  const client = getClient()

  try {
    await client.put(`/carts/${cartId}`, xml)
    return { emptied: true }
  } catch (error) {
    const detail = extractPrestashopError(error)

    try {
      const cart = await getCart(cartId)
      if (!cart?.raw) {
        return { emptied: true, detail }
      }
      const rows = parseCartRows(cart.raw)
      if (!rows.length) {
        return { emptied: true, detail }
      }
    } catch (lookupError) {
      if (lookupError?.response?.status === 404) {
        return { emptied: true, detail }
      }
    }

    return { emptied: false, detail }
  }
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

const getLatestCustomerCart = async (customerId) => {
  if (!customerId) {
    return null
  }

  const client = getClient()
  const query = `display=full&filter[id_customer]=${encodeURIComponent(`[${customerId}]`)}&sort=[id_DESC]&limit=1`

  try {
    const response = await client.get(`/carts?${query}`)
    const carts = parseCarts(response.data)
    return carts[0] || null
  } catch {
    return null
  }
}

// Dernier panier client encore ouvert (sans commande PS associée, avec lignes).
const getLatestOpenCustomerCart = async (customerId) => {
  if (!customerId) {
    return null
  }

  const client = getClient()
  const query = `display=full&filter[id_customer]=${encodeURIComponent(`[${customerId}]`)}&sort=[id_DESC]&limit=10`

  try {
    const response = await client.get(`/carts?${query}`)
    const carts = parseCarts(response.data)

    for (const cart of carts) {
      const id = String(cart?.id || '').trim()
      if (!id || !Array.isArray(cart.rows) || !cart.rows.length) {
        continue
      }

      const verification = await verifyCartId(id)
      if (verification.valid) {
        return cart
      }
    }

    return null
  } catch {
    return null
  }
}

// Vérifie que cartId existe dans PS et n'a pas encore été transformé en commande.
// Retourne { valid: true } ou { valid: false, reason: 'not-found'|'ordered'|'error' }.
const verifyCartId = async (cartId) => {
  if (!cartId) {
    return { valid: false, reason: 'empty' }
  }

  const client = getClient()

  try {
    // 1. Le panier existe-t-il encore ?
    await client.get(`/carts/${cartId}?display=[id]`)
  } catch (err) {
    const status = err?.response?.status
    if (status === 404) {
      return { valid: false, reason: 'not-found' }
    }
    // Erreur réseau ou autre → on ne détruit pas le panier local par précaution
    return { valid: true, uncertain: true }
  }

  try {
    // 2. A-t-il déjà été commandé ?
    const response = await client.get(
      `/orders?filter[id_cart]=${encodeURIComponent(cartId)}&display=[id]&limit=1`
    )
    const json = xmlToJson(response.data)
    const root = json.prestashop || {}
    const ordersNode = root.orders || {}
    const orderNodes = asArray(ordersNode.order)
    const orderId = orderNodes.length
      ? readText(orderNodes[0].id) || readAttr(orderNodes[0], 'id')
      : ''

    if (orderId) {
      return { valid: false, reason: 'ordered', orderId }
    }
  } catch {
    // Si la vérification commande échoue, on garde le panier
  }

  return { valid: true }
}

// Supprime physiquement le panier de PS via DELETE /carts/{id}.
// C'est la méthode préférée lors d'un clearCart : empêche l'accumulation de
// paniers zombies (id_customer=0, rows=[], id_address=0) qui font crasher
// le Back Office PrestaShop (AdminCarts → Cart::getOrderTotal → Address(0) → 500).
//
// Retour :
//   { deleted: true }              → supprimé (ou déjà absent, 404)
//   { deleted: false, unsupported } → DELETE non activé sur la clé WS (405)
//   { deleted: false }             → autre erreur réseau/serveur
const deleteCart = async (cartId) => {
  if (!cartId) return { deleted: false }
  const client = getClient()
  try {
    await client.delete(`/carts/${cartId}`)
    return { deleted: true }
  } catch (err) {
    const status = err?.response?.status
    if (status === 404) return { deleted: true }          // déjà absent
    if (status === 405) return { deleted: false, unsupported: true }
    return { deleted: false }
  }
}

export {
  upsertCart,
  getCart,
  emptyCart,
  deleteCart,
  parseCartRows,
  verifyCartId,
  getLatestCustomerCart,
  getLatestOpenCustomerCart,
}
