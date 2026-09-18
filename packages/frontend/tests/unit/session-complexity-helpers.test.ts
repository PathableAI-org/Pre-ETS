import { describe, expect, it, vi } from "vitest"

import type { SessionRecord } from "../../src/lib/session/types.ts"

import { planBddIdleRenewal } from "../../../../tests/bdd/support/idle.ts"
import { toRecordActivityActionResult } from "../../src/lib/session/activity-action.ts"
import { confirmSessionActionInputFrom, toConfirmSessionActionResult } from "../../src/lib/session/confirm-action.ts"
import { canRunConfirm, confirmActionInput, executeConfirmPass } from "../../src/lib/session/confirm-pass.ts"
import { applyConfirmResult } from "../../src/lib/session/confirm-result.ts"
import { computeIdleExpiresAt, DEFAULT_IDLE_DURATION_MINUTES } from "../../src/lib/session/idle.ts"
import { applyLoginAgainCookies } from "../../src/lib/session/login-again-runtime.ts"
import { mapInitiationToLoginAgain } from "../../src/lib/session/login-again.ts"
import { parseRequestSessionContext } from "../../src/lib/session/request-session.ts"
import { planIdleRenewal } from "../../src/lib/session/store.ts"
import { entryForSet, passesSetCondition } from "./helpers/memory-redis.ts"

