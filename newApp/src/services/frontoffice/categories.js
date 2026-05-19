import { createXmlClient, normalizeApiUrl } from '../../api/xmlClient'
import { getWebserviceEnv } from '../../config/runtimeEnv'
import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'

const getClient = () => {
  const { apiBaseUrl, apiKey } = getWebserviceEnv()
  return createXmlClient({ apiUrl: normalizeApiUrl(apiBaseUrl), apiKey })
}

const readLocalized = (value) => {
  if (!value) {
    return ''
  }
  const languages = asArray(value.language)
  const preferred = languages.find((lang) => readText(lang)) || languages[0]
  return readText(preferred)
}

const parseCategories = (xmlText) => {
  const json = xmlToJson(xmlText)
  const root = json.prestashop || {}
  const categoriesRoot = root.categories || json.categories || {}
  const nodes = asArray(categoriesRoot.category)

  return nodes.map((category) => ({
    id: readText(category.id) || readAttr(category, 'id'),
    name: readLocalized(category.name),
  }))
}

const getFrontCategories = async () => {
  const client = getClient()
  const response = await client.get('/categories?display=[id,name]')
  return parseCategories(response.data)
}

export { getFrontCategories }
