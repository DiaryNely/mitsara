import { getXmlClient } from './xmlClient'
import { asArray, buildXML, readText, xmlToJson } from '../utils/xml'

async function getConfigurationByName(name) {
  const client = getXmlClient()
  const response = await client.get(
    `/configurations?filter[name]=[${encodeURIComponent(name)}]&display=[id,name,value]`
  )
  const json = xmlToJson(response.data)
  const configs = asArray(json.prestashop?.configurations?.configuration || [])
  return configs.find((c) => readText(c.name) === name) || null
}

async function updateConfiguration(id, name, value) {
  const client = getXmlClient()
  const xml = buildXML({
    prestashop: {
      configuration: { id, name, value },
    },
  })
  await client.put(`/configurations/${id}`, xml)
}

async function setConfigurationValue(name, value) {
  const config = await getConfigurationByName(name)
  if (!config) {
    return null
  }

  const id = readText(config.id)
  const currentValue = readText(config.value)
  await updateConfiguration(id, name, value)
  return { id, name, previousValue: currentValue }
}

function deriveImgBaseUrlHttp() {
  const proxyTarget = import.meta?.env?.VITE_PRESTASHOP_PROXY_TARGET || 'https://localhost/ps'
  try {
    const url = new URL(proxyTarget)
    const pathPrefix = url.pathname.replace(/\/+$/, '') || ''
    return `http://${url.host}${pathPrefix}/img/`
  } catch {
    return 'http://localhost/ps/img/'
  }
}

const LOGO_CONFIGS = ['PS_LOGO', 'PS_LOGO_INVOICE', 'PS_LOGO_MAIL']
const MAIL_METHOD_KEY = 'PS_MAIL_METHOD'
const MAIL_DISABLE_VALUE = '3'

// Force PS_LOGO (et variantes) à une URL HTTP absolue pour que TCPDF
// puisse charger le logo sans validation SSL (certificat auto-signé localhost).
// Si la valeur est juste un filename (ex: "logo.png"), on construit l'URL HTTP complète.
export async function patchLogoUrlToHttp(onLog) {
  const imgBaseHttp = deriveImgBaseUrlHttp()
  if (onLog) onLog(`  → Base img HTTP: ${imgBaseHttp}`)
  const results = []

  for (const name of LOGO_CONFIGS) {
    try {
      const config = await getConfigurationByName(name)
      if (!config) {
        if (onLog) onLog(`  ℹ️ ${name} introuvable`)
        continue
      }

      const id = readText(config.id)
      const currentValue = (readText(config.value) || '').trim()
      if (onLog) onLog(`  → ${name} actuel: "${currentValue}" (id=${id})`)

      if (!currentValue) {
        if (onLog) onLog(`  ℹ️ ${name} vide, aucune modification`)
        continue
      }

      if (currentValue.startsWith('http://')) {
        if (onLog) onLog(`  ℹ️ ${name} déjà en HTTP`)
        continue
      }

      let newValue
      if (currentValue.startsWith('https://')) {
        newValue = currentValue.replace(/^https:\/\//, 'http://')
      } else {
        // Filename brut (ex: "logo.png") → URL HTTP absolue.
        // Sinon PrestaShop préfixe avec https:// à cause de PS_SSL_ENABLED.
        newValue = `${imgBaseHttp}${currentValue}`
      }

      await updateConfiguration(id, name, newValue)
      if (onLog) onLog(`  ✅ ${name}: "${currentValue}" → "${newValue}"`)
      results.push({ name, id, originalValue: currentValue, newValue })
    } catch (err) {
      const detail = err?.response?.status
        ? `HTTP ${err.response.status} - ${err.message}`
        : err?.message || String(err)
      if (onLog) onLog(`  ⚠️ ${name}: ${detail}`, 'warn')
    }
  }

  if (onLog) {
    if (results.length) {
      onLog(`  🔧 ${results.length} config(s) mise(s) à jour pour TCPDF`)
    } else {
      onLog(`  ⚠️ Aucune config logo modifiée (vérifie les permissions WebService)`, 'warn')
    }
  }

  return results
}

// Désactive l'envoi d'emails en mettant PS_MAIL_METHOD=3.
// Retourne un snapshot pour restauration.
export async function disableEmailSending(onLog) {
  try {
    const snapshot = await setConfigurationValue(MAIL_METHOD_KEY, MAIL_DISABLE_VALUE)
    if (!snapshot) {
      if (onLog) onLog('  ⚠️ PS_MAIL_METHOD introuvable, emails non désactivés', 'warn')
      return null
    }
    if (onLog) onLog(`  ✉️ Emails désactivés (PS_MAIL_METHOD=${MAIL_DISABLE_VALUE})`)
    return snapshot
  } catch (err) {
    if (onLog) onLog(`  ⚠️ Désactivation emails échouée: ${err?.message || err}`, 'warn')
    return null
  }
}

export async function restoreEmailSending(snapshot, onLog) {
  if (!snapshot || !snapshot.name) {
    return
  }

  try {
    await updateConfiguration(snapshot.id, snapshot.name, snapshot.previousValue ?? '')
    if (onLog) {
      const value = snapshot.previousValue ?? ''
      onLog(`  ✉️ Emails restaurés (PS_MAIL_METHOD=${value})`)
    }
  } catch (err) {
    if (onLog) onLog(`  ⚠️ Restauration emails échouée: ${err?.message || err}`, 'warn')
  }
}
