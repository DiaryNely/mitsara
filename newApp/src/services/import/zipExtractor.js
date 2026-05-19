// services/zipExtractor.js
// Extraction du fichier ZIP contenant les images

import JSZip from 'jszip'

/**
 * Extrait un fichier ZIP et retourne la liste des images
 * @returns {Promise<Array<{name: string, filename: string, data: string, mimeType: string, size: number}>>}
 */
export async function extractZip(zipFile, onLog) {
  const jszip = new JSZip()
  const zipContent = await jszip.loadAsync(zipFile)
  
  const images = []
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

  const normalizePath = (name) => String(name || '').replace(/\\/g, '/').replace(/^\//, '')
  const getBasename = (name) => {
    const normalized = normalizePath(name)
    const parts = normalized.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : normalized
  }
  const isMacOsJunkFile = (name) => {
    const normalized = normalizePath(name)
    const parts = normalized.split('/').filter(Boolean)
    const base = getBasename(normalized)

    if (parts.includes('__MACOSX')) return true
    if (base === '.DS_Store') return true
    if (base.startsWith('._')) return true
    return false
  }

  let ignoredMacFiles = 0
  
  for (const [filename, file] of Object.entries(zipContent.files)) {
    if (file.dir) continue
    if (!filename) {
      if (typeof onLog === 'function') {
        onLog('⚠️ Fichier ZIP sans nom, ignore', 'error')
      }
      continue
    }

    if (isMacOsJunkFile(filename)) {
      ignoredMacFiles++
      continue
    }

    const lowerName = String(filename).toLowerCase()
    const dotIndex = lowerName.lastIndexOf('.')
    if (dotIndex <= 0) {
      if (typeof onLog === 'function') {
        onLog(`⚠️ Extension introuvable pour: ${filename}`, 'error')
      }
      continue
    }

    const ext = lowerName.substring(dotIndex)
    if (!imageExtensions.includes(ext)) continue

    const mimeType = getMimeType(ext)
    // Extraction directe en Blob (évite l'encodage base64 puis re-décodage côté upload).
    const blob = await file.async('blob')
    const typedBlob = blob.type ? blob : new Blob([blob], { type: mimeType })

    images.push({
      name: filename,
      filename: filename,
      blob: typedBlob,
      mimeType: typedBlob.type || mimeType,
      size: typedBlob.size || file._data?.uncompressedSize || 0,
    })
  }

  if (ignoredMacFiles > 0 && typeof onLog === 'function') {
    onLog(`ℹ️ ${ignoredMacFiles} fichiers macOS ignorés (__MACOSX/ et ._*)`)
  }
  
  return images
}

/**
 * Cherche la référence produit correspondant au nom de fichier image,
 * UNIQUEMENT dans la liste des références importées depuis le CSV.
 *
 * Règle métier : la seule source de vérité est la référence CSV. Aucune
 * heuristique de "devinette" — si le fichier ne correspond à aucune référence
 * CSV, on retourne null et l'image est ignorée (avec log).
 *
 * Le match est tenté dans cet ordre :
 *  1. Match exact case-sensitive du basename (sans extension) avec une référence CSV.
 *  2. Match exact case-insensitive.
 *  3. Match par inclusion : une référence CSV est contenue dans le basename
 *     (ex: "produit_HOT_001.png" contient "HOT_001"). En cas de plusieurs
 *     candidats, on prend la référence la plus longue (évite qu'une sous-séquence
 *     gagne, ex: "T_01" qui serait contenu dans "HOT_01").
 *
 * @param {string} filename  Nom du fichier image (avec/sans chemin et extension)
 * @param {string[]} csvReferences  Références produits importées depuis le CSV
 * @returns {string|null} la référence CSV exacte trouvée, ou null si aucune correspondance
 */
export function getProductReferenceFromFilename(filename, csvReferences) {
  if (!filename) return null
  if (!Array.isArray(csvReferences) || !csvReferences.length) return null

  // Basename sans extension.
  const rawBase = String(filename).replace(/\\/g, '/').split('/').pop() || ''
  const name = rawBase.replace(/\.[^/.]+$/, '').trim()
  if (!name) return null

  // 1) Match exact case-sensitive (le plus précis)
  if (csvReferences.includes(name)) return name

  // 2) Match exact case-insensitive
  const lowerName = name.toLowerCase()
  const ciExact = csvReferences.find((ref) => String(ref).toLowerCase() === lowerName)
  if (ciExact) return ciExact

  // 3) Référence CSV contenue dans le basename — la plus longue gagne.
  const containedMatches = csvReferences
    .filter((ref) => {
      const r = String(ref || '').trim()
      return r && lowerName.includes(r.toLowerCase())
    })
    .sort((a, b) => String(b).length - String(a).length)

  if (containedMatches.length) return containedMatches[0]

  return null
}

function getMimeType(ext) {
  const mimes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  }
  return mimes[ext] || 'image/jpeg'
}