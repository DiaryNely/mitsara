export async function fetchAllByOffset(fetchPage, opts = {}) {
  const pageSize = Number(opts.pageSize || 200)
  const maxItems = opts.maxItems == null ? Infinity : Number(opts.maxItems)
  const items = []
  let offset = 0

  while (items.length < maxItems) {
    const batch = await fetchPage({ limit: pageSize, offset })
    const list = Array.isArray(batch) ? batch : []
    items.push(...list)

    if (list.length < pageSize) break
    offset += pageSize
  }

  if (items.length > maxItems) {
    return items.slice(0, maxItems)
  }
  return items
}

export async function fetchAllByPage(fetchPage, opts = {}) {
  const pageSize = Number(opts.pageSize || 200)
  const maxItems = opts.maxItems == null ? Infinity : Number(opts.maxItems)
  const items = []
  let page = 1

  while (items.length < maxItems) {
    const result = await fetchPage({ page, pageSize })
    const list = Array.isArray(result?.items) ? result.items : []
    items.push(...list)

    if (!result?.hasMore || list.length < pageSize) break
    page += 1
  }

  if (items.length > maxItems) {
    return items.slice(0, maxItems)
  }
  return items
}
