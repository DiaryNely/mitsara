import { sleep, withRetry } from './retry'

const chunkArray = (items, size) => {
  if (!items.length) {
    return []
  }

  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const createBatchProcessor = (options = {}) => {
  const {
    batchSize = 25,
    concurrency = 4,
    retryCount = 2,
    retryDelayMs = 400,
    onLog,
    onProgress,
  } = options

  let paused = false
  let cancelled = false

  const pause = () => {
    paused = true
  }

  const resume = () => {
    paused = false
  }

  const cancel = () => {
    cancelled = true
  }

  const waitWhilePaused = async () => {
    while (paused && !cancelled) {
      await sleep(250)
    }
  }

  const runWithConcurrency = async (items, worker) => {
    let index = 0
    let inFlight = 0
    let completed = 0
    const errors = []

    return new Promise((resolve) => {
      const launchNext = () => {
        if (completed >= items.length) {
          resolve({ errors })
          return
        }

        while (inFlight < concurrency && index < items.length) {
          const item = items[index]
          index += 1
          inFlight += 1

          Promise.resolve()
            .then(() => worker(item))
            .catch((err) => {
              errors.push(err)
            })
            .finally(() => {
              inFlight -= 1
              completed += 1
              launchNext()
            })
        }
      }

      launchNext()
    })
  }

  const runResource = async ({ resource, ids, deleteFn }) => {
    const total = ids.length
    const batches = chunkArray(ids, batchSize)
    let processed = 0
    let failed = 0

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      await waitWhilePaused()
      if (cancelled) {
        throw new Error('Cancelled')
      }

      const batch = batches[batchIndex]

      if (onLog) {
        onLog({
          level: 'info',
          message: `Batch ${batchIndex + 1}/${batches.length} ${resource} (${batch.length})`,
        })
      }

      await runWithConcurrency(batch, async (id) => {
        await waitWhilePaused()
        if (cancelled) {
          return
        }

        try {
          await withRetry(() => deleteFn(resource, id), {
            retries: retryCount,
            delayMs: retryDelayMs,
            // Ne pas retenter sur les erreurs HTTP définitives (404 déjà supprimé, 405 non supporté)
            shouldRetry: (err) => !err || !err.httpStatus || (err.httpStatus >= 500 || err.httpStatus === 429),
            onRetry: (attempt, wait, err) => {
              if (onLog) {
                onLog({
                  level: 'warn',
                  message: `Retry ${attempt} ${resource}#${id} in ${wait}ms: ${err && err.message ? err.message : err}`,
                })
              }
              if (onProgress) {
                onProgress({ phase: 'retry', resource, id, attempt, wait })
              }
            },
          })
        } catch (err) {
          const httpStatus = err && err.httpStatus
          if (httpStatus === 404) {
            // Déjà supprimé (cascade PrestaShop) — on considère ça comme un succès
            if (onLog) {
              onLog({ level: 'info', message: `${resource}#${id}: déjà absent (404), ignoré` })
            }
          } else if (httpStatus === 405) {
            // DELETE non supporté par l'API PrestaShop pour cette ressource
            failed += 1
            if (onLog) {
              onLog({
                level: 'warn',
                message: `${resource}#${id}: DELETE non supporté par l'API (405), ignoré`,
              })
            }
            if (onProgress) {
              onProgress({ phase: 'error', resource, id })
            }
          } else {
            failed += 1
            if (onLog) {
              onLog({
                level: 'error',
                message: `Failed ${resource}#${id}: ${err && err.message ? err.message : err}`,
              })
            }
            if (onProgress) {
              onProgress({ phase: 'error', resource, id })
            }
          }
        } finally {
          processed += 1
          if (onProgress) {
            onProgress({
              phase: 'delete',
              resource,
              processed,
              failed,
              total,
              batchIndex: batchIndex + 1,
              batchTotal: batches.length,
            })
          }
        }
      })
    }

    return { processed, failed, total }
  }

  return {
    runResource,
    pause,
    resume,
    cancel,
    getState: () => ({ paused, cancelled }),
  }
}

export { createBatchProcessor }
