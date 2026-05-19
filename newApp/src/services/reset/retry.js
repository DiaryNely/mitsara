const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const withRetry = async (fn, options = {}) => {
  const { retries = 2, delayMs = 400, factor = 1.7, onRetry, shouldRetry } = options
  let attempt = 0
  let lastError

  while (attempt <= retries) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (shouldRetry && !shouldRetry(err)) {
        break
      }
      if (attempt >= retries) {
        break
      }

      const wait = Math.round(delayMs * Math.pow(factor, attempt))
      if (onRetry) {
        onRetry(attempt + 1, wait, err)
      }
      await sleep(wait)
      attempt += 1
    }
  }

  throw lastError
}

export { sleep, withRetry }
