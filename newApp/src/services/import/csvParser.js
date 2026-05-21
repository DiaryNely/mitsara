// services/csvParser.js
// Parse les fichiers CSV fournis par le professeur.
//
// Règles strictes :
//  - Les en-têtes doivent correspondre EXACTEMENT aux noms attendus (insensible à la casse).
//  - Les accents et caractères spéciaux dans les en-têtes stoppent l'import.
//  - Aucune colonne supplémentaire ou manquante n'est tolérée.

/**
 * Convertit une chaîne de prix en nombre flottant.
 * Gère les formats :
 *  - français : "1.000,50"  → 1000.50  (point = milliers, virgule = décimal)
 *  - anglais  : "1,000.50"  → 1000.50  (virgule = milliers, point = décimal)
 *  - simple   : "199,1"     → 199.1
 *  - entier   : "135"       → 135
 */
function parsePrice(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return 0

  const hasComma = s.includes(',')
  const hasDot   = s.includes('.')

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',')
    const lastDot   = s.lastIndexOf('.')
    if (lastComma > lastDot) {
      // Format français "1.000,50" — point = séparateur milliers, virgule = décimal
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // Format anglais "1,000.50" — virgule = séparateur milliers
      s = s.replace(/,/g, '')
    }
  } else {
    // Un seul séparateur : virgule → point
    s = s.replace(',', '.')
  }

  const value = parseFloat(s)
  return Number.isFinite(value) ? value : 0
}

// En-têtes attendus — format CANONIQUE tel qu'utilisé dans les CSV de production.
// La comparaison est insensible à la casse, mais tout autre écart (accent absent,
// caractère substitué, etc.) provoque l'arrêt de l'import.
const EXPECTED_HEADERS = {
  produits:     ['date_availability_produit', 'nom', 'reference', 'prix_ttc', 'Taxe', 'categorie', 'prix_achat'],
  declinaisons: ['reference', 'specificité', 'karazany', 'stock_initial', 'prix_vente_ttc'],
  commandes:    ['date', 'nom', 'email', 'pwd', 'adresse', 'achat', 'etat'],
}

/**
 * Valide la ligne d'en-têtes d'un CSV par rapport au format attendu.
 *  - Comparaison insensible à la casse uniquement.
 *  - Tout autre écart (accent manquant, caractère substitué, en-tête en plus/manquant)
 *    provoque l'arrêt de l'import.
 */
function validateHeaders(rawHeaders, expectedHeaders, fileLabel) {
  const normalized      = rawHeaders.map((h) => h.toLowerCase())
  const expectedLower   = expectedHeaders.map((h) => h.toLowerCase())
  const expectedLowerSet = new Set(expectedLower)

  // En-têtes manquants (présents dans expected mais pas dans CSV, casse mise à part)
  const missing = expectedHeaders.filter((h) => !normalized.includes(h.toLowerCase()))
  if (missing.length) {
    throw new Error(
      `${fileLabel} : en-tête(s) manquant(s) ou incorrect(s) : ${missing.join(', ')}. ` +
      `Format attendu : ${expectedHeaders.join(', ')}`
    )
  }

  // En-têtes inattendus (présents dans CSV mais pas dans expected)
  const unexpected = rawHeaders.filter((h) => !expectedLowerSet.has(h.toLowerCase()))
  if (unexpected.length) {
    throw new Error(
      `${fileLabel} : en-tête(s) inattendu(s) : ${unexpected.join(', ')}. ` +
      `Format attendu : ${expectedHeaders.join(', ')}`
    )
  }
}

/**
 * Parse un fichier CSV avec gestion des guillemets et des virgules dans les champs
 */
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
    i++
  }
  result.push(current.trim())
  return result
}

/**
 * Parse le champ "achat" du fichier3
 * Format: "[(""T_01"";3;""ngoza""),(""C_03"";1;"""")]"
 *
 * Règles de robustesse :
 *  - Les entrées avec quantité <= 0 ou non-numérique sont ignorées.
 *  - Les doublons (même référence + même variante, insensible à la casse et aux espaces)
 *    sont fusionnés en additionnant les quantités, pour éviter le HTTP 500 de PrestaShop
 *    qui rejette un panier avec deux lignes identiques (id_product, id_product_attribute).
 *  - La variante est trimée ; une variante vide est normalisée en null.
 */
