import Papa from 'papaparse'

const normalizeBaseUrl = (baseUrl) => (baseUrl || '').replace(/\/+$/, '')

const buildAuthHeader = (apiKey) => {
  if (!apiKey) {
    return {}
  }

  return { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
}

const parseXmlSafe = (xmlText) => {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parseErrorNode = doc.querySelector('parsererror')
  if (parseErrorNode) {
    throw new Error('Reponse XML invalide.')
  }
  return doc
}

const getResourceNode = (doc) => {
  const root = doc.querySelector('prestashop') || doc.documentElement
  if (!root) {
    return null
  }

  const children = Array.from(root.children || [])
  return children.find((child) => child.tagName !== 'errors') || null
}

const FORBIDDEN_CREATE_FIELDS = new Set(['id'])

const filterCreateFields = (fields) =>
  (fields || []).filter((field) => !FORBIDDEN_CREATE_FIELDS.has(field))

const parseCsvFile = (file) =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      delimiter: ',',
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const rawHeaders = result.meta && result.meta.fields ? result.meta.fields : []
        const headers = rawHeaders.filter(Boolean)
        if (!headers.length) {
          reject(new Error('Aucun en-tete detecte dans le fichier CSV.'))
          return
        }

        const dataRows = Array.isArray(result.data) ? result.data : []
        const rows = dataRows.filter((row) => {
          if (!row || typeof row !== 'object') {
            return false
          }
          return Object.values(row).some((value) => String(value || '').trim() !== '')
        })

        resolve({ headers, rows })
      },
      error: (error) => {
        reject(error || new Error('Impossible de lire le fichier CSV.'))
      },
    })
  })

const buildHeadersKey = (headers) => (headers && headers.length ? headers.slice().sort().join('|') : '')

const loadMappingHistory = (headers) => {
  const key = buildHeadersKey(headers)
  if (!key) {
    return null
  }

  // Historique localStorage base sur la signature exacte des entetes.
  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (error) {
    // Ignore malformed history.
  }

  return null
}

const saveMappingHistory = (headers, mapping) => {
  const key = buildHeadersKey(headers)
  if (!key) {
    return
  }

  localStorage.setItem(key, JSON.stringify(mapping || {}))
}

const normalizeText = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/[._\-\s]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const findBestMatch = (header, fields) => {
  const csvNorm = normalizeText(header)
  const normalizedFields = fields.map((field) => ({
    field,
    norm: normalizeText(field),
  }))

  // Matching textuel prioritaire: egalite exacte -> ps.includes(csv) -> csv.includes(ps)
  let candidate = normalizedFields.find((item) => item.norm === csvNorm)
  if (candidate) {
    return candidate.field
  }

  candidate = normalizedFields.find((item) => item.norm.includes(csvNorm))
  if (candidate) {
    return candidate.field
  }

  candidate = normalizedFields.find((item) => csvNorm.includes(item.norm))
  if (candidate) {
    return candidate.field
  }

  return ''
}

const resolveMapping = ({ headers, fields }) => {
  const eligibleFields = filterCreateFields(fields)
  if (!headers || !headers.length || !eligibleFields.length) {
    return { mapping: {}, source: '' }
  }

  const mapping = headers.reduce((acc, header) => {
    acc[header] = ''
    return acc
  }, {})

  const history = loadMappingHistory(headers)
  if (history) {
    headers.forEach((header) => {
      const stored = history[header]
      if (stored && eligibleFields.includes(stored)) {
        mapping[header] = stored
      }
    })

    return { mapping, source: 'history' }
  }

  headers.forEach((header) => {
    mapping[header] = findBestMatch(header, eligibleFields)
  })

  return { mapping, source: 'auto' }
}

const collectFieldPaths = (node, prefix, fields, multiLang) => {
  const children = Array.from(node.children || [])

  if (!children.length) {
    fields.push(prefix.join('.'))
    return
  }

  const hasLanguage = children.some((child) => child.tagName === 'language')
  if (hasLanguage) {
    const path = prefix.join('.')
    fields.push(path)
    multiLang.push(path)
    return
  }

  children.forEach((child) => {
    collectFieldPaths(child, [...prefix, child.tagName], fields, multiLang)
  })
}

const parseSchemaXml = (xmlText) => {
  const doc = parseXmlSafe(xmlText)
  const resourceNode = getResourceNode(doc)
  if (!resourceNode) {
    return { fields: [], multiLang: [] }
  }

  const fields = []
  const multiLang = []

  Array.from(resourceNode.children || []).forEach((child) => {
    collectFieldPaths(child, [child.tagName], fields, multiLang)
  })

  const uniqueFields = Array.from(new Set(fields))
  const filteredFields = filterCreateFields(uniqueFields)
  const filteredMultiLang = Array.from(new Set(multiLang)).filter((field) =>
    filteredFields.includes(field)
  )

  return {
    fields: filteredFields,
    multiLang: filteredMultiLang,
  }
}

const extractPrestashopError = (xmlText) => {
  if (!xmlText) {
    return ''
  }

  try {
    const doc = parseXmlSafe(xmlText)
    const errorNodes = doc.querySelectorAll('errors > error')
    if (!errorNodes.length) {
      return ''
    }

    // Extraction des messages d'erreur renvoyes par PrestaShop.
    return Array.from(errorNodes)
      .map((node) => node.querySelector('message')?.textContent || node.textContent || '')
      .map((message) => message.trim())
      .filter(Boolean)
      .join(' | ')
  } catch (error) {
    return ''
  }
}

