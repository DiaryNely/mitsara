// api/stockModule.js
// WS-native facade kept for backwards compatibility after stockapi removal.

import {
  getStockMovements,
  updateStockWithMovement,
  recordOrderStockOut as recordWsOrderStockOut,
  clearStockMovements,
} from './stockMovements'

export async function getStockMovementsFromModule(params = {}) {
  return getStockMovements(params)
}

export async function recordOrderStockOut(orderId, items, options = {}) {
  return recordWsOrderStockOut(orderId, items, options)
}

export async function clearAllStockMovements(opts = {}) {
  return clearStockMovements(opts)
}

export async function updateStockViaModule(idProduct, idProductAttribute, delta, employee = {}) {
  return updateStockWithMovement(idProduct, idProductAttribute, delta, employee)
}
