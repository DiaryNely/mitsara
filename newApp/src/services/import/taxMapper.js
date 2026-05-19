// services/import/taxMapper.js - Version CORRIGÉE

import { getXmlClient } from '../../api/xmlClient'
import { xmlToJson, asArray, readText, readAttr, buildXML } from '../../utils/xml'

const taxCache = new Map()

const DEFAULT_COUNTRY_ID_FALLBACK = '8'
let cachedDefaultCountryId = null

export const normalizeTaxRateNumber = (taxRate) => {
  const raw = String(taxRate ?? '').trim()
  if (!raw) {
    return Number.NaN
  }

  const cleaned = raw
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .replace(',', '.')

  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value)) {
    return Number.NaN
  }

  // Arrondi léger pour stabiliser le cache et les comparaisons
  return Math.round(value * 1e4) / 1e4
}

const normalizeTaxRateKey = (taxRate) => {
  const value = normalizeTaxRateNumber(taxRate)
  return Number.isFinite(value) ? String(value) : ''
}

const getDefaultCountryId = async () => {
  if (cachedDefaultCountryId) {
    return cachedDefaultCountryId
  }

  const client = getXmlClient()
  try {
    // Utilise le pays par défaut du shop (International > Localisation)
    const response = await client.get(
      '/configurations?filter[name]=PS_COUNTRY_DEFAULT&display=[value]'
    )
    const json = xmlToJson(response.data)
    const configs = asArray(json.prestashop?.configurations?.configuration || [])
    const value = readText(configs[0]?.value)
    if (value) {
      cachedDefaultCountryId = String(value)
      return cachedDefaultCountryId
    }
  } catch {
    // Permissions/configurations non accessibles → fallback.
  }

  cachedDefaultCountryId = DEFAULT_COUNTRY_ID_FALLBACK
  return cachedDefaultCountryId
}

/**
 * Récupère tous les groupes de taxe existants dans PrestaShop
 * ✅ Endpoint correct : tax_rule_groups (pas tax_rules_groups)
 */
export async function getTaxRuleGroups() {
  const client = getXmlClient()
  try {
    // ✅ Bon endpoint : tax_rule_groups
    // ⚠️ Sans display, PrestaShop renvoie souvent uniquement des ids en attribut (pas de <name>). 
    // On demande donc explicitement les champs utiles.
    const response = await client.get('/tax_rule_groups?display=[id,name,active,deleted]')
    const json = xmlToJson(response.data)
    
    let groups = json.prestashop?.tax_rule_groups?.tax_rule_group || []
    groups = asArray(groups)
    
    const readLocalizedText = (node) => {
      if (!node) return ''
      const languages = node.language ? asArray(node.language) : []
      if (languages.length) {
        const preferred = languages.find((lang) => readAttr(lang, 'id') === '1') || languages[0]
        return readText(preferred)
      }
      return readText(node)
    }

    return groups
      .map((group) => ({
        id: readText(group.id) || readAttr(group, 'id'),
        name: readLocalizedText(group.name),
        active: readText(group.active) || '1',
        deleted: readText(group.deleted) || '0',
      }))
      .filter((group) => Boolean(group.id))
  } catch (error) {
    console.error('Erreur récupération tax rule groups:', error)
    return []
  }
}

/**
 * Récupère les taxes (taux) existantes.
 * Utile si le nom du groupe ne contient pas le taux.
 */
async function getTaxes() {
  const client = getXmlClient()
  try {
    const response = await client.get('/taxes?display=[id,rate,active,deleted,name]')
    const json = xmlToJson(response.data)

    let taxes = json.prestashop?.taxes?.tax || []
    taxes = asArray(taxes)

    const readLocalizedText = (node) => {
      if (!node) return ''
      const languages = node.language ? asArray(node.language) : []
      if (languages.length) {
        const preferred = languages.find((lang) => readAttr(lang, 'id') === '1') || languages[0]
        return readText(preferred)
      }
      return readText(node)
    }

    return taxes
      .map((tax) => {
        const rateRaw = readText(tax.rate)
        const rate = Number.parseFloat(String(rateRaw).replace(',', '.'))
        return {
          id: readText(tax.id) || readAttr(tax, 'id'),
          rate,
          name: readLocalizedText(tax.name),
          active: readText(tax.active) || '1',
          deleted: readText(tax.deleted) || '0',
        }
      })
      .filter((tax) => Boolean(tax.id) && Number.isFinite(tax.rate))
  } catch (error) {
    console.warn('Erreur récupération taxes:', error)
    return []
  }
}

