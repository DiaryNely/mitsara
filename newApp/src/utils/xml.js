const parseXmlDocument = (xmlText) => {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid XML response')
  }
  return doc
}

const nodeAttributesToObject = (node) => {
  const attrs = {}
  if (!node.attributes) {
    return attrs
  }

  Array.from(node.attributes).forEach((attr) => {
    attrs[attr.name] = attr.value
  })

  return attrs
}

const elementToJson = (element) => {
  const result = {}

  const attributes = nodeAttributesToObject(element)
  const hasAttributes = Object.keys(attributes).length > 0

  const childElements = Array.from(element.children || [])

  if (!childElements.length) {
    const text = element.textContent ? element.textContent.trim() : ''
    if (!hasAttributes) {
      return text
    }

    result['@attributes'] = attributes
    if (text) {
      result['#text'] = text
    }
    return result
  }

  if (hasAttributes) {
    result['@attributes'] = attributes
  }

  childElements.forEach((child) => {
    const key = child.tagName
    const value = elementToJson(child)

    if (result[key] === undefined) {
      result[key] = value
      return
    }

    if (!Array.isArray(result[key])) {
      result[key] = [result[key]]
    }

    result[key].push(value)
  })

  return result
}

const xmlToJson = (xmlText) => {
  const doc = parseXmlDocument(xmlText)
  const root = doc.documentElement
  if (!root) {
    return {}
  }

  return {
    [root.tagName]: elementToJson(root),
  }
}

const readText = (value) => {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && typeof value['#text'] === 'string') {
    return value['#text']
  }
  return ''
}

const readAttr = (value, attrName) => {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const attrs = value['@attributes']
  if (!attrs || typeof attrs !== 'object') {
    return ''
  }

  return typeof attrs[attrName] === 'string' ? attrs[attrName] : ''
}

const asArray = (value) => {
  if (Array.isArray(value)) {
    return value
  }
  if (value === undefined || value === null) {
    return []
  }
  return [value]
}

const escapeXml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const buildAttributes = (value) => {
  const attrs = []

  if (value && typeof value === 'object' && value['@attributes']) {
    Object.entries(value['@attributes']).forEach(([key, val]) => {
      if (val === undefined || val === null) {
        return
      }
      attrs.push(`${key}="${escapeXml(val)}"`)
    })
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, val]) => {
      if (!key.startsWith('@_')) {
        return
      }
      if (val === undefined || val === null) {
        return
      }
      const attrName = key.slice(2)
      attrs.push(`${attrName}="${escapeXml(val)}"`)
    })
  }

  return attrs.length ? ` ${attrs.join(' ')}` : ''
}

const buildElement = (name, value) => {
  if (Array.isArray(value)) {
    return value.map((item) => buildElement(name, item)).join('')
  }

  if (value === undefined || value === null) {
    return `<${name}></${name}>`
  }

  if (typeof value !== 'object') {
    return `<${name}>${escapeXml(value)}</${name}>`
  }

  const attrs = buildAttributes(value)
  const text = value['#text']
  const childEntries = Object.entries(value).filter(([key]) => {
    return key !== '#text' && key !== '@attributes' && !key.startsWith('@_')
  })
  const children = childEntries.map(([key, val]) => buildElement(key, val)).join('')

  if (!children && (text === undefined || text === null || text === '')) {
    return `<${name}${attrs}></${name}>`
  }

  const textValue = text !== undefined && text !== null ? escapeXml(text) : ''
  return `<${name}${attrs}>${textValue}${children}</${name}>`
}

const buildXML = (value) => {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const entries = Object.entries(value)
  if (!entries.length) {
    return ''
  }

  const xmlBody = entries.map(([key, val]) => buildElement(key, val)).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>${xmlBody}`
}

export { parseXmlDocument, xmlToJson, readText, readAttr, asArray, buildXML }
