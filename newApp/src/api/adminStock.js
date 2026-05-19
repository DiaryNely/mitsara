// api/adminStock.js
// Utilise l'API Symfony interne de PrestaShop admin (index.php/api/stocks/product/{id}).
// Cette API met à jour stock_available ET crée ps_stock_mvt automatiquement.

import axios from 'axios'
import { getAdminBasePath, getStoredAdminSession } from '../services/auth/adminAuthService'

let _cachedCsrfToken = null

function buildAdminClient() {
  return axios.create({
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/** Essaie d'extraire un token CSRF depuis un HTML brut (tous les patterns connus). */
function extractTokenFromHtml(rawHtml) {
  const decoded = decodeHtmlEntities(rawHtml)

  const patterns = [
    /data-csrf-token="([^"]+)"/,
    /<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/i,
    /<meta[^>]+content="([^"]+)"[^>]+name="csrf-token"/i,
    /"csrf_token"\s*:\s*"([A-Za-z0-9_\-]{20,})"/,
    /"csrf_token":"([A-Za-z0-9_\-]{20,})"/,
    /csrf_token\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]/,
    /name="_token"\s+value="([A-Za-z0-9_\-]{20,})"/,
    /value="([A-Za-z0-9_\-]{30,})"\s+name="_token"/,
    /"_token"\s*:\s*"([A-Za-z0-9_\-]{20,})"/,
    /data-token="([A-Za-z0-9_\-]{30,})"/,
    /[?&]_token=([A-Za-z0-9_\-]{20,})/,
  ]

  for (const p of patterns) {
    let m = p.exec(rawHtml)
    if (m?.[1]) return m[1]
    m = p.exec(decoded)
    if (m?.[1]) return m[1]
  }

  // <script type="application/json"> blocks
  for (const m of rawHtml.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1])
      if (obj?.csrf_token) return obj.csrf_token
      if (obj?._token)     return obj._token
    } catch { /* continue */ }
  }

  // data-props / data-context / data-settings attributes (JSON)
  for (const m of rawHtml.matchAll(/data-(?:props|context|settings|app-data)=["']([^"']+)["']/gi)) {
    try {
      const obj = JSON.parse(decodeHtmlEntities(m[1]))
      if (obj?.csrf_token) return obj.csrf_token
      if (obj?._token)     return obj._token
    } catch { /* continue */ }
  }

  return null
}

function isLoginPage(html) {
  return (
    html.includes('submitLogin') ||
    html.includes('id="login_form"') ||
    html.includes('controller=AdminLogin')
  )
}

/**
 * Récupère le token CSRF en interrogeant plusieurs pages admin candidates.
 * Le token Symfony (intent "update_stock") est le même pour toute la session.
 * Mis en cache après le premier appel réussi.
 *
 * @param {string|number} [productId]  — si fourni, la page d'édition produit est prioritaire
 */