async function getTaxRulesByTaxId(taxId) {
  const client = getXmlClient()
  try {
    const response = await client.get(
      `/tax_rules?filter[id_tax]=${encodeURIComponent(String(taxId))}&display=[id,id_tax,id_tax_rules_group,id_country]`
    )
    const json = xmlToJson(response.data)

    let rules = json.prestashop?.tax_rules?.tax_rule || []
    rules = asArray(rules)

    return rules
      .map((rule) => ({
        id: readText(rule.id) || readAttr(rule, 'id'),
        id_tax: readText(rule.id_tax),
        id_tax_rules_group: readText(rule.id_tax_rules_group),
        id_country: readText(rule.id_country),
      }))
      .filter((rule) => Boolean(rule.id_tax_rules_group))
  } catch (error) {
    console.warn('Erreur récupération tax rules:', error)
    return []
  }
}

/**
 * Crée la taxe, le groupe et la règle. Retourne {groupId, taxId, ruleId}.
 */
export async function createTaxRuleGroup(taxRate, onLog) {
  const client = getXmlClient()

  const rateNumber = normalizeTaxRateNumber(taxRate)
  if (!Number.isFinite(rateNumber) || rateNumber <= 0) {
    throw new Error(`Taux de taxe invalide: "${taxRate}"`)
  }

  const rateStr = String(rateNumber)
  const groupName = `TVA ${rateStr}%`

  const taxXml = buildXML({
    prestashop: {
      tax: {
        name: {
          language: {
            '@_id': '1',
            '#text': `${groupName}`
          }
        },
        rate: parseFloat(rateStr),
        active: 1
      }
    }
  })

  try {
    const taxResponse = await client.post('/taxes', taxXml)
    const taxJson = xmlToJson(taxResponse.data)
    const taxId = readText(taxJson.prestashop?.tax?.id)
    if (!taxId) {
      throw new Error(`Impossible de récupérer l'ID de la taxe créée (${groupName})`)
    }
    if (onLog) onLog(`  → Taxe créée: ${groupName} (taux: ${rateStr}%, ID: ${taxId})`)

    const groupXml = buildXML({
      prestashop: {
        tax_rule_group: {
          name: groupName,
          active: 1
        }
      }
    })

    const groupResponse = await client.post('/tax_rule_groups', groupXml)
    const groupJson = xmlToJson(groupResponse.data)
    const groupId = readText(groupJson.prestashop?.tax_rule_group?.id)
    if (!groupId) {
      throw new Error(`Impossible de récupérer l'ID du groupe de taxe créé (${groupName})`)
    }
    if (onLog) onLog(`  → Groupe de taxe créé: ${groupName} (ID: ${groupId})`)

    const countryId = await getDefaultCountryId()
    const ruleXml = buildXML({
      prestashop: {
        tax_rule: {
          id_tax: taxId,
          id_tax_rules_group: groupId,
          id_country: countryId,
          id_state: 0,
          zipcode_from: 0,
          zipcode_to: 0,
          id_county: 0,
          behavior: 0,
          description: ''
        }
      }
    })

    const ruleResponse = await client.post('/tax_rules', ruleXml)
    const ruleJson = xmlToJson(ruleResponse.data)
    const ruleId = readText(ruleJson.prestashop?.tax_rule?.id)
    if (onLog) onLog(`  → Règle de taxe créée (pays ID: ${countryId})`)

    return { groupId, taxId, ruleId }

  } catch (error) {
    const status = error?.response?.status
    const statusLabel = status ? `HTTP ${status}` : null
    const detail = statusLabel ? ` (${statusLabel})` : ''
    const message = error?.message || 'Erreur inconnue'
    if (onLog) {
      onLog(`  ❌ Erreur création taxe ${taxRate}: ${message}${detail}`, 'error')
      const responseText = error?.response?.data
      if (responseText) {
        onLog(`  ↳ Réponse PrestaShop: ${String(responseText).slice(0, 500)}`, 'error')
      }
    }
    throw error instanceof Error ? error : new Error(message)
  }
}

