// services/benefice/beneficeCalculator.js
//
// Logique pure de calcul de bénéfice — testable sans I/O.
// Architecture extensible : système de stratégies enregistrables (`registerStrategy`).
//
// Règle de précision : aucun arrondi intermédiaire.
// Chaque fonction interne accumule en virgule flottante pleine précision.
// Le round2 est appliqué UNE SEULE FOIS, sur le résultat final de chaque
// fonction publique. Cela garantit que la valeur affichée correspond à
// round2(Σ valeurs_brutes) et non à Σ round2(valeur_brute).

/**
 * @typedef {Object} SaleLine
 * @property {string} orderId
 * @property {string} [orderReference]
 * @property {string|number} productId
 * @property {string|number} [productAttributeId]
 * @property {string} [productName]
 * @property {number} quantity
 * @property {number} totalPriceTtc
 * @property {number} totalPriceHt
 * @property {number} taxRate
 * @property {string} [dateAdd]
 */

/**
 * @typedef {Object} PurchaseLine
 * @property {string|number} productId
 * @property {string|number} [productAttributeId]
 * @property {number} quantity
 * @property {number} unitPurchasePrice
 * @property {string} [dateAdd]
 */

// ─── Helpers internes ──────────────────────────────────────────────────────────

const toDateKey = (dateString) => {
  const text = String(dateString || '').trim()
  if (!text) return ''
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  const dmy = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return ''
}

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

// Arrondi à 2 décimales — à appeler UNIQUEMENT sur le résultat final.
const round2 = (value) => Number(toNumber(value).toFixed(2))

// ─── Primitives brutes (sans arrondi) ─────────────────────────────────────────
// Ces fonctions retournent des valeurs en pleine précision flottante.
// Elles ne doivent PAS être utilisées directement pour l'affichage.

/**
 * HT brut d'une ligne de vente — aucun arrondi.
 * PS stocke total_price_tax_excl (HT) comme valeur source ; le TTC en est dérivé.
 * On lit directement le HT pour éviter la reconversion TTC→HT qui diverge.
 *
 * ⚠️ CORRECTION PRÉCISION: Pas de fallback par division (cause perte 0.01).
 * Le HT DOIT toujours venir de Prestashop (total_price_tax_excl).
 * Si HT absent: log warning et retourner 0 (data incomplete).
 */
const rawLineSalesHt = (line) => {
  if (!line) return 0
  const ht = toNumber(line.totalPriceHt)
  // Si HT manquant du XML, c'est une anomalie — ne pas inventer via division
  if (ht === 0 && line.totalPriceTtc) {
    console.warn('⚠️ Benefice: Line sans totalPriceHt, TTC présent:', {
      productId: line.productId,
      totalPriceTtc: line.totalPriceTtc,
      taxRate: line.taxRate,
    })
  }
  return ht
}

/**
 * Coût d'achat brut d'une ligne de mouvement de stock — aucun arrondi.
 */
const rawLinePurchaseHt = (line) => {
  if (!line) return 0
  return toNumber(line.quantity) * toNumber(line.unitPurchasePrice)
}

/**
 * Somme brute des ventes HT — aucun arrondi.
 */
const rawSalesTotal = (lines) =>
  Array.isArray(lines)
    ? lines.reduce((sum, line) => sum + rawLineSalesHt(line), 0)
    : 0

/**
 * Somme brute des achats HT (mouvements de stock) — aucun arrondi.
 */
const rawPurchasesTotal = (purchaseLines) =>
  Array.isArray(purchaseLines)
    ? purchaseLines.reduce((sum, line) => sum + rawLinePurchaseHt(line), 0)
    : 0

const resolveWholesalePrice = (wholesaleByProductId, productId) => {
  const key = String(productId || '').trim()
  if (!key) return 0
  if (wholesaleByProductId instanceof Map) return toNumber(wholesaleByProductId.get(key))
  if (wholesaleByProductId && typeof wholesaleByProductId === 'object') return toNumber(wholesaleByProductId[key])
  return 0
}

/**
 * Coût d'achat brut des produits vendus (COGS) — aucun arrondi.
 */
const rawCostOfGoodsSold = (lines, wholesaleByProductId) =>
  Array.isArray(lines)
    ? lines.reduce((sum, line) => {
        const qty  = toNumber(line?.quantity)
        const unit = resolveWholesalePrice(wholesaleByProductId, line?.productId)
        return sum + unit * qty
      }, 0)
    : 0

// ─── API publique ──────────────────────────────────────────────────────────────
// Chaque fonction publique accumule en brut, puis applique round2 une seule fois.

/**
 * HT d'une ligne (pour affichage unitaire). Arrondi final unique.
 */
