import { getStockMovements } from '../../api/stockMovements'
import { buildCsv } from '../utils/csvWriter'
import { buildCsvFilename } from '../utils/naming'
import { toNumberText, toText } from '../utils/normalize'

const STOCK_COLUMNS = [
  { key: 'movement_id', label: 'movement_id' },
  { key: 'date_add', label: 'date_add' },
  { key: 'product_id', label: 'product_id' },
  { key: 'product_attribute_id', label: 'product_attribute_id' },
  { key: 'product_name', label: 'product_name' },
  { key: 'product_reference', label: 'product_reference' },
  { key: 'quantity_delta', label: 'quantity_delta' },
  { key: 'physical_quantity', label: 'physical_quantity' },
  { key: 'sign', label: 'sign' },
  { key: 'reason', label: 'reason' },
  { key: 'reason_id', label: 'reason_id' },
  { key: 'employee_firstname', label: 'employee_firstname' },
  { key: 'employee_lastname', label: 'employee_lastname' },
  { key: 'order_id', label: 'order_id' },
  { key: 'stock_id', label: 'stock_id' },
]

export async function exportStockMovementsCsv(options = {}) {
  const productId = options.productId || options.id_product
  if (!productId) {
    throw new Error('productId is required for stock movement export')
  }

  const result = await getStockMovements({
    id_product: productId,
    ...(options.attributeId ? { id_product_attribute: options.attributeId } : {}),
    ...(options.dateFrom ? { date_from: options.dateFrom } : {}),
    ...(options.dateTo ? { date_to: options.dateTo } : {}),
    ...(options.limit ? { limit: options.limit } : {}),
  })

  const movements = Array.isArray(result?.movements) ? result.movements : []

  const rows = movements.map((movement) => ({
    movement_id: toText(movement.id),
    date_add: toText(movement.date_add),
    product_id: toText(movement.id_product),
    product_attribute_id: toText(movement.id_product_attribute),
    product_name: toText(movement.product_name),
    product_reference: toText(movement.reference),
    quantity_delta: toNumberText(movement.quantity_delta),
    physical_quantity: toNumberText(movement.physical_quantity),
    sign: toNumberText(movement.sign),
    reason: toText(movement.reason),
    reason_id: toText(movement.id_stock_mvt_reason),
    employee_firstname: toText(movement.employee_firstname),
    employee_lastname: toText(movement.employee_lastname),
    order_id: toText(movement.id_order),
    stock_id: toText(movement.id_stock),
  }))

  const csvText = buildCsv({
    rows,
    columns: STOCK_COLUMNS,
    delimiter: options.delimiter || ',',
    newline: options.newline || '\r\n',
    includeBom: options.includeBom || false,
  })

  return {
    filename: options.filename || buildCsvFilename('stock-movements'),
    csvText,
    rowCount: rows.length,
    columns: STOCK_COLUMNS,
  }
}