describe("complexity-extraction helpers", () => {
  it("maps initiation outcomes for login-again", () => {
    expect(
      mapInitiationToLoginAgain(
        {
          expiresAt: 10,
          kind: "redirect",
          location: "https://idp.example/auth",
          oidcCookieValue: "oidc",
          outcomeClass: "redirect"
        },
        "session",
        20,
        "sid"
      )
    ).toMatchObject({ kind: "redirect", sessionId: "sid" })
    expect(
      mapInitiationToLoginAgain(
        { kind: "config-refusal", outcomeClass: "403-config" },
        "s",
        1,
        "id"
      )
    ).toEqual({ kind: "config-refusal" })
    expect(
      mapInitiationToLoginAgain(
        { kind: "process-config", outcomeClass: "process-config" },
        "s",
        1,
        "id"
      )
    ).toEqual({ kind: "process-config" })
    expect(
      mapInitiationToLoginAgain(
        { kind: "login-unavailable", outcomeClass: "login-unavailable" },
        "s",
        1,
        "id"
      )
    ).toEqual({ kind: "login-unavailable" })
  })

  it("maps confirm action DTOs", () => {
    expect(
      toConfirmSessionActionResult({
        expiresAt: 2,
        idleExpiresAt: 1,
        kind: "authenticated",
        sessionId: "a"
      })
    ).toEqual({
      expiresAt: 2,
      idleExpiresAt: 1,
      sessionId: "a",
      status: "authenticated"
    })
    expect(
      toConfirmSessionActionResult({
        kind: "ended-inactivity",
        mismatch: true,
        sessionEndGeneration: 3,
        sessionId: "b"
      })
    ).toMatchObject({ mismatch: true, status: "ended-inactivity" })
    expect(
      toConfirmSessionActionResult({ kind: "ended-other", sessionId: "c" })
    ).toEqual({ sessionId: "c", status: "ended-other" })
    expect(
      toConfirmSessionActionResult({ kind: "ended-other", mismatch: true })
    ).toEqual({ mismatch: true, status: "ended-other" })
    expect(
      toConfirmSessionActionResult({ cookieSessionId: "d", kind: "mismatch" })
    ).toEqual({ cookieSessionId: "d", status: "mismatch" })
    expect(toConfirmSessionActionResult({ kind: "unavailable" })).toEqual({
      status: "unavailable"
    })
  })

  it("builds confirm action input without undefined assigns", () => {
    expect(confirmSessionActionInputFrom("cookie", {})).toEqual({
      cookieValue: "cookie"
    })
    expect(
      confirmSessionActionInputFrom("cookie", {
        mountedSessionId: "m",
        sessionEndGeneration: 2
      })
    ).toEqual({
      cookieValue: "cookie",
      mountedSessionId: "m",
      sessionEndGeneration: 2
    })
  })

  it("maps activity action DTOs", () => {
    expect(toRecordActivityActionResult({ kind: "renewed", record: baseRecord() })).toEqual({
      ok: true
    })
    expect(toRecordActivityActionResult({ kind: "coalesced", record: baseRecord() })).toEqual({
      coalesced: true,
      ok: true
    })
    expect(toRecordActivityActionResult({ kind: "denied", reason: "expired" })).toEqual({
      ok: false
    })
  })

  it("plans idle renewals", () => {
    const now = 1_700_000_000
    const record = baseRecord(now)
    expect(planIdleRenewal(record, now + 30).kind).toBe("write")
    expect(planIdleRenewal(record, now + 86_400).kind).toBe("denied")
    expect(planIdleRenewal({ expiresAt: now + 10, tenantId: "x" }, now).kind).toBe("denied")
  })

  it("applies confirm results for recovery handlers", () => {
    const applyInactivity = vi.fn()
    const setDeadlines = vi.fn()
    const setUnavailable = vi.fn()
    applyConfirmResult(
      {
        expiresAt: 2,
        idleExpiresAt: 1,
        sessionId: "s",
        status: "authenticated"
      },
      { applyInactivity, setDeadlines, setUnavailable }
    )
    expect(setDeadlines).toHaveBeenCalledOnce()
    applyConfirmResult(
      {
        sessionEndGeneration: 1,
        sessionId: "s",
        status: "ended-inactivity"
      },
      { applyInactivity, setDeadlines, setUnavailable }
    )
    expect(applyInactivity).toHaveBeenCalledOnce()
    applyConfirmResult({ status: "unavailable" }, {
      applyInactivity,
      setDeadlines,
      setUnavailable
    })
    expect(setUnavailable).toHaveBeenCalledOnce()
  })

  it("evaluates MemoryRedis SET helpers", () => {
    expect(passesSetCondition(null, "NX")).toBe(true)
    expect(passesSetCondition("x", "NX")).toBe(false)
    expect(passesSetCondition(null, "XX")).toBe(false)
    expect(passesSetCondition("x", "XX")).toBe(true)
    expect(passesSetCondition(null, undefined)).toBe(true)
    expect(entryForSet("v").value).toBe("v")
    expect(entryForSet("v", { expiration: { type: "PX", value: 50 } }).pxExpiresAtMs)
      .toBeTypeOf("number")
  })

  it("plans BDD idle renewals", () => {
    const now = 1_700_000_000
    const record = baseRecord(now)
    expect(planBddIdleRenewal(record, now + 30, "springfield").kind).toBe("renew")
    expect(planBddIdleRenewal(record, now + 30, "other").kind).toBe("denied")
  })

  it("rejects empty request session headers", () => {
    expect(() => parseRequestSessionContext(null)).toThrow(/required/)
    expect(() => parseRequestSessionContext("")).toThrow(/required/)
    expect(() => parseRequestSessionContext("{}")).toThrow(/invalid/)
  })
  it("runs confirm-pass helpers", async () => {
    expect(canRunConfirm(false, "active")).toBe(true)
    expect(canRunConfirm(true, "active")).toBe(false)
    expect(confirmActionInput("s", undefined)).toEqual({ mountedSessionId: "s" })
    expect(confirmActionInput("s", 2)).toEqual({
      mountedSessionId: "s",
      sessionEndGeneration: 2
    })
    const setUnavailable = vi.fn()
    await executeConfirmPass({
      applyInactivity: vi.fn(),
      confirm: () => Promise.reject(new Error("boom")),
      heldGeneration: undefined,
      sessionId: "s",
      setDeadlines: vi.fn(),
      setUnavailable
    })
    expect(setUnavailable).toHaveBeenCalledOnce()
  })

  it("loads login-again runtime cookie helper", () => {
    const set = vi.fn()
    applyLoginAgainCookies(
      { set },
      {
        expiresAt: 10,
        kind: "redirect",
        location: "/",
        oidcCookieValue: "o",
        sessionCookieValue: "s",
        sessionExpiresAt: 20,
        sessionId: "id"
      },
      {
        cookieAttributes: (exp, secure) => ({
          expires: new Date(exp * 1000),
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure
        }),
        development: true,
        oidcCookieAttributes: (exp, secure) => ({
          expires: new Date(exp * 1000),
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure
        }),
        oidcCookieName: "oidc",
        sessionCookieName: "session"
      }
    )
    expect(set).toHaveBeenCalledTimes(2)
  })
})

function baseRecord(now = 1_700_000_000): SessionRecord {
  return {
    expiresAt: now + 86_400,
    idleDurationMinutes: DEFAULT_IDLE_DURATION_MINUTES,
    idleExpiresAt: computeIdleExpiresAt(now, DEFAULT_IDLE_DURATION_MINUTES),
    lastActivityAt: now,
    tenantId: "springfield",
    userId: "user-1",
    userName: "Demo User"
  }
}
