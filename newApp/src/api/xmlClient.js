import axios from 'axios'

let xmlClient = null
let responseInterceptorId = null

const normalizeApiUrl = (apiUrl) => {
  if (!apiUrl) {
    return ''
  }
  return apiUrl.replace(/\/+$/, '')
}

const buildHeaders = (apiKey) => {
  const headers = {
    Accept: 'application/xml',
    'Content-Type': 'application/xml',
    'Output-Format': 'XML',
  }

  if (apiKey) {
    headers.Authorization = `Basic ${btoa(`${apiKey}:`)}`
  }

  return headers
}

const attachAuthInterceptors = (client, onAuthError) => {
  const handler = typeof onAuthError === 'function' ? onAuthError : null

  const id = client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status
      if (status === 401 || status === 403 || status === 503) {
        if (handler) {
          handler(status, error)
        }
      }
      return Promise.reject(error)
    }
  )

  return id
}

const createXmlClient = ({ apiUrl, apiKey, onAuthError } = {}) => {
  const client = axios.create({
    baseURL: normalizeApiUrl(apiUrl),
    headers: buildHeaders(apiKey),
    responseType: 'text',
    transformResponse: [(data) => data],
  })

  const interceptorId = attachAuthInterceptors(client, onAuthError)
  client.__psResponseInterceptorId = interceptorId

  return client
}

const initXmlClient = ({ apiUrl, apiKey, onAuthError } = {}) => {
  destroyXmlClient()
  xmlClient = createXmlClient({ apiUrl, apiKey, onAuthError })
  responseInterceptorId = xmlClient.__psResponseInterceptorId
  return xmlClient
}

const getXmlClient = () => {
  if (!xmlClient) {
    throw new Error('XML client not initialized')
  }
  return xmlClient
}

const destroyXmlClient = () => {
  if (!xmlClient) {
    return
  }

  if (responseInterceptorId !== null) {
    xmlClient.interceptors.response.eject(responseInterceptorId)
  }

  responseInterceptorId = null
  xmlClient = null
}

export {
  createXmlClient,
  initXmlClient,
  getXmlClient,
  destroyXmlClient,
  normalizeApiUrl,
}
