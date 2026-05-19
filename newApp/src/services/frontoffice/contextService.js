import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const CACHE_TTL_MS = 5 * 60 * 1000
let cachedContext = null
let cachedAt = 0

// Permet d'invalider le cache depuis l'extérieur (utile après rechargement .env)
const invalidateShopContextCache = () => {
  cachedContext = null
  cachedAt = 0
}

const readOptionalEnv = (key) => {
  const value = import.meta.env[key]
  return typeof value === 'string' ? value.trim() : ''
}

const readLocalized = (value) => {
  if (!value) {
    return ''
  }
  const languages = asArray(value.language)
  const preferred = languages.find((lang) => readText(lang)) || languages[0]
  return readText(preferred)
}

const parseId = (node) => readText(node?.id) || readAttr(node, 'id')

const RESOURCE_ITEM_KEY = {
  currencies: 'currency',
  languages: 'language',
  shops: 'shop',
  shop_groups: 'shop_group',
  carriers: 'carrier',
  countries: 'country',
  order_states: 'order_state',
}

const parseList = (xmlText, resource) => {
  const itemKey = RESOURCE_ITEM_KEY[resource]
  if (!itemKey) {
    return []
  }

  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const listRoot = root[resource] || json[resource] || {}
  return asArray(listRoot[itemKey])
}

const getClient = () => {
  const { apiBaseUrl, apiKey } = getWebserviceEnv()
  return createXmlClient({ apiUrl: normalizeApiUrl(apiBaseUrl), apiKey })
}

const parseConfigurations = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const configsRoot = root.configurations || json.configurations || {}
  const nodes = asArray(configsRoot.configuration)

  return nodes.map((config) => ({
    name: readText(config.name),
    value: readText(config.value),
  }))
}

const fetchConfigurationValue = async (name) => {
  if (!name) {
    return ''
  }
  const client = getClient()
  const query = `display=full&filter[name]=[${encodeURIComponent(name)}]`
  const response = await client.get(`/configurations?${query}`)
  const configs = parseConfigurations(response.data)
  return configs[0]?.value || ''
}

const fetchFirstId = async (resource, query) => {
  const client = getClient()
  const response = await client.get(`/${resource}?${query}`)
  const list = parseList(response.data, resource)
  const first = list[0]
  return parseId(first) || ''
}

const normalizeFr = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

// Retourne TOUS les labels normalisés d'un état (toutes langues confondues).
// Indispensable pour que les filtres "distance"/"remote" s'appliquent quelle que
// soit la langue active — un état "Paiement à distance effectué" possède souvent
// un label anglais "Payment complete" qui passerait sans ce contrôle multi-langue.
const getAllStateLabels = (state) => {
  const nameNode = state.name
  if (!nameNode) return []
  const languages = asArray(nameNode.language)
  if (languages.length) {
    return languages.map((lang) => normalizeFr(readText(lang))).filter(Boolean)
  }
  const single = normalizeFr(readText(nameNode))
  return single ? [single] : []
}

// Retourne l'ID de l'état "En attente de paiement à la livraison" (COD).
const fetchCodStateId = async () => {
  const client = getClient()
  const response = await client.get('/order_states?display=full')
  const list = parseList(response.data, 'order_states')

  const isRemote = (label) => label.includes('distance') || label.includes('remote')

  const matchers = [
    (labels) => labels.some((l) => !isRemote(l) && l.includes('attente') && l.includes('livraison')),
    (labels) => labels.some((l) => !isRemote(l) && l.includes('waiting') && l.includes('delivery')),
    (labels) => labels.some((l) => !isRemote(l) && (l.includes('contre remboursement') || l.includes('cash on delivery'))),
    (labels) => labels.some((l) => !isRemote(l) && l.includes('livraison')),
    (labels) => labels.some((l) => !isRemote(l) && /\bcod\b/.test(l)),
    (labels) => labels.some((l) => !isRemote(l) && l.includes('cash')),
  ]

  for (const predicate of matchers) {
    const match = list.find((state) => predicate(getAllStateLabels(state)))
    if (match) return parseId(match)
  }
  return ''
}

// Retourne l'ID de l'état "Livré" (ou équivalent).
const fetchDeliveredStateId = async () => {
  const client = getClient()
  const response = await client.get('/order_states?display=full')
  const list = parseList(response.data, 'order_states')

  const matchers = [
    (labels) => labels.some((l) => l === 'livre' || l === 'livree'),
    (labels) => labels.some((l) => l === 'delivered'),
    (labels) => labels.some((l) => l.includes('livre') && !l.includes('livraison')),
    (labels) => labels.some((l) => l.startsWith('deliver')),
  ]

  for (const predicate of matchers) {
    const match = list.find((state) => predicate(getAllStateLabels(state)))
    if (match) return parseId(match)
  }
  return ''
}

