import { getCarts, getOrders, getOrderRows, getOrderStates } from '../../api/orders'
import { getXmlClient } from '../../api/xmlClient'
import { asArray, readText, xmlToJson } from '../../utils/xml'
import { buildCsv } from '../utils/csvWriter'
import { buildCsvFilename } from '../utils/naming'
import { mapWithConcurrency } from '../utils/async'
import { fetchAllByOffset } from '../utils/pagination'
import { toText } from '../utils/normalize'

const ORDER_COLUMNS = [
  { key: 'order_id', label: 'order_id' },
  { key: 'order_reference', label: 'order_reference' },
  { key: 'order_date_add', label: 'order_date_add' },
  { key: 'order_status_id', label: 'order_status_id' },
  { key: 'order_status_label', label: 'order_status_label' },
  { key: 'order_total_paid_ttc', label: 'order_total_paid_ttc' },
  { key: 'customer_id', label: 'customer_id' },
  { key: 'cart_id', label: 'cart_id' },
  { key: 'is_cart', label: 'is_cart' },
  { key: 'row_product_id', label: 'row_product_id' },
  { key: 'row_product_attribute_id', label: 'row_product_attribute_id' },
  { key: 'row_product_name', label: 'row_product_name' },
  { key: 'row_product_price', label: 'row_product_price' },
  { key: 'row_unit_price_ttc', label: 'row_unit_price_ttc' },
  { key: 'row_unit_price_ht', label: 'row_unit_price_ht' },
  { key: 'row_total_price_ttc', label: 'row_total_price_ttc' },
  { key: 'row_total_price_ht', label: 'row_total_price_ht' },
  { key: 'row_quantity', label: 'row_quantity' },
]

const parseCartRows = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const cartNode = root.cart || json.cart || {}
  const associations = cartNode.associations || {}
  const cartRows = associations.cart_rows || {}
  const rows = asArray(cartRows.cart_row)

  return rows.map((row) => ({
    productId: readText(row.id_product),
    productAttributeId: readText(row.id_product_attribute),
    quantity: Number(readText(row.quantity) || 0),
  }))
}

const fetchCartRows = async (cartId) => {
  const id = String(cartId || '').trim()
  if (!id) return []

  try {
    const client = getXmlClient()
    const response = await client.get(`/carts/${encodeURIComponent(id)}?display=full`)
    return parseCartRows(response.data)
  } catch {
    return []
  }
}

const buildStatusLabelMap = async () => {
  const states = await getOrderStates().catch(() => [])
  const map = new Map()
  states.forEach((state) => {
    if (!state?.id) return
    map.set(String(state.id), state.name || state.labels?.[0] || '')
  })
  map.set('cart', 'Cart')
  return map
}

const buildOrderBase = (order, statusMap) => ({
  order_id: toText(order.id),
  order_reference: toText(order.reference),
  order_date_add: toText(order.dateAdd),
  order_status_id: toText(order.statusId),
  order_status_label: toText(statusMap?.get(String(order.statusId)) || ''),
  order_total_paid_ttc: toText(order.total),
  customer_id: toText(order.customerId),
  cart_id: toText(order.cartId),
  is_cart: '0',
})

const buildCartBase = (cart, statusMap) => ({
  order_id: '',
  order_reference: '',
  order_date_add: toText(cart.dateAdd),
  order_status_id: 'cart',
  order_status_label: toText(statusMap?.get('cart') || 'Cart'),
  order_total_paid_ttc: '',
  customer_id: toText(cart.customerId),
  cart_id: toText(cart.id),
  is_cart: '1',
})

const mergeRowFields = (row) => ({
  row_product_id: toText(row?.productId),
  row_product_attribute_id: toText(row?.productAttributeId),
  row_product_name: toText(row?.productName),
  row_product_price: toText(row?.productPrice),
  row_unit_price_ttc: toText(row?.unitPriceTtc),
  row_unit_price_ht: toText(row?.unitPriceHt),
  row_total_price_ttc: toText(row?.totalPriceTtc),
  row_total_price_ht: toText(row?.totalPriceHt),
  row_quantity: toText(row?.quantity),
})

export async function exportOrdersCsv(options = {}) {
  const pageSize = options.pageSize || 200
  const includeRows = options.includeRows !== false
  const includeEmptyRows = options.includeEmptyRows !== false
  const concurrency = options.concurrency || 4

  const orders = await fetchAllByOffset(
    ({ limit, offset }) => getOrders({ limit, offset }),
    { pageSize, maxItems: options.maxItems }
  )

  const statusMap = options.includeStatusLabel === false
    ? new Map()
    : await buildStatusLabelMap()

  const rowsByOrderId = new Map()

  if (includeRows && orders.length) {
    const results = await mapWithConcurrency(
      orders,
      concurrency,
      async (order) => {
        const rows = await getOrderRows(order.id).catch(() => [])
        return { id: String(order.id), rows }
      },
      options.onProgress
        ? (done, total) => options.onProgress({ phase: 'order_rows', done, total })
        : null
    )

    results.forEach((entry) => {
      if (!entry?.id) return
      rowsByOrderId.set(String(entry.id), entry.rows || [])
    })
  }

  const rows = []

  orders.forEach((order) => {
    const base = buildOrderBase(order, statusMap)
    const detailRows = includeRows ? rowsByOrderId.get(String(order.id)) || [] : []

    if (!detailRows.length && includeEmptyRows) {
      rows.push({ ...base, ...mergeRowFields(null) })
      return
    }

    detailRows.forEach((row) => {
      rows.push({ ...base, ...mergeRowFields(row) })
    })
  })

  const csvText = buildCsv({
    rows,
    columns: ORDER_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename('orders'),
    csvText,
    rowCount: rows.length,
    columns: ORDER_COLUMNS,
  }
}

export async function exportCartsCsv(options = {}) {
  const pageSize = options.pageSize || 200
  const includeRows = options.includeRows !== false
  const includeEmptyRows = options.includeEmptyRows !== false
  const concurrency = options.concurrency || 4

  const carts = await fetchAllByOffset(
    ({ limit, offset }) => getCarts({ limit, offset }),
    { pageSize, maxItems: options.maxItems }
  )

  const statusMap = await buildStatusLabelMap()

  const rowsByCartId = new Map()

  if (includeRows && carts.length) {
    const results = await mapWithConcurrency(
      carts,
      concurrency,
      async (cart) => {
        const rows = await fetchCartRows(cart.id)
        return { id: String(cart.id), rows }
      },
      options.onProgress
        ? (done, total) => options.onProgress({ phase: 'cart_rows', done, total })
        : null
    )

    results.forEach((entry) => {
      if (!entry?.id) return
      rowsByCartId.set(String(entry.id), entry.rows || [])
    })
  }

  const rows = []

  carts.forEach((cart) => {
    const base = buildCartBase(cart, statusMap)
    const detailRows = includeRows ? rowsByCartId.get(String(cart.id)) || [] : []

    if (!detailRows.length && includeEmptyRows) {
      rows.push({ ...base, ...mergeRowFields(null) })
      return
    }

    detailRows.forEach((row) => {
      rows.push({
        ...base,
        ...mergeRowFields(row),
      })
    })
  })

  const csvText = buildCsv({
    rows,
    columns: ORDER_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename('carts'),
    csvText,
    rowCount: rows.length,
    columns: ORDER_COLUMNS,
  }
}

export async function exportPaniersCsv(options = {}) {
  return exportCartsCsv(options)
}