export function computeLineBenefice(line) {
  return round2(rawLineSalesHt(line))
}

/**
 * Total des ventes HT. Arrondi final unique sur la somme brute.
 * @param {SaleLine[]} lines
 * @returns {number}
 */
export function computeTotalSalesHt(lines) {
  return round2(rawSalesTotal(lines))
}

/**
 * Total des achats HT (mouvements de stock). Arrondi final unique.
 * @param {PurchaseLine[]} lines
 * @returns {number}
 */
export function computeTotalPurchasesHt(purchaseLines) {
  return round2(rawPurchasesTotal(purchaseLines))
}

/**
 * Coût d'achat des produits vendus (COGS). Arrondi final unique.
 * @param {SaleLine[]} lines
 * @param {Map|Record<string,number>} wholesaleByProductId
 * @returns {number}
 */
export function computeTotalCostOfGoodsSold(lines, wholesaleByProductId) {
  return round2(rawCostOfGoodsSold(lines, wholesaleByProductId))
}

/**
 * Bénéfice total = ventes HT − achats HT.
 * Calculé depuis les sommes brutes pour éviter le double arrondi
 * (round2(ventes) − round2(achats) peut différer de round2(ventes − achats)).
 * @param {SaleLine[]} lines
 * @param {PurchaseLine[]} [purchaseLines]
 * @returns {number}
 */
export function computeTotalBenefice(lines, purchaseLines = []) {
  return round2(rawSalesTotal(lines) - rawPurchasesTotal(purchaseLines))
}

/**
 * Bénéfice réel = ventes HT − coût d'achat des produits vendus (COGS).
 * Calculé depuis les sommes brutes — arrondi final unique.
 * @param {SaleLine[]} lines
 * @param {Map|Record<string,number>} wholesaleByProductId
 * @returns {number}
 */
export function computeRealBenefice(lines, wholesaleByProductId) {
  return round2(rawSalesTotal(lines) - rawCostOfGoodsSold(lines, wholesaleByProductId))
}

/**
 * Bénéfice journalier = ventes HT du jour − achats HT du jour.
 * Arrondi final unique sur la différence brute.
 * @param {SaleLine[]} lines
 * @param {string} date  YYYY-MM-DD
 * @param {PurchaseLine[]} [purchaseLines]
 * @returns {number}
 */
export function computeDailyBenefice(lines, date, purchaseLines = []) {
  const target = toDateKey(date)
  if (!target || !Array.isArray(lines)) return 0

  const dailySalesRaw = lines
    .filter((line) => toDateKey(line.dateAdd) === target)
    .reduce((sum, line) => sum + rawLineSalesHt(line), 0)

  const dailyPurchasesRaw = Array.isArray(purchaseLines)
    ? purchaseLines
        .filter((line) => toDateKey(line.dateAdd) === target)
        .reduce((sum, line) => sum + rawLinePurchaseHt(line), 0)
    : 0

  return round2(dailySalesRaw - dailyPurchasesRaw)
}

/**
 * Regroupe le bénéfice par jour : { 'YYYY-MM-DD': benefice }.
 * Accumulation brute par jour, arrondi unique à la fin sur chaque clé.
 * @param {SaleLine[]} lines
 * @param {PurchaseLine[]} [purchaseLines]
 * @returns {Record<string, number>}
 */
export function groupBeneficeByDay(lines, purchaseLines = []) {
  const rawMap = {}
  if (!Array.isArray(lines)) return {}

  for (const line of lines) {
    const key = toDateKey(line.dateAdd)
    if (!key) continue
    rawMap[key] = (rawMap[key] || 0) + rawLineSalesHt(line)
  }

  if (Array.isArray(purchaseLines)) {
    for (const line of purchaseLines) {
      const key = toDateKey(line.dateAdd)
      if (!key) continue
      rawMap[key] = (rawMap[key] || 0) - rawLinePurchaseHt(line)
    }
  }

  // Arrondi unique sur chaque total journalier
  const result = {}
  for (const key of Object.keys(rawMap)) {
    result[key] = round2(rawMap[key])
  }
  return result
}

const resolveCategoryId = (categoryByProductId, productId, fallback) => {
  const productKey = String(productId || '').trim()
  if (!productKey) return fallback
  if (categoryByProductId instanceof Map) return categoryByProductId.get(productKey) || fallback
  if (categoryByProductId && typeof categoryByProductId === 'object') return categoryByProductId[productKey] || fallback
  return fallback
}

/**
 * Regroupe le bénéfice par catégorie.
 * Accumulation brute par catégorie, arrondi unique à la fin sur chaque clé.
 * @param {SaleLine[]} lines
 * @param {object} [options]
 * @returns {Record<string, number>}
 */