const fetchSchemaBlank = async ({ baseUrl, apiKey, module }) => {
  const base = normalizeBaseUrl(baseUrl)
  const url = `${base}/${module}?schema=blank`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/xml',
      ...buildAuthHeader(apiKey),
    },
  })

  const xmlText = await response.text()
  if (!response.ok) {
    const message = extractPrestashopError(xmlText) || response.statusText || 'Erreur inconnue'
    throw new Error(message)
  }

  return xmlText
}

const buildXmlForRow = ({ schemaXml, mapping, row, multiLangFields }) => {
  // Construction du XML en clonant le schema blank pour chaque ligne.
  const doc = parseXmlSafe(schemaXml)
  const resourceNode = getResourceNode(doc)
  if (!resourceNode) {
    throw new Error('Structure XML inattendue.')
  }

  const multiLangSet = new Set(multiLangFields || [])
  const mappedPaths = Object.values(mapping || {}).filter(Boolean)
  const mappedFields = new Set(mappedPaths)

  const normalizeFieldValue = (fieldName, rawValue) => {
    const rawString = String(rawValue).trim()
    const leafName = fieldName.split('.').pop() || ''
    if (leafName.toLowerCase().startsWith('position')) {
      const numeric = Number(rawString.replace(',', '.'))
      if (Number.isFinite(numeric) && numeric < 1) {
        return '1'
      }
    }
    return rawString
  }

  const getOrCreateChild = (parent, tagName) => {
    const existing = Array.from(parent.children || []).find((child) => child.tagName === tagName)
    if (existing) {
      return existing
    }

    const next = doc.createElement(tagName)
    parent.appendChild(next)
    return next
  }

  const ensurePath = (segments) => {
    let current = resourceNode
    segments.forEach((segment) => {
      if (!segment) {
        return
      }
      current = getOrCreateChild(current, segment)
    })
    return current
  }

  const parseListValues = (rawValue) =>
    String(rawValue)
      .split(/[;,]/)
      .map((value) => value.trim())
      .filter(Boolean)

  const setValueAtPath = (fieldPath, rawValue) => {
    if (!fieldPath) {
      return
    }

    const segments = fieldPath.split('.').filter(Boolean)
    if (!segments.length) {
      return
    }

    const isAssociationPath = segments[0] === 'associations'
    const values = isAssociationPath ? parseListValues(rawValue) : [String(rawValue).trim()]

    if (!values.length) {
      return
    }

    if (isAssociationPath && values.length > 1 && segments.length >= 3) {
      const containerSegments = segments.slice(0, -2)
      const itemName = segments[segments.length - 2]
      const leafName = segments[segments.length - 1]
      const containerNode = ensurePath(containerSegments)

      values.forEach((value) => {
        const normalized = normalizeFieldValue(fieldPath, value)
        if (!normalized) {
          return
        }

        const itemNode = doc.createElement(itemName)
        const leafNode = doc.createElement(leafName)
        leafNode.textContent = normalized
        itemNode.appendChild(leafNode)
        containerNode.appendChild(itemNode)
      })

      return
    }

    const normalized = normalizeFieldValue(fieldPath, values[0])
    if (!normalized) {
      return
    }

    const parent = ensurePath(segments.slice(0, -1))
    const leafName = segments[segments.length - 1]
    const leafNode = getOrCreateChild(parent, leafName)

    if (multiLangSet.has(fieldPath) || leafNode.querySelector('language')) {
      const languageNode = leafNode.querySelector('language') || getOrCreateChild(leafNode, 'language')
      languageNode.textContent = normalized
      return
    }

    leafNode.textContent = normalized
  }

  // Nettoie les associations du schema pour repartir d'un XML vide.
  const associationsNodes = resourceNode.querySelectorAll('associations')
  associationsNodes.forEach((node) => node.remove())

  Object.entries(mapping || {}).forEach(([header, fieldName]) => {
    if (!fieldName) {
      return
    }

    if (FORBIDDEN_CREATE_FIELDS.has(fieldName)) {
      return
    }

    const rawValue = row[header]
    if (rawValue === undefined || rawValue === null) {
      return
    }

    setValueAtPath(fieldName, rawValue)
  })

  // Retire les champs interdits ou non mappes qui posent probleme en creation.
  if (!mappedFields.has('id')) {
    const idNode = Array.from(resourceNode.children || []).find((child) => child.tagName === 'id')
    if (idNode) {
      idNode.remove()
    }
  }

  const hasPositionMapping = mappedPaths.some((path) =>
    (path.split('.').pop() || '').toLowerCase().startsWith('position')
  )

  if (!hasPositionMapping) {
    const positionNodes = Array.from(resourceNode.querySelectorAll('*')).filter((node) => {
      const name = node.tagName || ''
      if (!name.toLowerCase().startsWith('position')) {
        return false
      }
      const value = (node.textContent || '').trim()
      if (!value) {
        return true
      }
      const numeric = Number(value.replace(',', '.'))
      return Number.isFinite(numeric) ? numeric <= 0 : false
    })

    positionNodes.forEach((node) => node.remove())
  }

  return new XMLSerializer().serializeToString(doc)
}

const submitRowXml = async ({ baseUrl, apiKey, module, xmlText }) => {
  const base = normalizeBaseUrl(baseUrl)
  const url = `${base}/${module}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/xml',
      'Content-Type': 'text/xml',
      ...buildAuthHeader(apiKey),
    },
    body: xmlText,
  })

  const responseText = await response.text()
  const psError = extractPrestashopError(responseText)

  if (!response.ok || psError) {
    const message = psError || response.statusText || 'Erreur inconnue'
    throw new Error(message)
  }

  return responseText
}

export {
  parseCsvFile,
  buildHeadersKey,
  loadMappingHistory,
  saveMappingHistory,
  normalizeText,
  resolveMapping,
  parseSchemaXml,
  fetchSchemaBlank,
  buildXmlForRow,
  submitRowXml,
  extractPrestashopError,
}
