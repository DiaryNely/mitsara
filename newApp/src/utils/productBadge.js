const parseLocalDate = (value) => {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const text = String(value).trim()
  if (!text) {
    return null
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4] || 0)
    const minute = Number(match[5] || 0)
    const second = Number(match[6] || 0)

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
      return null
    }

    const date = new Date(year, month - 1, day, hour, minute, second)
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null
    }
    return date
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getProductBadge = (dateAvailability) => {
  // Use local time to compute day distance; future or invalid dates return no badge.
  const date = parseLocalDate(dateAvailability)
  if (!date) {
    return ''
  }

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) {
    return ''
  }

  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays <= 1) {
    return 'HOT'
  }
  if (diffDays <= 7) {
    return 'NEW'
  }
  return ''
}

export { getProductBadge }
