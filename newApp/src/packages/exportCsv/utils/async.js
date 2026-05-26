export async function mapWithConcurrency(items, concurrency, mapper, onProgress) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return []

  const results = new Array(list.length)
  let cursor = 0
  let done = 0
  const workerCount = Math.max(1, Math.min(concurrency || 4, list.length))

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= list.length) return
      results[index] = await mapper(list[index], index)
      done += 1
      if (typeof onProgress === 'function') {
        onProgress(done, list.length)
      }
    }
  })

  await Promise.all(workers)
  return results
}
