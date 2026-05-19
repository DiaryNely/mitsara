const parseXml = (xmlText) => {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid XML response')
  }
  return doc
}

const getXmlText = (node, selector) => {
  if (!node) {
    return ''
  }
  const target = selector ? node.querySelector(selector) : node
  if (!target) {
    return ''
  }
  return (target.textContent || '').trim()
}

const getXmlAttr = (node, attrName, selector) => {
  if (!node) {
    return ''
  }
  const target = selector ? node.querySelector(selector) : node
  if (!target || !target.getAttribute) {
    return ''
  }
  return target.getAttribute(attrName) || ''
}

const xmlElementToObject = (element) => {
  if (!element) {
    return null
  }

  const result = {}
  if (element.attributes && element.attributes.length) {
    result['@attributes'] = Array.from(element.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value
      return acc
    }, {})
  }

  const childElements = Array.from(element.children || [])
  if (!childElements.length) {
    const text = (element.textContent || '').trim()
    if (text) {
      result['#text'] = text
    }
    return result
  }

  childElements.forEach((child) => {
    const key = child.tagName
    const value = xmlElementToObject(child)

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

const parseEmployeeXml = (xmlText) => {
  const doc = parseXml(xmlText)
  const root = doc.querySelector('prestashop') || doc
  const employee = root.querySelector('employee')
  if (!employee) {
    return null
  }

  const id = getXmlText(employee, 'id') || getXmlAttr(employee, 'id')
  const firstname = getXmlText(employee, 'firstname')
  const lastname = getXmlText(employee, 'lastname')
  const email = getXmlText(employee, 'email')
  const active = getXmlText(employee, 'active')
  const profileId = getXmlText(employee, 'id_profile')

  return {
    id,
    firstname,
    lastname,
    email,
    active,
    profileId,
  }
}

export { parseXml, getXmlText, getXmlAttr, xmlElementToObject, parseEmployeeXml }