async function fetchCsrfToken(productId) {
  if (_cachedCsrfToken) return _cachedCsrfToken

  const session  = getStoredAdminSession()
  const basePath = getAdminBasePath()

  if (!session?.adminToken) {
    throw new Error('Session admin introuvable — reconnectez-vous.')
  }

  const t = session.adminToken

  // Pages candidates, du plus probable au moins probable
  const candidates = [
    // 1. Page d'édition produit (Symfony nouvelle interface)
    ...(productId
      ? [
          `${basePath}/index.php/sell/catalog/products/edit/${productId}?token=${t}`,
          `${basePath}/index.php/sell/catalog/products-v2/edit/${productId}?token=${t}`,
        ]
      : []),
    // 2. Liste des produits (nouvelle interface)
    `${basePath}/index.php/sell/catalog/products?token=${t}`,
    // 3. Page stock (peut exister selon la config)
    `${basePath}/index.php/sell/catalog/stocks?token=${t}`,
    // 4. Dashboard Symfony
    `${basePath}/index.php/common/security/token?token=${t}`,
    // 5. Dashboard legacy (a toujours existé en PS)
    `${basePath}/index.php?controller=AdminDashboard&token=${t}`,
  ]

  const debugResults = []

  for (const url of candidates) {
    let html = ''
    let status = null

    try {
      const resp = await axios.get(url, { withCredentials: true })
      status = resp.status
      html   = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
    } catch (err) {
      status = err?.response?.status ?? 'ERR'
      html   = ''
      debugResults.push({ url, status, result: 'request error' })
      continue
    }

    if (!html || html.length < 100 || isLoginPage(html)) {
      debugResults.push({ url, status, result: 'page de login ou vide', length: html.length })
      continue
    }

    const token = extractTokenFromHtml(html)

    if (token) {
      console.debug(`[adminStock] Token CSRF trouvé via : ${url}`)
      _cachedCsrfToken = token
      return token
    }

    debugResults.push({ url, status, result: 'token introuvable', length: html.length })
  }

  // Aucune page n'a fourni le token → log complet pour diagnostic
  console.group('[adminStock] Token CSRF introuvable — résumé des tentatives')
  console.table(debugResults)

  // Charger et afficher un extrait de la page la moins vide (pour trouver le bon pattern)
  const best = debugResults.find((r) => r.length > 200)
  if (best) {
    try {
      const r = await axios.get(best.url, { withCredentials: true })
      const html = typeof r.data === 'string' ? r.data : ''
      console.log(`HTML de "${best.url}" (2000 chars) :`)
      console.log(html.slice(0, 2000))
      const contexts = [...html.matchAll(/[^\s]{0,30}(?:csrf|_token|data-token)[^\s<"]{0,60}/gi)]
        .slice(0, 15).map((m) => m[0])
      console.log('Occurrences "token" :', contexts)
    } catch { /* ignore */ }
  }
  console.groupEnd()

  throw new Error(
    'Token CSRF introuvable sur toutes les pages testées. ' +
    'Vérifiez la console → "[adminStock]" pour le détail des tentatives.'
  )
}

export function invalidateCsrfCache() {
  _cachedCsrfToken = null
}

/**
 * Lit les mouvements de stock via l'API admin interne PS.
 * GET /admin/index.php/api/stock-movements/
 *
 * Supporte pagination, tri et filtre produit côté serveur — contrairement au WS
 * qui génère des 500 sur filter[id_product] (bug JOIN SQL PS).
 *
 * @param {object} params
 *   page_index  — numéro de page (1-based, défaut 1)
 *   page_size   — éléments par page (défaut 25)
 *   order       — ex. 'date_add desc' (défaut)
 *   product_id  — filtre par produit (optionnel)
 */
export async function adminGetStockMovements(params = {}) {
  const csrfToken = await fetchCsrfToken()
  const basePath  = getAdminBasePath()
  const client    = axios.create({ withCredentials: true })

  const query = new URLSearchParams()
  query.set('_token',     csrfToken)
  query.set('order',      params.order      || 'date_add desc')
  query.set('page_size',  String(params.page_size  || 25))
  query.set('page_index', String(params.page_index || 1))

  if (params.product_id) {
    query.set('product_id', String(params.product_id))
  }

  let resp
  try {
    resp = await client.get(
      `${basePath}/index.php/api/stock-movements/?${query}`
    )
  } catch (err) {
    if (err?.response?.status === 403 || err?.response?.status === 401) {
      invalidateCsrfCache()
      throw new Error('Token CSRF expiré. Réessayez.')
    }
    throw new Error(`Erreur mouvements admin : ${err.message}`)
  }

  const data = resp.data

  // PS peut retourner { movements: [...], total: N } ou { data: [...], meta: {...} }
  const movements = data?.movements ?? data?.data ?? (Array.isArray(data) ? data : [])
  const total     = data?.total     ?? data?.meta?.total ?? movements.length

  return { movements, total }
}


/**
 * Met à jour le stock via l'API interne PS admin.
 * Crée automatiquement l'entrée dans ps_stock_mvt.
 *
 * @param {number|string} productId
 * @param {number|string} attributeId  — 0 = produit simple
 * @param {number}        delta        — positif = entrée, négatif = sortie
 * @returns {{ newQuantity: number|null }}
 */
export async function adminUpdateStock(productId, attributeId, delta) {
  // Passe le productId pour que fetchCsrfToken essaie la page d'édition produit en priorité
  const csrfToken = await fetchCsrfToken(productId)
  const basePath  = getAdminBasePath()
  const client    = buildAdminClient()

  let resp
  try {
    resp = await client.post(
      `${basePath}/index.php/api/stocks/product/${productId}?_token=${csrfToken}`,
      {
        delta:          Number(delta),
        combination_id: attributeId ? Number(attributeId) : 0,
      }
    )
  } catch (err) {
    if (err?.response?.status === 403 || err?.response?.status === 401) {
      invalidateCsrfCache()
      throw new Error(
        `Token CSRF refusé (${err.response.status}). ` +
        'Cache vidé — réessayez ou reconnectez-vous.'
      )
    }
    const detail = err?.response?.data
      ? JSON.stringify(err.response.data)
      : err.message
    throw new Error(`Échec mise à jour stock : ${detail}`)
  }

  const data = resp.data ?? {}
  const newQuantity =
    data?.stock?.quantity                   ??
    data?.product_available_stock?.quantity ??
    data?.quantity                          ??
    null

  return { newQuantity, movements: data?.movements ?? [], raw: data }
}
