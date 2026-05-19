import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const rateCache = new Map()
let taxMapPromise = null

const getClient = () => {
  const { apiBaseUrl, apiKey } = getWebserviceEnv()
  return createXmlClient({ apiUrl: normalizeApiUrl(apiBaseUrl), apiKey })
}

const extractPrestashopError = (error) => {
  const raw = error?.response?.data
  if (!raw || typeof raw !== 'string') {
    return error?.message || 'Erreur API PrestaShop.'
  }

  try {
    const json = xmlToJson(raw)
    const root = json.prestashop || {}
    const errorsNode = root.errors || json.errors || {}
    const errorList = asArray(errorsNode.error)
    const message = errorList
      .map((item) => readText(item.message))
      .filter(Boolean)
      .join(' / ')

    return message || raw
  } catch (parseError) {
    return raw
  }
}

const parseTaxRulesList = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const rulesRoot = root.tax_rules || json.tax_rules || {}
  const nodes = asArray(rulesRoot.tax_rule)

  return nodes.map((rule) => ({
    id: readText(rule.id) || readAttr(rule, 'id'),
    taxId: readText(rule.id_tax),
    groupId: readText(rule.id_tax_rules_group),
  }))
}

const parseTaxesList = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const taxesRoot = root.taxes || json.taxes || {}
  const nodes = asArray(taxesRoot.tax)

  return nodes.map((tax) => ({
    id: readText(tax.id) || readAttr(tax, 'id'),
    rate: Number(readText(tax.rate) || 0),
  }))
}

const parseTax = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const taxNode = root.tax || json.tax || {}
  const rate = readText(taxNode.rate)
  return rate ? Number(rate) : 0
}

const loadTaxMaps = async () => {
  if (taxMapPromise) {
    return taxMapPromise
  }

  taxMapPromise = (async () => {
    const client = getClient()

    let rules = []
    let taxes = []

    try {
      const rulesResponse = await client.get('/tax_rules?display=[id_tax,id_tax_rules_group]')
      rules = parseTaxRulesList(rulesResponse.data)
    } catch (error) {
      const detail = extractPrestashopError(error)
      throw new Error(`Erreur tax_rules: ${detail}`)
    }

    try {
      const taxesResponse = await client.get('/taxes?display=[id,rate]')
      taxes = parseTaxesList(taxesResponse.data)
    } catch (error) {
      const detail = extractPrestashopError(error)
      throw new Error(`Erreur taxes: ${detail}`)
    }

    const groupToTaxId = new Map()
    rules.forEach((rule) => {
      if (!rule.groupId || !rule.taxId) {
        return
      }
      if (!groupToTaxId.has(rule.groupId)) {
        groupToTaxId.set(rule.groupId, rule.taxId)
      }
    })

    const taxIdToRate = new Map()
    taxes.forEach((tax) => {
      if (!tax.id) {
        return
      }
      taxIdToRate.set(tax.id, Number(tax.rate || 0))
    })

    return { groupToTaxId, taxIdToRate }
  })()

  return taxMapPromise
}

const getTaxRateForGroup = async (taxRulesGroupId) => {
  const groupId = String(taxRulesGroupId || '').trim()
  if (!groupId || groupId === '0') {
    return 0
  }

  if (rateCache.has(groupId)) {
    return rateCache.get(groupId)
  }

  const { groupToTaxId, taxIdToRate } = await loadTaxMaps()
  const taxId = groupToTaxId.get(groupId)
  const rate = taxId ? taxIdToRate.get(taxId) : 0

  rateCache.set(groupId, Number(rate || 0))
  return Number(rate || 0)
}

const computePriceTtc = (priceHt, taxRate) => {
  const base = Number(priceHt || 0)
  const rate = Number(taxRate || 0)
  const total = base * (1 + rate / 100)
  return Number(total.toFixed(2))
}

const computePriceHt = (priceTtc, taxRate) => {
  const total = Number(priceTtc || 0)
  const rate = Number(taxRate || 0)
  if (!rate) {
    return Number(total.toFixed(2))
  }
  const base = total / (1 + rate / 100)
  return Number(base.toFixed(2))
}

export { getTaxRateForGroup, computePriceTtc, computePriceHt }
