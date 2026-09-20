import { describe, expect, it, vi } from "vitest"

import type { ConfirmSessionActionResult } from "../../src/lib/session/confirm-action.ts"

import { applyConfirmResult } from "../../src/lib/session/confirm-result.ts"
import {
  broadcastInactivityConfirmed,
  INACTIVITY_BROADCAST_CHANNEL,
  INACTIVITY_CONFIRMED_TYPE,
  inactivityConfirmedMessage,
  isInactivityConfirmedMessage,
  shouldApplyInactivityBroadcast
} from "../../src/lib/session/inactivity-channel.ts"

describe("inactivity BroadcastChannel contract", () => {
  it("builds inactivity-confirmed payload with sessionId and generation", () => {
    expect(inactivityConfirmedMessage("sid-a", 3)).toEqual({
      sessionEndGeneration: 3,
      sessionId: "sid-a",
      type: INACTIVITY_CONFIRMED_TYPE
    })
  })

  it("accepts well-formed messages and rejects junk", () => {
    expect(isInactivityConfirmedMessage(
      inactivityConfirmedMessage("sid-a", 1)
    )).toBe(true)

    expect(isInactivityConfirmedMessage(null)).toBe(false)
    expect(isInactivityConfirmedMessage({ type: "other" })).toBe(false)
    expect(isInactivityConfirmedMessage({
      sessionEndGeneration: 1,
      sessionId: "",
      type: INACTIVITY_CONFIRMED_TYPE
    })).toBe(false)
    expect(isInactivityConfirmedMessage({
      sessionEndGeneration: 1.5,
      sessionId: "sid-a",
      type: INACTIVITY_CONFIRMED_TYPE
    })).toBe(false)
    expect(isInactivityConfirmedMessage({
      sessionEndGeneration: 0,
      sessionId: "sid-a",
      type: INACTIVITY_CONFIRMED_TYPE
    })).toBe(false)
  })

  it("ignores foreign sessionId even when generation matches", () => {
    const message = inactivityConfirmedMessage("foreign-sid", 9)
    expect(shouldApplyInactivityBroadcast(message, "mounted-sid")).toBe(false)
    expect(shouldApplyInactivityBroadcast(message, "foreign-sid")).toBe(true)
  })

  it("broadcastInactivityConfirmed posts then closes the channel", () => {
    const postMessage = vi.fn()
    const close = vi.fn()
    class FakeBroadcastChannel {
      close = close
      readonly name: string
      postMessage = postMessage
      constructor(name: string) {
        this.name = name
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
    try {
      broadcastInactivityConfirmed("sid-a", 4)

      expect(postMessage).toHaveBeenCalledWith(
        inactivityConfirmedMessage("sid-a", 4)
      )
      expect(close).toHaveBeenCalledOnce()
      expect(INACTIVITY_BROADCAST_CHANNEL).toBe("pathable-inactivity")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("broadcastInactivityConfirmed still closes when postMessage throws", () => {
    const close = vi.fn()
    class FakeBroadcastChannel {
      close = close
      readonly name: string
      constructor(name: string) {
        this.name = name
      }
      postMessage(): void {
        throw new Error("post failed")
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
    try {
      expect(() => {
        broadcastInactivityConfirmed("sid-a", 4)
      }).not.toThrow()
      expect(close).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("applyConfirmResult inactivity gating", () => {
  it("opens inactivity only for ended-inactivity; never for unavailable/ended-other", () => {
    const applyInactivity = vi.fn()
    const setActive = vi.fn()
    const setDeadlines = vi.fn()
    const setUnavailable = vi.fn()

    applyConfirmResult(
      {
        sessionEndGeneration: 2,
        sessionId: "sid-a",
        status: "ended-inactivity"
      } satisfies ConfirmSessionActionResult,
      { applyInactivity, setActive, setDeadlines, setUnavailable }
    )
    expect(applyInactivity).toHaveBeenCalledWith("sid-a", 2)
    expect(setUnavailable).not.toHaveBeenCalled()

    applyInactivity.mockClear()
    applyConfirmResult(
      { status: "unavailable" } satisfies ConfirmSessionActionResult,
      { applyInactivity, setActive, setDeadlines, setUnavailable }
    )
    expect(applyInactivity).not.toHaveBeenCalled()
    expect(setUnavailable).toHaveBeenCalledOnce()

    setUnavailable.mockClear()
    applyConfirmResult(
      { sessionId: "sid-a", status: "ended-other" } satisfies ConfirmSessionActionResult,
      { applyInactivity, setActive, setDeadlines, setUnavailable }
    )
    expect(applyInactivity).not.toHaveBeenCalled()
    expect(setUnavailable).toHaveBeenCalledOnce()
  })
})
