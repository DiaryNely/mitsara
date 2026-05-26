const pad2 = (value) => String(value).padStart(2, '0')

export function buildCsvFilename(prefix, opts = {}) {
  const now = opts.date instanceof Date ? opts.date : new Date()
  const datePart = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
  ].join('')
  const timePart = [pad2(now.getHours()), pad2(now.getMinutes()), pad2(now.getSeconds())].join('')
  const safePrefix = String(prefix || 'export').replace(/[^a-zA-Z0-9_-]+/g, '-')
  return `${safePrefix}-${datePart}-${timePart}.csv`
}
