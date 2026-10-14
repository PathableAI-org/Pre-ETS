import { describe, expect, it } from "vitest"

import { displayDuration, durationMs, visitClockMs } from "../../src/components/onsite/visit-time.ts"

describe("on-site prototype visit time", () => {
  it("counts an overnight visit across the date boundary", () => {
    const duration = durationMs("2026-10-08T23:45:00", "2026-10-09T00:15:30")
    expect(duration).toBe(1_830_000)
    expect(displayDuration(duration ?? 0)).toBe("00:30:30")
  })

  it("does not count a missing or reversed time as recorded service", () => {
    expect(durationMs("2026-10-08T10:00:00", "")).toBeUndefined()
    expect(durationMs("2026-10-08T10:00:00", "2026-10-08T09:59:59")).toBeUndefined()
  })

  it("shows running time but only includes stopped visits in recorded time", () => {
    const start = "2026-10-08T10:00:00"
    const now = new Date("2026-10-08T10:00:05").getTime()
    expect(visitClockMs(start, "", true, now)).toBe(5000)
    expect(durationMs(start, "")).toBeUndefined()
  })
})
