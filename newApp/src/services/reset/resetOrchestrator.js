import { discoverResources, loadResourceSchema } from './resourceDiscovery'
import { listResourceIds, deleteResourceItem } from './apiClient'
import { resolveResetPlan } from './dependencyResolver'
import { createBatchProcessor } from './batchProcessor'

const DEFAULT_SETTINGS = {
  batchSize: 25,
  concurrency: 4,
  retryCount: 2,
  retryDelayMs: 400,
  pageSize: 200,
}

const estimateDuration = (total, settings) => {
  const avgMs = 250
  const workers = Math.max(1, settings.concurrency || 1)
  return Math.ceil((total * avgMs) / workers)
}

const createResetOrchestrator = (options = {}) => {
  const { onLog, onProgress } = options
  const schemaCache = new Map()
  let cachedDiscovery = null
  let apiResources = []

  const log = (level, message, meta) => {
    if (!onLog) {
      return
    }

    onLog({
      level,
      message,
      meta,
      time: new Date().toISOString(),
    })
  }

  const discover = async () => {
    if (cachedDiscovery) {
      return cachedDiscovery
    }

    cachedDiscovery = await discoverResources()
    apiResources = cachedDiscovery.resources || []
    return cachedDiscovery
  }

  const loadSchemaCached = async (resource) => {
    if (schemaCache.has(resource)) {
      return schemaCache.get(resource)
    }

    const schema = await loadResourceSchema(resource)
    schemaCache.set(resource, schema)
    return schema
  }

  const collectSchemas = async (resources) => {
    const schemas = {}

    for (const resource of resources) {
      try {
        const schema = await loadSchemaCached(resource)
        schemas[resource] = schema
      } catch (err) {
        log('warn', `Schema unavailable for ${resource}: ${err && err.message ? err.message : err}`)
      }
    }

    return schemas
  }

  const planReset = async (payload) => {
    const { selectedResources, settings = {} } = payload
    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings }

    await discover()

    const availableResources = apiResources.map((item) => item.name)
    const missing = selectedResources.filter((name) => !availableResources.includes(name))
    if (missing.length) {
      log('warn', `Resources not found in API: ${missing.join(', ')}`)
    }

    let schemas = await collectSchemas(selectedResources)
    let plan = resolveResetPlan({
      selected: selectedResources,
      schemas,
      availableResources,
    })

    if (plan.autoIncluded.length) {
      const missingSchemas = plan.autoIncluded.filter((resource) => !schemas[resource])
      if (missingSchemas.length) {
        log('info', `Loading schemas for auto-included: ${missingSchemas.join(', ')}`)
        const extraSchemas = await collectSchemas(missingSchemas)
        schemas = { ...schemas, ...extraSchemas }
        plan = resolveResetPlan({
          selected: selectedResources,
          schemas,
          availableResources,
        })
      }
    }

    const resourceMeta = {}
    apiResources.forEach((item) => {
      resourceMeta[item.name] = item
    })

    const idsByResource = {}
    const counts = {}

    for (const resource of plan.deletionOrder) {
      const meta = resourceMeta[resource]
      if (!meta || !meta.methods || !meta.methods.get) {
        log('warn', `Resource ${resource} does not support GET, skipping ID listing`)
        idsByResource[resource] = []
        counts[resource] = 0
        continue
      }

      try {
        log('info', `Listing IDs for ${resource}...`)
        const ids = await listResourceIds(resource, { pageSize: mergedSettings.pageSize })
        idsByResource[resource] = ids
        counts[resource] = ids.length
        log('info', `Found ${ids.length} IDs for ${resource}`)
      } catch (err) {
        log('error', `Failed to list IDs for ${resource}: ${err && err.message ? err.message : err}`)
        idsByResource[resource] = []
        counts[resource] = 0
      }
    }

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    const estimateMs = estimateDuration(total, mergedSettings)

    return {
      ...plan,
      idsByResource,
      counts,
      total,
      estimateMs,
      settings: mergedSettings,
      resourceMeta,
    }
  }

  let processor = null

  const runReset = async (payload) => {
    const { plan, settings = {} } = payload
    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings }

    processor = createBatchProcessor({
      batchSize: mergedSettings.batchSize,
      concurrency: mergedSettings.concurrency,
      retryCount: mergedSettings.retryCount,
      retryDelayMs: mergedSettings.retryDelayMs,
      onLog,
      onProgress,
    })

    let deleted = 0
    const total = plan.total || 0

    if (onProgress) {
      onProgress({ phase: 'start', processed: 0, total, percent: 0 })
    }

    for (const resource of plan.deletionOrder) {
      const meta = plan.resourceMeta ? plan.resourceMeta[resource] : null
      if (meta && meta.methods && !meta.methods.delete) {
        log('warn', `Resource ${resource} does not support DELETE, skipping`)
        continue
      }

      const ids = plan.idsByResource ? plan.idsByResource[resource] : []
      if (!ids || !ids.length) {
        if (onProgress) {
          onProgress({ phase: 'resource-skip', resource, processed: deleted, total })
        }
        continue
      }

      log('info', `Deleting ${ids.length} ${resource}...`)
      const result = await processor.runResource({ resource, ids, deleteFn: deleteResourceItem })
      deleted += result.processed

      if (onProgress) {
        const percent = total ? Math.round((deleted / total) * 100) : 100
        onProgress({
          phase: 'resource-complete',
          resource,
          processed: deleted,
          total,
          percent,
          failed: result.failed,
        })
      }
    }

    if (onProgress) {
      onProgress({ phase: 'complete', processed: deleted, total, percent: 100 })
    }

    return { deleted, total }
  }

  const pause = () => {
    if (processor) {
      processor.pause()
      log('info', 'Paused by user')
    }
  }

  const resume = () => {
    if (processor) {
      processor.resume()
      log('info', 'Resumed by user')
    }
  }

  const cancel = () => {
    if (processor) {
      processor.cancel()
      log('warn', 'Cancelled by user')
    }
  }

  return {
    discoverResources: discover,
    planReset,
    runReset,
    pause,
    resume,
    cancel,
  }
}

export { createResetOrchestrator }
