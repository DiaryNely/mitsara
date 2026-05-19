const readEnv = (key) => {
  const value = import.meta.env[key]
  return typeof value === 'string' ? value.trim() : ''
}

const requireEnv = (key) => {
  const value = readEnv(key)
  if (!value) {
    throw new Error(`Missing env ${key}`)
  }
  return value
}

const getWebserviceEnv = () => {
  return {
    apiBaseUrl: requireEnv('VITE_PRESTASHOP_API_BASE_URL'),
    apiKey: requireEnv('VITE_PRESTASHOP_API_KEY'),
  }
}

const getAdminEnv = () => {
  const adminDir = requireEnv('VITE_PRESTASHOP_ADMIN_DIR')
  const adminBasePath = readEnv('VITE_PRESTASHOP_ADMIN_BASE_PATH') || `/ps/${adminDir}`

  return {
    adminDir,
    adminBasePath,
  }
}

export { readEnv, requireEnv, getWebserviceEnv, getAdminEnv }
