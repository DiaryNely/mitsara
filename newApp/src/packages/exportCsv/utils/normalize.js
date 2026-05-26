export const toText = (value) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

export const toBoolFlag = (value) => (value ? '1' : '0')

export const toNumberText = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? String(num) : ''
}
