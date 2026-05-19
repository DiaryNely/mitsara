// services/benefice/index.js
import {
  loadDailyBenefice,
  loadTotalBenefice,
  getTodayDate,
  registerStrategy,
  listStrategies,
} from './beneficeService'

import { runStrategy } from './beneficeCalculator'

const applyStrategy = (strategy, lines, options) => runStrategy(strategy, lines, options)

export {
  loadDailyBenefice,
  loadTotalBenefice,
  applyStrategy,
  getTodayDate,
  registerStrategy,
  listStrategies,
}

export {
  computeTotalBenefice,
  computeTotalSalesHt,
  computeTotalPurchasesHt,
  computeTotalCostOfGoodsSold,
  computeRealBenefice,
  computeLineBenefice,
  computeDailyBenefice,
  groupBeneficeByDay,
  groupBeneficeByCategory,
  detailBeneficeByCategory,
  runStrategy,
} from './beneficeCalculator'
