import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const requireEnv = (key) => {
    const value = env[key]
    if (!value) {
      throw new Error(`Missing env ${key}`)
    }
    return value
  }

  const proxyTargetRaw = requireEnv('VITE_PRESTASHOP_PROXY_TARGET')
  const apiBaseUrl = requireEnv('VITE_PRESTASHOP_API_BASE_URL')
  const adminDir = requireEnv('VITE_PRESTASHOP_ADMIN_DIR')
  const adminBasePath = env.VITE_PRESTASHOP_ADMIN_BASE_PATH || `/ps/${adminDir}`

  const proxyTarget = proxyTargetRaw.replace(/\/+$/, '')
  const targetHasPs = /\/ps$/.test(proxyTarget)

  const normalizePath = (value) => {
    if (!value) {
      return ''
    }
    if (/^https?:\/\//.test(value)) {
      try {
        return new URL(value).pathname || '/'
      } catch (error) {
        return value
      }
    }
    return value.startsWith('/') ? value : `/${value}`
  }

  const apiPath = normalizePath(apiBaseUrl)
  const adminPath = normalizePath(adminBasePath)
  const stripPsPrefix = (path) => path.replace(/^\/ps(?=\/|$)/, '')

  return {
    plugins: [vue()],
    server: {
      proxy: {
        [apiPath]: {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          ...(targetHasPs ? { rewrite: stripPsPrefix } : {}),
        },
        [adminPath]: {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: 'localhost',
          ...(targetHasPs ? { rewrite: stripPsPrefix } : {}),
        },
        '/ps/index.php': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          ...(targetHasPs ? { rewrite: stripPsPrefix } : {}),
        },
      },
    },
  }
})
