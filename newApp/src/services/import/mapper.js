// services/zipExtractor.js
// Extraction du fichier images.zip

import JSZip from 'jszip'

/**
 * Extrait un fichier ZIP et retourne la liste des images
 * @param {File} zipFile - Le fichier ZIP uploadé
 * @returns {Promise<Array<{name: string, data: string, blob: Blob}>>}
 */
export async function extractZip(zipFile) {
  const zip = new JSZip()
  const content = await zip.loadAsync(zipFile)
  
  const images = []
  
  for (const [filename, file] of Object.entries(content.files)) {
    // Ignorer les dossiers
    if (file.dir) continue
    
    // Vérifier si c'est une image
    const ext = filename.split('.').pop().toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      const blob = await file.async('blob')
      const base64 = await file.async('base64')
      
      images.push({
        name: filename,
        data: base64,
        blob: blob,
        ext: ext
      })
    }
  }
  
  return images
}

/**
 * Extrait la référence produit à partir du nom du fichier image
 * Exemple: "tshirt_t01.jpg" → "T_01"
 * Exemple: "pantalon_p01.png" → "P_01"
 */
export function getProductReferenceFromFilename(filename) {
  // Enlever l'extension
  const baseName = filename.replace(/\.[^/.]+$/, '')
  
  // Pattern: la référence est souvent en majuscules avec underscore
  // Exemple: "T_01", "P_01", "C_03", "M_02"
  const match = baseName.match(/([A-Z]_\d{2})/i)
  if (match) {
    return match[1].toUpperCase()
  }
  
  // Fallback: chercher un pattern comme "t01"
  const fallback = baseName.match(/([a-z]_\d{2})/i)
  if (fallback) {
    return fallback[1].toUpperCase()
  }
  
  return null
}