export function groupBeneficeByCategory(lines, options = {}) {
  const rawMap = {}
  if (!Array.isArray(lines)) return {}

  const categoryByProductId = options.categoryByProductId
  const purchaseLines = options.purchaseLines
  const fallback = String(options.defaultCategory || 'uncategorized')

  for (const line of lines) {
    const key = resolveCategoryId(categoryByProductId, line?.productId, fallback)
    rawMap[key] = (rawMap[key] || 0) + rawLineSalesHt(line)
  }

  if (Array.isArray(purchaseLines)) {
    for (const line of purchaseLines) {
      const key = resolveCategoryId(categoryByProductId, line?.productId, fallback)
      rawMap[key] = (rawMap[key] || 0) - rawLinePurchaseHt(line)
    }
  }

  // Arrondi unique sur chaque total catégorie
  const result = {}
  for (const key of Object.keys(rawMap)) {
    result[key] = round2(rawMap[key])
  }
  return result
}

/**
 * Détaille le bénéfice par catégorie.
 * Toutes les accumulations sont brutes ; round2 appliqué une seule fois
 * en fin de traitement pour chaque métrique de chaque catégorie.
 * @param {SaleLine[]} lines
 * @param {object} [options]
 * @returns {Record<string, { salesHt, purchasesHt, beneficeHt, salesTtc, realPurchasesHt, realBenefice }>}
 */
export function detailBeneficeByCategory(lines, options = {}) {
  if (!Array.isArray(lines)) return {}

  const categoryByProductId  = options.categoryByProductId
  const wholesaleByProductId = options.wholesaleByProductId
  const purchaseLines        = Array.isArray(options.purchaseLines) ? options.purchaseLines : []
  const fallback             = String(options.defaultCategory || 'uncategorized')

  // Accumulateurs bruts par catégorie
  const raw = {}

  const ensureCat = (cat) => {
    if (!raw[cat]) {
      raw[cat] = { salesHt: 0, purchasesHt: 0, salesTtc: 0, realPurchasesHt: 0 }
    }
  }

  for (const line of lines) {
    const cat = resolveCategoryId(categoryByProductId, line?.productId, fallback)
    ensureCat(cat)
    raw[cat].salesHt       += rawLineSalesHt(line)
    raw[cat].salesTtc      += toNumber(line.totalPriceTtc || 0)
    raw[cat].realPurchasesHt += resolveWholesalePrice(wholesaleByProductId, line?.productId) * toNumber(line?.quantity)
  }

  for (const pline of purchaseLines) {
    const cat = resolveCategoryId(categoryByProductId, pline?.productId, fallback)
    ensureCat(cat)
    raw[cat].purchasesHt += rawLinePurchaseHt(pline)
  }

  // Arrondi unique sur chaque métrique — beneficeHt calculé depuis les bruts
  const result = {}
  for (const cat of Object.keys(raw)) {
    const salesHt        = round2(raw[cat].salesHt)
    const purchasesHt    = round2(raw[cat].purchasesHt)
    const salesTtc       = round2(raw[cat].salesTtc)
    const realPurchasesHt = round2(raw[cat].realPurchasesHt)

    result[cat] = {
      salesHt,
      purchasesHt,
      salesTtc,
      realPurchasesHt,
      // benefices calculés depuis les bruts pour éviter round2(a) - round2(b)
      beneficeHt:   round2(raw[cat].salesHt - raw[cat].purchasesHt),
      realBenefice: round2(raw[cat].salesHt - raw[cat].realPurchasesHt),
    }
  }

  return result
}

// ─── Système de stratégies extensible ─────────────────────────────────────────

const strategies = new Map()

export function registerStrategy(name, fn) {
  if (!name || typeof fn !== 'function') {
    throw new Error('registerStrategy: name (string) et fn (function) requis')
  }
  strategies.set(name, fn)
}

export function runStrategy(name, lines, options = {}) {
  const fn = strategies.get(name)
  if (!fn) {
    throw new Error(`runStrategy: stratégie inconnue "${name}". Disponibles: ${listStrategies().join(', ')}`)
  }
  return fn(lines, options)
}

export function listStrategies() {
  return Array.from(strategies.keys())
}

// ─── Stratégies natives ───────────────────────────────────────────────────────

registerStrategy('total',      (lines, { purchaseLines } = {}) => computeTotalBenefice(lines, purchaseLines))
registerStrategy('daily',      (lines, { date, purchaseLines } = {}) => computeDailyBenefice(lines, date, purchaseLines))
registerStrategy('byDay',      (lines, { purchaseLines } = {}) => groupBeneficeByDay(lines, purchaseLines))
registerStrategy('byCategory', (lines, options = {}) => groupBeneficeByCategory(lines, options))
