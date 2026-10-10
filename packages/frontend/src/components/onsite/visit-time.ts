export function displayDuration(duration: number): string {
  const minutes = Math.floor(duration / 60_000)
  const seconds = Math.floor(duration / 1000) % 60
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${
    String(seconds).padStart(2, "0")
  }`
}

export function durationMs(start: string, end: string): number | undefined {
  if (start === "" || end === "") {
    return undefined
  }

  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return undefined
  }

  return endMs - startMs
}

/** Local datetime inputs are display-only prototype values, not authoritative service timestamps. */
export function localDateTime(now: Date): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 19)
}

export function visitClockMs(start: string, end: string, running: boolean, now: number): number {
  if (running && start !== "") {
    return Math.max(0, now - new Date(start).getTime())
  }
  return durationMs(start, end) ?? 0
}
