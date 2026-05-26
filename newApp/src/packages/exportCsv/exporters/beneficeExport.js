import { loadDailyBenefice, loadTotalBenefice, getTodayDate } from '../../services/benefice'
import { buildCsv } from '../utils/csvWriter'
import { buildCsvFilename } from '../utils/naming'
import { toNumberText, toText } from '../utils/normalize'

const SUMMARY_COLUMNS = [
  { key: 'scope', label: 'scope' },
  { key: 'date', label: 'date' },
  { key: 'order_count', label: 'order_count' },
  { key: 'sales_ht', label: 'sales_ht' },
  { key: 'purchases_ht', label: 'purchases_ht' },
  { key: 'real_purchases_ht', label: 'real_purchases_ht' },
  { key: 'benefice_ht', label: 'benefice_ht' },
  { key: 'real_benefice', label: 'real_benefice' },
]

const LINE_COLUMNS = [
  { key: 'order_id', label: 'order_id' },
  { key: 'order_reference', label: 'order_reference' },
  { key: 'product_id', label: 'product_id' },
  { key: 'product_attribute_id', label: 'product_attribute_id' },
  { key: 'product_name', label: 'product_name' },
  { key: 'quantity', label: 'quantity' },
  { key: 'total_price_ttc', label: 'total_price_ttc' },
  { key: 'total_price_ht', label: 'total_price_ht' },
  { key: 'tax_rate', label: 'tax_rate' },
  { key: 'date_add', label: 'date_add' },
]

const PURCHASE_COLUMNS = [
  { key: 'product_id', label: 'product_id' },
  { key: 'product_attribute_id', label: 'product_attribute_id' },
  { key: 'quantity', label: 'quantity' },
  { key: 'unit_purchase_price', label: 'unit_purchase_price' },
  { key: 'date_add', label: 'date_add' },
]

const resolveMode = (options) => {
  if (options.mode === 'daily') return 'daily'
  if (options.mode === 'total') return 'total'
  return options.date ? 'daily' : 'total'
}

const loadBeneficeData = async (options = {}) => {
  const mode = resolveMode(options)
  if (mode === 'daily') {
    const date = String(options.date || '').trim() || getTodayDate()
    const data = await loadDailyBenefice(date, options)
    return { mode, date, data }
  }
  const data = await loadTotalBenefice(options)
  return { mode, date: '', data }
}

const buildSummaryRow = (mode, date, data) => ({
  scope: mode,
  date: toText(date || data?.date || ''),
  order_count: toNumberText(data?.orderCount),
  sales_ht: toNumberText(data?.salesHt),
  purchases_ht: toNumberText(data?.purchasesHt),
  real_purchases_ht: toNumberText(data?.realPurchasesHt),
  benefice_ht: toNumberText(data?.benefice),
  real_benefice: toNumberText(data?.realBenefice),
})

export async function exportBeneficeSummaryCsv(options = {}) {
  const { mode, date, data } = await loadBeneficeData(options)
  const rows = [buildSummaryRow(mode, date, data)]

  const prefix = mode === 'daily'
    ? `benefice-daily-${date || getTodayDate()}`
    : 'benefice-total'

  const csvText = buildCsv({
    rows,
    columns: SUMMARY_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename(prefix),
    csvText,
    rowCount: rows.length,
    columns: SUMMARY_COLUMNS,
  }
}

export async function exportBeneficeLinesCsv(options = {}) {
  const { mode, date, data } = await loadBeneficeData(options)
  const lines = Array.isArray(data?.lines) ? data.lines : []

  const rows = lines.map((line) => ({
    order_id: toText(line.orderId),
    order_reference: toText(line.orderReference),
    product_id: toText(line.productId),
    product_attribute_id: toText(line.productAttributeId),
    product_name: toText(line.productName),
    quantity: toNumberText(line.quantity),
    total_price_ttc: toNumberText(line.totalPriceTtc),
    total_price_ht: toNumberText(line.totalPriceHt),
    tax_rate: toNumberText(line.taxRate),
    date_add: toText(line.dateAdd),
  }))

  const prefix = mode === 'daily'
    ? `benefice-lines-${date || getTodayDate()}`
    : 'benefice-lines-total'

  const csvText = buildCsv({
    rows,
    columns: LINE_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename(prefix),
    csvText,
    rowCount: rows.length,
    columns: LINE_COLUMNS,
  }
}

export async function exportBeneficePurchaseLinesCsv(options = {}) {
  const { mode, date, data } = await loadBeneficeData(options)
  const purchaseLines = Array.isArray(data?.purchaseLines) ? data.purchaseLines : []

  const rows = purchaseLines.map((line) => ({
    product_id: toText(line.productId),
    product_attribute_id: toText(line.productAttributeId),
    quantity: toNumberText(line.quantity),
    unit_purchase_price: toNumberText(line.unitPurchasePrice),
    date_add: toText(line.dateAdd),
  }))

  const prefix = mode === 'daily'
    ? `benefice-purchases-${date || getTodayDate()}`
    : 'benefice-purchases-total'

  const csvText = buildCsv({
    rows,
    columns: PURCHASE_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename(prefix),
    csvText,
    rowCount: rows.length,
    columns: PURCHASE_COLUMNS,
  }
}
