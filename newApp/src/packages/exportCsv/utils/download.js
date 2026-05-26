export function triggerCsvDownload(payload = {}) {
  const filename = payload.filename || 'export.csv'
  const csvText = payload.csvText || ''
  const mimeType = payload.mimeType || 'text/csv;charset=utf-8'

  if (typeof document === 'undefined') {
    throw new Error('triggerCsvDownload requires a browser environment.')
  }

  const blob = new Blob([csvText], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'

  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  URL.revokeObjectURL(url)
}
