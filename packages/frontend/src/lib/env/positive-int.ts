export function parsePositiveSafeInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  createError: (message: string) => Error
): number {
  if (raw === undefined || raw === "") {
    return fallback
  }

  if (!/^[1-9]\d*$/.test(raw)) {
    throw createError(`${name} must be a positive integer.`)
  }

  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw createError(`${name} must be a positive safe integer.`)
  }

  return value
}

export function parseStoreTimeoutMs(
  raw: string | undefined,
  fallback: number,
  maxMs: number,
  createError: (message: string) => Error
): number {
  const value = parsePositiveSafeInteger(raw, fallback, "SESSION_STORE_TIMEOUT_MS", createError)
  if (value > maxMs) {
    throw createError("SESSION_STORE_TIMEOUT_MS exceeds the Node timer-safe range.")
  }

  return value
}
