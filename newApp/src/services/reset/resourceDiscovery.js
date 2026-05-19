import { asArray, readAttr, readText, xmlToJson } from '../../utils/xml'
import { getApiResources, getResourceSchemaSynopsis } from './apiClient'

const extractResourceFromHref = (href) => {
  if (!href) {
    return ''
  }

  const clean = href.split('?')[0]
  const parts = clean.split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

const parseSchemaAssociations = (resource, xmlText) => {
  const json = xmlToJson(xmlText)
  const prestashop = json.prestashop || {}
  const root = prestashop[resource] || json[resource] || {}
  const associations = root.associations || {}
  const entries = []

  Object.entries(associations).forEach(([key, value]) => {
    if (key.startsWith('@')) {
      return
    }

    const values = asArray(value)
    values.forEach((item) => {
      const attrs = item && typeof item === 'object' ? item['@attributes'] || {} : {}
      const api = attrs.api || attrs['xlink:href'] || ''
      const assocResource = extractResourceFromHref(api) || key

      entries.push({
        name: key,
        resource: assocResource,
        attributes: attrs,
      })
    })
  })

  return entries
}

const parseSchemaFields = (resource, xmlText) => {
  const json = xmlToJson(xmlText)
  const prestashop = json.prestashop || {}
  const root = prestashop[resource] || json[resource] || {}
  const fields = root.fields || {}
  const entries = []

  Object.entries(fields).forEach(([key, value]) => {
    if (key.startsWith('@')) {
      return
    }

    const attrs = value && typeof value === 'object' ? value['@attributes'] || {} : {}

    entries.push({
      name: key,
      attributes: attrs,
    })
  })

  return entries
}

const discoverResources = async () => getApiResources()

const loadResourceSchema = async (resource) => {
  const xmlText = await getResourceSchemaSynopsis(resource)
  return {
    resource,
    associations: parseSchemaAssociations(resource, xmlText),
    fields: parseSchemaFields(resource, xmlText),
    rawXml: xmlText,
  }
}

export { discoverResources, loadResourceSchema, parseSchemaAssociations, parseSchemaFields, extractResourceFromHref }