export function parseAchatField(achatString) {
  if (!achatString || !achatString.trim() || achatString.trim() === '[]') return []

  let content = achatString.trim()
  if (content.startsWith('[') && content.endsWith(']')) {
    content = content.slice(1, -1).trim()
  }
  if (!content) return []

  // Map de dédoublonnage : clé = "reference::varianteNormalisée"
  const seen = new Map()

  const parts = content.split('),(')
  for (let part of parts) {
    part = part.replace(/^\(/, '').replace(/\)$/, '')
    const segments = part.split(';').map((s) => s.replace(/^"|"$/g, '').trim())

    if (segments.length < 2) continue

    const reference = segments[0]
    if (!reference) continue

    const quantity = parseInt(segments[1], 10)
    // Ignorer les quantités nulles, négatives ou non-numériques
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    // Normaliser la variante : trim + null si vide (insensible à la casse pour la clé)
    const rawVariant = segments.length >= 3 ? segments[2] : ''
    const variant = rawVariant || null
    const variantKey = (rawVariant || '').toLowerCase()

    const key = `${reference}::${variantKey}`

    if (seen.has(key)) {
      // Fusionner : additionner les quantités du même (produit, variante)
      seen.get(key).quantity += quantity
    } else {
      seen.set(key, { reference, quantity, variant })
    }
  }

  return Array.from(seen.values())
}

/**
 * Parse fichier1.csv (Produits de base)
 * Colonnes attendues : date_availability_produit, nom, reference, prix_ttc, taxe, categorie, prix_achat
 */
export function parseFichier1(csvContent) {
  const normalizedContent = String(csvContent ?? '').replace(/^﻿/, '')
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) throw new Error('Fichier1 : fichier vide')

  const rawHeaders = parseCSVLine(lines[0]).map((h) => h.replace(/^﻿/, '').trim())
  validateHeaders(rawHeaders, EXPECTED_HEADERS.produits, 'Fichier1')

  const headers = rawHeaders.map((h) => h.toLowerCase())
  const products = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < headers.length) continue

    const product = {}
    headers.forEach((header, idx) => {
      product[header] = values[idx] ?? ''
    })

    if (product.reference && product.nom) {
      products.push({
        date_availability_produit: product.date_availability_produit,
        nom:        product.nom,
        reference:  product.reference,
        prix_ttc:   parsePrice(product.prix_ttc),
        taxe:       product.taxe,
        categorie:  product.categorie,
        prix_achat: parsePrice(product.prix_achat),
      })
    }
  }

  return products
}

/**
 * Parse fichier2.csv (Déclinaisons)
 * Colonnes attendues : reference, specificite, karazany, stock_initial, prix_vente_ttc
 */
export function parseFichier2(csvContent) {
  const normalizedContent = String(csvContent ?? '').replace(/^﻿/, '')
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) throw new Error('Fichier2 : fichier vide')

  const rawHeaders = parseCSVLine(lines[0]).map((h) => h.replace(/^﻿/, '').trim())
  validateHeaders(rawHeaders, EXPECTED_HEADERS.declinaisons, 'Fichier2')

  const headers = rawHeaders.map((h) => h.toLowerCase())
  const variants = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < 3) continue

    const variant = {}
    headers.forEach((header, idx) => {
      variant[header] = values[idx] ?? ''
    })

    // Le header CSV attendu est `specificité` (avec accent) ; après lowercase
    // la clé reste accentuée, donc on y accède en bracket notation.
    const rawPrix = variant.prix_vente_ttc
    variants.push({
      reference:      variant.reference,
      specificite:    variant['specificité'] || null,
      karazany:       variant.karazany || null,
      stock_initial:  parseInt(variant.stock_initial, 10) || 0,
      prix_vente_ttc: rawPrix ? parsePrice(rawPrix) : null,
    })
  }

  return variants
}

/**
 * Parse fichier3.csv (Commandes)
 * Colonnes attendues : date, nom, email, pwd, adresse, achat, etat
 */
export function parseFichier3(csvContent) {
  const normalizedContent = String(csvContent ?? '').replace(/^﻿/, '')
  const lines = normalizedContent.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) throw new Error('Fichier3 : fichier vide')

  const rawHeaders = parseCSVLine(lines[0]).map((h) => h.replace(/^﻿/, '').trim())
  validateHeaders(rawHeaders, EXPECTED_HEADERS.commandes, 'Fichier3')

  const headers = rawHeaders.map((h) => h.toLowerCase())
  const orders = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < headers.length) continue

    const order = {}
    headers.forEach((header, idx) => {
      order[header] = values[idx] || ''
    })

    orders.push({
      date:    order.date,
      nom:     order.nom,
      email:   order.email,
      pwd:     order.pwd,
      adresse: order.adresse,
      achat:   parseAchatField(order.achat),
      etat:    order.etat,
    })
  }

  return orders
}

/**
 * Groupe les déclinaisons par référence produit
 */
export function groupVariantsByReference(variants) {
  const grouped = new Map()

  for (const variant of variants) {
    if (!grouped.has(variant.reference)) {
      grouped.set(variant.reference, [])
    }
    grouped.get(variant.reference).push(variant)
  }

  return grouped
}
