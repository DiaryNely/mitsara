// services/imageUploader.js
// Upload des images vers PrestaShop via API

import { xmlToJson, readText } from '../../utils/xml'

const getApiBaseUrl = () => {
  const raw = import.meta.env.VITE_PRESTASHOP_API_BASE_URL
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
}

const buildAuthHeader = () => {
  const apiKey = import.meta.env.VITE_PRESTASHOP_API_KEY
  if (!apiKey) {
    return {}
  }
  return { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
}

const inferMimeType = (filename) => {
  if (typeof filename !== 'string') return 'image/jpeg'
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

const base64ToBlob = (imageBase64, filename) => {
  const byteCharacters = atob(imageBase64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: inferMimeType(filename) })
}

/**
 * Upload une image pour un produit PrestaShop.
 * Accepte soit un Blob (nouveau chemin optimisé via JSZip 'blob'),
 * soit une chaîne base64 (rétro-compatibilité).
 * Retourne l'imageId créé (string) ou null si non parseable.
 */
export async function uploadProductImage(productId, imageData, filename, cover = false) {
  const blob = imageData instanceof Blob ? imageData : base64ToBlob(imageData, filename)

  const formData = new FormData()
  formData.append('image', blob, filename)
  if (cover) {
    formData.append('cover', '1')
  }

  const apiBaseUrl = getApiBaseUrl()
  const url = `${apiBaseUrl}/images/products/${productId}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...buildAuthHeader() },
      body: formData,
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || `HTTP ${response.status}`)
    }

    const responseText = await response.text()
    try {
      const json = xmlToJson(responseText)
      const imageId = readText(json.prestashop?.image?.id)
      return imageId || null
    } catch {
      return null
    }
  } catch (error) {
    console.error(`Erreur upload image ${filename}:`, error)
    throw error
  }
}

const UPLOAD_CONCURRENCY = 5

const pickImagePayload = (image) => {
  if (image && image.blob instanceof Blob) return image.blob
  if (image && typeof image.data === 'string') return image.data
  return null
}

/**
 * Upload plusieurs images pour un produit.
 * Conserve l'ordre des résultats (la 1re image = cover) et borne la concurrence
 * pour ne pas saturer le webservice PrestaShop.
 * Retourne un tableau de {success, filename, imageId?}.
 */
export async function uploadProductImages(productId, images, onProgress) {
  const results = new Array(images.length)

  const uploadOne = async (index) => {
    const image = images[index]
    const filename = image.name || image.filename || `image-${index + 1}.jpg`
    const payload = pickImagePayload(image)

    if (!payload) {
      results[index] = { success: false, filename, error: 'Image vide', imageId: null }
      if (onProgress) onProgress(`❌ Erreur: ${filename}`)
      return
    }

    try {
      const imageId = await uploadProductImage(productId, payload, filename, index === 0)
      results[index] = { success: true, filename, imageId }
      if (onProgress) onProgress(`Image ${filename} uploadée`)
    } catch (error) {
      results[index] = { success: false, filename, error: error.message, imageId: null }
      if (onProgress) onProgress(`❌ Erreur: ${filename}`)
    }
  }

  if (!images.length) return results

  // La cover (index 0) doit être uploadée AVANT les autres pour éviter
  // une race condition côté PrestaShop sur l'image par défaut.
  await uploadOne(0)

  let cursor = 1
  const runWorker = async () => {
    while (true) {
      const index = cursor++
      if (index >= images.length) return
      await uploadOne(index)
    }
  }

  const remaining = images.length - 1
  const workerCount = Math.max(1, Math.min(UPLOAD_CONCURRENCY, remaining))
  const workers = Array.from({ length: workerCount }, runWorker)
  await Promise.all(workers)

  return results
}