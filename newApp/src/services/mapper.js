const normalizeCategoryName = (value) => {
  if (value === undefined || value === null) {
    return ''
  }

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const slug = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'categorie'
}

export { normalizeCategoryName }
