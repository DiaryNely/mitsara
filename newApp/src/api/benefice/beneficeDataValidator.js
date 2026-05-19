/**
 * beneficeDataValidator.js
 *
 * Valide et enrichit les données Bénéfice pour garantir HT et TTC complets.
 * Contient la logique de calcul des montants manquants (UNE SEULE FOIS à la source).
 *
 * Utilisation:
 * - Appelé dans fetchOrderLinesWithWholesale() avant de retourner les lignes enrichies
 * - Évite les calculs répétés et les pertes d'arrondi
 */

const toNumber = (value) => {
  const normalized = String(value ?? '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

/**
 * Vérifie et corrige les montants HT/TTC d'une ligne.
 * Règle : PAS de calcul approximatif. Si HT et TTC absent → ERROR.
 *
 * @param {Object} line - Ligne enrichie { totalPriceHt, totalPriceTtc, taxRate, ... }
 * @returns {Object} Ligne validée { totalPriceHt, totalPriceTtc, ... }
 * @throws si données insuffisantes
 */
export function validateAndEnrichLine(line) {
  if (!line) return null

  const ht = toNumber(line.totalPriceHt)
  const ttc = toNumber(line.totalPriceTtc)
  const rate = toNumber(line.taxRate)

  // ✓ Cas idéal : HT et TTC présents ET > 0
  if (ht > 0 && ttc > 0) {
    return line  // Données complètes, rien à faire
  }

  // ⚠️ Cas 1 : HT présent, TTC manquant
  if (ht > 0 && ttc === 0) {
    console.warn('⚠️ Benefice: TTC manquant, calculé depuis HT:', {
      productId: line.productId,
      ht,
      rate,
    })
    return {
      ...line,
      totalPriceHt: ht,
      totalPriceTtc: rate ? ht * (1 + rate / 100) : ht,
    }
  }

  // ⚠️ Cas 2 : TTC présent, HT manquant
  if (ttc > 0 && ht === 0) {
    if (!rate || rate < 0) {
      throw new Error(`Benefice: TTC présent (${ttc}) mais HT et/ou taxRate absent pour produit ${line.productId}`)
    }
    console.warn('⚠️ Benefice: HT manquant, calculé depuis TTC:', {
      productId: line.productId,
      ttc,
      rate,
    })
    return {
      ...line,
      totalPriceHt: ttc / (1 + rate / 100),
      totalPriceTtc: ttc,
    }
  }

  // ❌ Cas 3 : HT ET TTC absent OU les deux à 0 → données insuffisantes
  if (ht === 0 && ttc === 0) {
    throw new Error(
      `Benefice: Données incomplètes pour produit ${line.productId}: HT=${ht}, TTC=${ttc}, rate=${rate}. Vérifier prix unitaires Prestashop.`
    )
  }

  // Fallback par défaut
  return line
}

/**
 * Collecte les stats de validation pour diagnostiquer les problèmes d'API.
 *
 * @param {Object[]} lines
 * @returns {Object} { totalLines, complete, calculated, errors }
 */
export function validateBatch(lines) {
  if (!Array.isArray(lines)) return { totalLines: 0, complete: 0, calculated: 0, errors: [] }

  let complete = 0
  let calculated = 0
  const errors = []

  lines.forEach((line, idx) => {
    try {
      const result = validateAndEnrichLine(line)
      if (result && result.totalPriceHt > 0 && result.totalPriceTtc > 0) {
        complete += 1
      } else {
        calculated += 1
      }
    } catch (err) {
      errors.push({ index: idx, productId: line?.productId, error: err.message })
    }
  })

  const stats = {
    totalLines: lines.length,
    complete,
    calculated,
    hasErrors: errors.length > 0,
    errors,
  }

  // Log diagnostic
  if (errors.length > 0) {
    console.error('❌ Benefice: Erreurs de validation:', stats)
  } else if (calculated > 0) {
    console.warn(`⚠️ Benefice: ${calculated}/${lines.length} lignes calculées (incomplètes)`)
  } else {
    console.log(`✅ Benefice: ${complete}/${lines.length} lignes valides`)
  }

  return stats
}

export default {
  validateAndEnrichLine,
  validateBatch,
}
