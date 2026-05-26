import { getProducts } from '../../api/products'
import { getProductCombinations, getReservedQuantity, getStockAvailable } from '../../api/stock'
import { buildCsv } from '../utils/csvWriter'
import { buildCsvFilename } from '../utils/naming'
import { mapWithConcurrency } from '../utils/async'
import { fetchAllByPage } from '../utils/pagination'
import { toBoolFlag, toNumberText, toText } from '../utils/normalize'

const PRODUCT_COLUMNS = [
  { key: 'product_id', label: 'product_id' },
  { key: 'name', label: 'name' },
  { key: 'reference', label: 'reference' },
  { key: 'price', label: 'price' },
  { key: 'wholesale_price', label: 'wholesale_price' },
  { key: 'category_id', label: 'category_id' },
  { key: 'active', label: 'active' },
  { key: 'stock_quantity', label: 'stock_quantity' },
  { key: 'reserved_quantity', label: 'reserved_quantity' },
]

const COMBINATION_COLUMNS = [
  { key: 'product_id', label: 'product_id' },
  { key: 'product_reference', label: 'product_reference' },
  { key: 'product_name', label: 'product_name' },
  { key: 'combination_id', label: 'combination_id' },
  { key: 'combination_reference', label: 'combination_reference' },
]

const loadAllProducts = async (options = {}) => {
  const pageSize = options.pageSize || 200
  const filters = options.filters || {}
  const sort = options.sort || { field: 'id', direction: 'ASC' }

  return fetchAllByPage(
    ({ page, pageSize: size }) =>
      getProducts({ page, pageSize: size, filters, sort }),
    { pageSize, maxItems: options.maxItems }
  )
}

export async function exportProductsCsv(options = {}) {
  const products = await loadAllProducts(options)
  const includeStock = options.includeStock !== false
  const includeReserved = options.includeReserved === true
  const concurrency = options.concurrency || 4

  const stockByProductId = new Map()

  if (includeStock && products.length) {
    const results = await mapWithConcurrency(
      products,
      concurrency,
      async (product) => {
        const stock = await getStockAvailable(product.id, 0).catch(() => null)
        const reserved = includeReserved
          ? await getReservedQuantity(product.id, 0).catch(() => 0)
          : null
        return { id: String(product.id), stock, reserved }
      },
      options.onProgress
        ? (done, total) => options.onProgress({ phase: 'stock', done, total })
        : null
    )

    results.forEach((entry) => {
      if (!entry?.id) return
      stockByProductId.set(String(entry.id), entry)
    })
  }

  const rows = products.map((product) => {
    const stockEntry = stockByProductId.get(String(product.id))
    const stockQty = includeStock ? stockEntry?.stock?.quantity : ''
    const reservedQty = includeReserved ? stockEntry?.reserved : ''

    return {
      product_id: toText(product.id),
      name: toText(product.name),
      reference: toText(product.reference),
      price: toText(product.price),
      wholesale_price: toText(product.wholesalePrice),
      category_id: toText(product.categoryId),
      active: toBoolFlag(Boolean(product.active)),
      stock_quantity: includeStock ? toNumberText(stockQty) : '',
      reserved_quantity: includeReserved ? toNumberText(reservedQty) : '',
    }
  })

  const csvText = buildCsv({
    rows,
    columns: PRODUCT_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename('products'),
    csvText,
    rowCount: rows.length,
    columns: PRODUCT_COLUMNS,
  }
}

export async function exportCombinationsCsv(options = {}) {
  const products = await loadAllProducts(options)
  const concurrency = options.concurrency || 4
  const includeEmpty = options.includeEmpty === true

  const results = await mapWithConcurrency(
    products,
    concurrency,
    async (product) => {
      const combos = await getProductCombinations(product.id).catch(() => [])
      return { product, combos }
    },
    options.onProgress
      ? (done, total) => options.onProgress({ phase: 'combinations', done, total })
      : null
  )

  const rows = []

  results.forEach((entry) => {
    const product = entry?.product || {}
    const combos = Array.isArray(entry?.combos) ? entry.combos : []

    if (!combos.length && includeEmpty) {
      rows.push({
        product_id: toText(product.id),
        product_reference: toText(product.reference),
        product_name: toText(product.name),
        combination_id: '',
        combination_reference: '',
      })
      return
    }

    combos.forEach((combo) => {
      rows.push({
        product_id: toText(product.id),
        product_reference: toText(product.reference),
        product_name: toText(product.name),
        combination_id: toText(combo.id),
        combination_reference: toText(combo.reference),
      })
    })
  })

  const csvText = buildCsv({
    rows,
    columns: COMBINATION_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename('combinations'),
    csvText,
    rowCount: rows.length,
    columns: COMBINATION_COLUMNS,
  }
}
