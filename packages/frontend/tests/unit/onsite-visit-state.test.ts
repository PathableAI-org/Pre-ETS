import { describe, expect, it } from "vitest"

import { transitionVisit, type Visit } from "../../src/features/onsite.ts"

const emptyVisit: Visit = { date: "", end: "", id: 1, running: false, start: "" }

describe("on-site visit transitions", () => {
  it("records the supplied start and end times without changing the original visit", () => {
    const started = transitionVisit(emptyVisit, { at: "2026-10-08T10:00:00", type: "start" })
    const ended = transitionVisit(started, { at: "2026-10-08T10:30:00", type: "end" })

    expect(emptyVisit).toEqual({ date: "", end: "", id: 1, running: false, start: "" })
    expect(started).toMatchObject({ date: "2026-10-08", end: "", running: true, start: "2026-10-08T10:00:00" })
    expect(ended).toMatchObject({ end: "2026-10-08T10:30:00", running: false })
    expect(transitionVisit(ended, { at: "2026-10-08T11:00:00", type: "start" })).toBe(ended)
  })

  it("stops an active timer when start is cleared and rejects an end-only action", () => {
    const started = transitionVisit(emptyVisit, { at: "2026-10-08T10:00:00", type: "start" })
    const cleared = transitionVisit(started, { type: "edit-start", value: "" })

    expect(cleared).toMatchObject({ end: "", running: false, start: "" })
    expect(transitionVisit(cleared, { at: "2026-10-08T10:30:00", type: "end" })).toBe(cleared)
    expect(transitionVisit(cleared, { at: "2026-10-08T11:00:00", type: "start" })).toMatchObject({
      date: "2026-10-08",
      end: "",
      running: true,
      start: "2026-10-08T11:00:00"
    })
  })

  it("keeps completed visits editable without restarting their timer", () => {
    const started = transitionVisit(emptyVisit, { at: "2026-10-08T10:00:00", type: "start" })
    const ended = transitionVisit(started, { at: "2026-10-08T10:30:00", type: "end" })
    const corrected = transitionVisit(ended, { type: "edit-start", value: "2026-10-08T09:45:00" })

    expect(corrected).toMatchObject({ end: "2026-10-08T10:30:00", running: false, start: "2026-10-08T09:45:00" })
    expect(transitionVisit(corrected, { type: "edit-end", value: "2026-10-08T10:45:00" })).toMatchObject({
      end: "2026-10-08T10:45:00",
      running: false,
      start: "2026-10-08T09:45:00"
    })
  })
})