// Retourne l'ID de l'état "Annulé" (ou équivalent).
// Les matchers excluent les états contenant "paiement"/"payment" pour ne pas
// accidentellement sélectionner un état comme "Paiement annulé à distance".
const fetchCancelledStateId = async () => {
  const client = getClient()
  const response = await client.get('/order_states?display=full')
  const list = parseList(response.data, 'order_states')

  const matchers = [
    (labels) => labels.some((l) => l === 'annule' || l === 'annulee'),
    (labels) => labels.some((l) => l === 'cancelled' || l === 'canceled'),
    (labels) => labels.some((l) => l.startsWith('annul') && !l.includes('paiement') && !l.includes('payment')),
    (labels) => labels.some((l) => l.startsWith('cancel') && !l.includes('paiement') && !l.includes('payment')),
  ]

  for (const predicate of matchers) {
    const match = list.find((state) => predicate(getAllStateLabels(state)))
    if (match) return parseId(match)
  }
  return ''
}

// Retourne l'ID de l'état "Paiement accepté/effectué" (non distant, non erreur).
// Le contrôle isRemote s'applique sur TOUS les labels multilingues : un état
// "Paiement à distance effectué" possède souvent un label anglais "Payment complete"
// qui le ferait passer si on ne vérifiait qu'une seule langue.
const fetchPaidStateId = async () => {
  const client = getClient()
  const response = await client.get('/order_states?display=full')
  const list = parseList(response.data, 'order_states')

  const isRemote = (label) => label.includes('distance') || label.includes('remote')
  const isPaymentFailure = (label) =>
    label.includes('erreur') ||
    label.includes('echec') ||
    label.includes('refus') ||
    label.includes('error') ||
    label.includes('failed') ||
    label.includes('declined')

  const matchers = [
    (labels) => labels.some((l) => !isPaymentFailure(l) && l.includes('paiement') && (l.includes('accepte') || l.includes('accepted'))),
    (labels) => labels.some((l) => !isPaymentFailure(l) && l.includes('paiement') && (l.includes('effectue') || l.includes('complete') || l.includes('completed'))),
    (labels) => labels.some((l) => !isPaymentFailure(l) && l.includes('payment') && (l.includes('accepted') || l.includes('successful') || l.includes('complete'))),
  ]

  for (const predicate of matchers) {
    // Un état n'est éligible que si AUCUN de ses labels (toutes langues) n'est "distance/remote".
    const match = list.find((state) => {
      const labels = getAllStateLabels(state)
      if (labels.some(isRemote)) return false
      return predicate(labels)
    })
    if (match) return parseId(match)
  }
  return ''
}

const fetchDefaultStateId = async () => {
  const client = getClient()
  const response = await client.get('/order_states?display=full&limit=1')
  const list = parseList(response.data, 'order_states')
  return parseId(list[0]) || ''
}

const getShopContext = async () => {
  const now = Date.now()
  if (cachedContext && now - cachedAt < CACHE_TTL_MS) {
    return cachedContext
  }

  const langId = readOptionalEnv('VITE_PRESTASHOP_DEFAULT_LANG_ID') ||
    (await fetchFirstId('languages', 'display=full&filter[active]=[1]&limit=1'))

  const currencyId = readOptionalEnv('VITE_PRESTASHOP_DEFAULT_CURRENCY_ID') ||
    (await fetchFirstId('currencies', 'display=full&filter[active]=[1]&limit=1'))

  const shopId = readOptionalEnv('VITE_PRESTASHOP_DEFAULT_SHOP_ID') ||
    (await fetchFirstId('shops', 'display=full&limit=1'))

  const shopGroupId = readOptionalEnv('VITE_PRESTASHOP_DEFAULT_SHOP_GROUP_ID') ||
    (await fetchFirstId('shop_groups', 'display=full&limit=1'))

  const countryId = readOptionalEnv('VITE_PRESTASHOP_DEFAULT_COUNTRY_ID') ||
    (await fetchConfigurationValue('PS_COUNTRY_DEFAULT')) ||
    (await fetchFirstId('countries', 'display=full&filter[active]=[1]&limit=1'))

  const carrierId = readOptionalEnv('VITE_PRESTASHOP_FREE_CARRIER_ID') ||
    (await fetchFirstId('carriers', 'display=full&filter[active]=[1]&filter[deleted]=[0]&limit=1'))

  const codStateId = readOptionalEnv('VITE_PRESTASHOP_COD_STATE_ID') ||
    (await fetchCodStateId())
  const paidStateId = readOptionalEnv('VITE_PRESTASHOP_PAID_STATE_ID') ||
    (await fetchPaidStateId())
  const deliveredStateId = readOptionalEnv('VITE_PRESTASHOP_DELIVERED_STATE_ID') ||
    (await fetchDeliveredStateId())
  const cancelledStateId = readOptionalEnv('VITE_PRESTASHOP_CANCELLED_STATE_ID') ||
    (await fetchCancelledStateId())
  const defaultStateId = await fetchDefaultStateId()
  const codModule = readOptionalEnv('VITE_PRESTASHOP_COD_MODULE') || 'ps_cashondelivery'
  const codPaymentLabel = readOptionalEnv('VITE_PRESTASHOP_COD_PAYMENT_LABEL') || 'Paiement à la livraison'

  cachedContext = {
    langId,
    currencyId,
    shopId,
    shopGroupId,
    countryId,
    carrierId,
    codStateId,
    paidStateId,
    deliveredStateId,
    cancelledStateId,
    defaultStateId,
    codModule,
    codPaymentLabel,
  }

  cachedAt = now
  return cachedContext
}

export { getShopContext, invalidateShopContextCache }
