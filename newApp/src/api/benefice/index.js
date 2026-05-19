// api/benefice/index.js
// Barrel exports — point d'entrée unique pour les imports.
export {
  getWholesalePrice,
  clearWholesalePriceCache,
  fetchAllOrdersForBenefice,
  fetchOrdersByDateForBenefice,
  fetchOrderLinesWithWholesale,
  fetchOrderLinesBatch,
} from './beneficeApi'