/**
 * Vide le cache des taxes (à appeler en début d'import transactionnel).
 */
export function clearTaxCache() {
  taxCache.clear()
  cachedDefaultCountryId = null
}

/**
 * Hydrate le cache des tax_rule_groups à partir d'une liste déjà chargée.
 * Permet à getOrCreateTaxRuleGroup d'éviter le GET /tax_rule_groups pour
 * chaque taux unique rencontré dans le fichier produits.
 */
export function primeTaxRuleGroupsCache(groups) {
  if (!Array.isArray(groups)) return
  for (const group of groups) {
    if (!group || !group.id || !group.name) continue
    const match = String(group.name).match(/(\d+(?:[.,]\d+)?)/)
    if (!match) continue
    const rateNumber = normalizeTaxRateNumber(match[1])
    if (!Number.isFinite(rateNumber)) continue
    const key = String(rateNumber)
    if (!taxCache.has(key)) {
      taxCache.set(key, group.id)
    }
  }
}

/**
 * Récupère ou crée un groupe de taxe. Retourne {groupId, taxId, created}.
 * taxId est non-null uniquement si created === true.
 */
export async function getOrCreateTaxRuleGroup(taxRate, onLog) {
  const normalizedRate = normalizeTaxRateKey(taxRate)
  if (!normalizedRate) {
    throw new Error(`Taux de taxe invalide: "${taxRate}"`)
  }

  if (taxCache.has(normalizedRate)) {
    return { groupId: taxCache.get(normalizedRate), taxId: null, created: false }
  }

  try {
    const groups = await getTaxRuleGroups()

    let existingGroup = null
    for (const group of groups) {
      const match = group.name.match(/(\d+(?:[.,]\d+)?)/)
      if (match) {
        const groupRate = parseFloat(match[1].replace(',', '.'))
        const targetRate = parseFloat(normalizedRate)
        if (Math.abs(groupRate - targetRate) < 0.01) {
          existingGroup = group
          break
        }
      }
    }

    if (existingGroup) {
      if (onLog) onLog(`  → Taxe ${taxRate} trouvée (groupe ID: ${existingGroup.id})`)
      taxCache.set(normalizedRate, existingGroup.id)
      return { groupId: existingGroup.id, taxId: null, created: false }
    }

    if (onLog) onLog(`  → Création du groupe de taxe pour ${taxRate}...`)
    const { groupId, taxId } = await createTaxRuleGroup(taxRate, onLog)
    taxCache.set(normalizedRate, groupId)
    return { groupId, taxId, created: true }

  } catch (error) {
    const message = error?.message || 'Erreur inconnue'
    if (onLog) {
      onLog(
        `  ❌ Impossible de récupérer/créer la taxe ${taxRate}: ${message}. ` +
          `Vérifie les permissions Webservice sur taxes / tax_rule_groups / tax_rules.`,
        'error'
      )
    }
    throw error instanceof Error ? error : new Error(message)
  }
}
/**
 * Calcule le prix HT à partir du prix TTC et du taux de taxe
 */
export function calculatePriceHT(priceTTC, taxRate) {
  const base = Number.parseFloat(String(priceTTC ?? '0').replace(',', '.'))
  if (!Number.isFinite(base)) {
    return 0
  }

  const rateNumber = normalizeTaxRateNumber(taxRate)
  if (!Number.isFinite(rateNumber) || rateNumber === 0) {
    return base
  }

  const rate = rateNumber / 100
  const priceHT = base / (1 + rate)
  // Garder plus de précision (PrestaShop stocke souvent sur 6 décimales)
  return Math.round(priceHT * 1e6) / 1e6
}

/**
 * Calcule le prix TTC à partir du prix HT et du taux de taxe
 */
export function calculatePriceTTC(priceHT, taxRate) {
  const base = Number.parseFloat(String(priceHT ?? '0').replace(',', '.'))
  if (!Number.isFinite(base)) {
    return 0
  }

  const rateNumber = normalizeTaxRateNumber(taxRate)
  if (!Number.isFinite(rateNumber) || rateNumber === 0) {
    return base
  }

  const rate = rateNumber / 100
  const priceTTC = base * (1 + rate)
  return Math.round(priceTTC * 1e6) / 1e6
}