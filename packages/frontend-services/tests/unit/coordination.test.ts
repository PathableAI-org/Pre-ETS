import { fc, it } from "@fast-check/vitest"
import { Effect, Layer, Result, Schema } from "effect"
import { NextRequest } from "next/server"
import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, vi } from "vitest"

import {
  authorizeSessionAction,
  createLogoutHandler,
  createSessionActivityHandler,
  createSessionStatusHandler,
  type SessionActivityRequestBody
} from "../../src/next.ts"
import {
  type InvalidationExpired,
  type NoUsableSession,
  type RefreshSessionForTenantInput,
  SessionService,
  SessionServiceUnavailable,
  SessionTenantMismatch,
  type UsableSession
} from "../../src/session.ts"
import {
  effectiveSessionPolicy,
  TenantAlias,
  type TenantConfig,
  TenantConfigService,
  type TenantFailure,
  TenantNotFound,
  TenantReadError
} from "../../src/tenant.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/runtime.ts", () => ({ Runtime: runtime }))

const NOW = 1_800_000_000_000
const ORIGIN = "https://springfield.example.test"
const alias = Schema.decodeSync(TenantAlias)("springfield")
const tenantConfig: TenantConfig = {
  displayName: "Springfield",
  idleTimeoutMinutes: 20,
  oidc: { clientAuth: "public", clientId: "springfield-web", issuer: "https://provider.test" },
  warningLeadMinutes: 4
}
const usableSession: UsableSession = {
  _tag: "UsableSession",
  identity: { issuer: "https://provider.test/", subject: "subject-1" },
  idleDeadlineEpochMilliseconds: NOW + 1_234_567,
  observedAtEpochMilliseconds: 1_799_999_999_000,
  revision: 3,
  tenantAlias: alias,
  warningLeadMinutes: 4
}
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }
const defaultReference = "R".repeat(43)

interface Recorded {
  readonly cutoffs: (number | undefined)[]
  readonly invalidations: (string | undefined)[]
  readonly refreshes: RefreshSessionForTenantInput[]
}

type SessionOutcome = Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>

let recorded: Recorded = { cutoffs: [], invalidations: [], refreshes: [] }

interface Doubles {
  readonly invalidate?: Effect.Effect<InvalidationExpired | NoUsableSession, SessionServiceUnavailable>
  readonly session?: () => SessionOutcome
  readonly tenant?: Result.Result<TenantAlias, TenantFailure>
}

const install = (doubles: Doubles = {}) => {
  recorded = { cutoffs: [], invalidations: [], refreshes: [] }
  const outcome = doubles.session ?? (() => Effect.succeed(usableSession))
  const sessions: SessionService["Service"] = {
    establish: () => Effect.die("establish must remain unused"),
    invalidate: (input) => {
      recorded.invalidations.push(input.reference)
      recorded.cutoffs.push(input.notAfterEpochMilliseconds)
      return doubles.invalidate ?? Effect.succeed(noUsableSession)
    },
    read: () => Effect.die("read must remain unused"),
    readForTenant: () => outcome(),
    refreshForTenant: (input) => {
      recorded.refreshes.push(input)
      return outcome()
    }
  }
  const tenant: TenantConfigService["Service"] = {
    getAlias: () => doubles.tenant ?? Result.succeed(alias),
    getConfigFromAlias: () => Effect.succeed(tenantConfig),
    getConfigFromHost: () => Effect.die("getConfigFromHost must remain unused")
  }
  runtime.runPromise.mockImplementation((
    program: Effect.Effect<unknown, unknown, SessionService | TenantConfigService>
  ) =>
    Effect.runPromise(program.pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(SessionService, sessions), Layer.succeed(TenantConfigService, tenant))
      )
    ))
  )
}

const activity = createSessionActivityHandler()
const status = createSessionStatusHandler()
const logout = createLogoutHandler()

type Headers = Readonly<Record<string, string>>
const sameOriginJson: Headers = { "content-type": "application/json", "sec-fetch-site": "same-origin" }

const post = (path: string, body: string, init: { readonly headers?: Headers; readonly reference?: string } = {}) => {
  const headers = new Headers({ host: "springfield.example.test", ...(init.headers ?? sameOriginJson) })
  const reference = init.reference ?? defaultReference
  if (reference !== "") headers.set("cookie", `pathable-session=${reference}`)
  return new NextRequest(`${ORIGIN}${path}`, { body, headers, method: "POST" })
}

const statusRequest = (reference = defaultReference) =>
  new NextRequest(`${ORIGIN}/session/status`, {
    headers: {
      cookie: `pathable-session=${reference}`,
      host: "springfield.example.test",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin"
    }
  })

type TabActivity = SessionActivityRequestBody["activity"]

const activityBody = (coordinationTag: string, kind: TabActivity = "text-entry") =>
  JSON.stringify({ activity: kind, coordinationTag })
const logoutBody = (coordinationTag: string, notAfter = Date.now() + 10_000) =>
  JSON.stringify({ coordinationTag, notAfter })

/** The tag a tab would hold, obtained only through the public status handler. */
const tagFor = async (reference: string) => {
  install()
  const response = await status(statusRequest(reference))
  const body = (await response.json()) as { readonly coordinationTag: string }
  return body.coordinationTag
}

const expectEmpty = async (response: Response, expectedStatus: number) => {
  expect(response.status).toBe(expectedStatus)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.getSetCookie()).toEqual([])
  expect(await response.text()).toBe("")
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

const reference = fc.stringMatching(/^[A-Za-z0-9_-]{43}$/)
/** Every kind a tab may send: the in-page kinds and the warning's Continue (#156 research D1). */
const kind = fc.constantFrom<TabActivity>(
  "continue-session",
  "intentional-control-activation",
  "keyboard-interaction",
  "text-entry",
  "touch-interaction",
  "user-driven-meaningful-input-focus"
)

/** Request provenance and whether the handler must treat it as same-origin. */
const provenance = fc.constantFrom<readonly [Headers, boolean]>(
  [{ "sec-fetch-site": "same-origin" }, true],
  [{ "sec-fetch-site": "same-site" }, false],
  [{ "sec-fetch-site": "cross-site" }, false],
  [{ "sec-fetch-site": "none" }, false],
  [{ origin: ORIGIN }, true],
  [{ origin: "https://shelbyville.example.test" }, false],
  [{}, false]
)
const contentType = fc.constantFrom<readonly [string, boolean]>(
  ["application/json", true],
  ["application/json; charset=utf-8", true],
  ["text/plain", false],
  ["application/x-www-form-urlencoded", false]
)

describe("coordination tag [PREETS-SESSION-010]", () => {
  it.prop([reference, reference], { numRuns: 100 })(
    "is deterministic per reference, distinct across references, and never the store-key digest",
    async (first, second) => {
      fc.pre(first !== second)
      const tag = await tagFor(first)

      expect(await tagFor(first)).toBe(tag)
      expect(await tagFor(second)).not.toBe(tag)
      expect(tag).not.toBe(createHash("sha256").update(first).digest("base64url"))
      expect(tag).not.toContain(first)
    }
  )
})

describe("activity and logout bind to the observed session [PREETS-SESSION-009, PREETS-SESSION-010, PREETS-SESSION-011]", () => {
  it.prop([reference, fc.boolean(), fc.string(), kind, provenance, contentType], { numRuns: 300 })(
    "renew iff the body tag equals the cookie's tag and the request is same-origin JSON",
    async (cookie, useTrueTag, otherTag, activityKind, [origin, sameOrigin], [type, json]) => {
      const trueTag = await tagFor(cookie)
      const claimed = useTrueTag ? trueTag : otherTag
      const permitted = claimed === trueTag && sameOrigin && json
      install()

      const response = await activity(
        post("/session/activity", activityBody(claimed, activityKind), {
          headers: { ...origin, "content-type": type },
          reference: cookie
        })
      )

      expect(recorded.refreshes.length).toBe(permitted ? 1 : 0)
      expect(response.status === 200).toBe(permitted)
      if (permitted) {
        expect(recorded.refreshes[0]).toStrictEqual({
          activity: activityKind,
          policy: effectiveSessionPolicy(tenantConfig),
          reference: cookie,
          tenantAlias: alias
        })
      }
    }
  )

  it.prop([reference, fc.boolean(), fc.string(), provenance, contentType], { numRuns: 300 })(
    "log out iff the body tag equals the cookie's tag and the request is same-origin JSON",
    async (cookie, useTrueTag, otherTag, [origin, sameOrigin], [type, json]) => {
      const trueTag = await tagFor(cookie)
      const claimed = useTrueTag ? trueTag : otherTag
      const permitted = claimed === trueTag && sameOrigin && json
      install()

      const response = await logout(
        post("/auth/logout", logoutBody(claimed), { headers: { ...origin, "content-type": type }, reference: cookie })
      )

      expect(recorded.invalidations).toEqual(permitted ? [cookie] : [])
      expect(response.status === 204).toBe(permitted)
    }
  )
})

describe("activity handler outcomes [PREETS-SESSION-009, PREETS-SESSION-011]", () => {
  it("returns the renewed snapshot without writing the session cookie", async () => {
    const tag = await tagFor(defaultReference)
    install()

    const response = await activity(post("/session/activity", activityBody(tag)))

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toStrictEqual({
      coordinationTag: tag,
      idleDeadlineEpochMilliseconds: usableSession.idleDeadlineEpochMilliseconds,
      observedAtEpochMilliseconds: usableSession.observedAtEpochMilliseconds,
      revision: usableSession.revision,
      serverTimeEpochMilliseconds: NOW,
      warningLeadMinutes: 4
    })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("renews for Continue with that activity and the tenant's effective policy, like an in-page kind", async () => {
    const tag = await tagFor(defaultReference)
    install()

    const response = await activity(post("/session/activity", activityBody(tag, "continue-session")))

    expect(response.status).toBe(200)
    expect(recorded.refreshes).toStrictEqual([{
      activity: "continue-session",
      policy: effectiveSessionPolicy(tenantConfig),
      reference: defaultReference,
      tenantAlias: alias
    }])
    expect(await response.json()).toMatchObject({
      coordinationTag: tag,
      idleDeadlineEpochMilliseconds: usableSession.idleDeadlineEpochMilliseconds,
      revision: usableSession.revision,
      warningLeadMinutes: 4
    })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it.each([
    ["cross-site Fetch Metadata", { "content-type": "application/json", "sec-fetch-site": "cross-site" }, 403],
    ["same-site Fetch Metadata", { "content-type": "application/json", "sec-fetch-site": "same-site" }, 403],
    ["a foreign Origin", { "content-type": "application/json", origin: "https://evil.test" }, 403],
    ["a text/plain body", { "content-type": "text/plain", "sec-fetch-site": "same-origin" }, 415]
  ])("rejects %s before any session operation", async (_label, headers, expected) => {
    const tag = await tagFor(defaultReference)
    install()

    await expectEmpty(await activity(post("/session/activity", activityBody(tag), { headers })), expected)
    await expectEmpty(await logout(post("/auth/logout", logoutBody(tag), { headers })), expected)
    expect(recorded.refreshes).toEqual([])
    expect(recorded.invalidations).toEqual([])
  })

  it.each([
    ["malformed JSON", "{"],
    ["an excluded kind", JSON.stringify({ activity: "raw-pointer-movement", coordinationTag: "t" })],
    ["a deliberate kind the gate owns", JSON.stringify({ activity: "deliberate-page-request", coordinationTag: "t" })],
    ["an excess property", JSON.stringify({ activity: "text-entry", coordinationTag: "t", reference: "x" })],
    ["a missing tag", JSON.stringify({ activity: "text-entry" })]
  ])("answers 400 to %s", async (_label, body) => {
    install()

    await expectEmpty(await activity(post("/session/activity", body)), 400)
    expect(recorded.refreshes).toEqual([])
  })

  it("answers 409 to a tag for another session without renewing", async () => {
    const otherTag = await tagFor("S".repeat(43))
    install()

    await expectEmpty(await activity(post("/session/activity", activityBody(otherTag))), 409)
    expect(recorded.refreshes).toEqual([])
  })

  describe("Continue at the deadline (#156 research D15, V-011)", () => {
    const deadline = NOW + 60_000
    const renewed: UsableSession = {
      ...usableSession,
      idleDeadlineEpochMilliseconds: deadline + 1_200_000,
      revision: 4
    }
    /** The store's answer to a refresh: renewed while received before the deadline, ended from the deadline on. */
    const atDeadline = () =>
      Effect.succeed<NoUsableSession | UsableSession>(
        Date.now() < deadline ? renewed : { _tag: "NoUsableSession", expired: true }
      )
    const continueOnce = {
      activity: "continue-session",
      policy: effectiveSessionPolicy(tenantConfig),
      reference: defaultReference,
      tenantAlias: alias
    } satisfies RefreshSessionForTenantInput

    it("renews for Continue received one millisecond before the deadline", async () => {
      const tag = await tagFor(defaultReference)
      install({ session: atDeadline })
      vi.setSystemTime(deadline - 1)

      const response = await activity(post("/session/activity", activityBody(tag, "continue-session")))

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        idleDeadlineEpochMilliseconds: renewed.idleDeadlineEpochMilliseconds
      })
      expect(recorded.refreshes).toStrictEqual([continueOnce])
    })

    it.each([
      ["exactly at", 0],
      ["one millisecond after", 1],
      ["a minute after", 60_000]
    ])("answers 401 to Continue received %s the deadline, with one refresh and no renewal", async (_label, late) => {
      const tag = await tagFor(defaultReference)
      install({ session: atDeadline })
      vi.setSystemTime(deadline + late)

      await expectEmpty(await activity(post("/session/activity", activityBody(tag, "continue-session"))), 401)
      expect(recorded.refreshes).toStrictEqual([continueOnce])
      expect(recorded.invalidations).toStrictEqual([])
    })
  })

  it("answers 401 without a cookie or when the store has no usable session", async () => {
    const tag = await tagFor(defaultReference)
    install()
    await expectEmpty(await activity(post("/session/activity", activityBody(tag), { reference: "" })), 401)
    expect(recorded.refreshes).toEqual([])

    install({ session: () => Effect.succeed(noUsableSession) })
    await expectEmpty(await activity(post("/session/activity", activityBody(tag))), 401)
  })
})

describe("status and logout outcomes [PREETS-SESSION-010]", () => {
  it("reads status without renewing", async () => {
    const tag = await tagFor(defaultReference)
    install()

    const response = await status(statusRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await response.json()).toStrictEqual({
      coordinationTag: tag,
      idleDeadlineEpochMilliseconds: usableSession.idleDeadlineEpochMilliseconds,
      observedAtEpochMilliseconds: usableSession.observedAtEpochMilliseconds,
      revision: usableSession.revision,
      serverTimeEpochMilliseconds: NOW,
      warningLeadMinutes: 4
    })
    expect(recorded.refreshes).toEqual([])
  })

  it("invalidates the tab's session and leaves the cookie untouched", async () => {
    const tag = await tagFor(defaultReference)
    install()

    const response = await logout(post("/auth/logout", logoutBody(tag)))

    expect(response.status).toBe(204)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(recorded.invalidations).toEqual([defaultReference])
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await response.text()).toBe("")
  })

  it("forwards notAfter to the store unchanged, even when it is already past", async () => {
    const tag = await tagFor(defaultReference)
    install()

    await logout(post("/auth/logout", logoutBody(tag, 1_234)))

    expect(recorded.cutoffs).toEqual([1_234])
  })

  it("answers 408 when the store reports the cutoff passed before the delete", async () => {
    const tag = await tagFor(defaultReference)
    install({ invalidate: Effect.succeed({ _tag: "InvalidationExpired" }) })

    await expectEmpty(await logout(post("/auth/logout", logoutBody(tag))), 408)
    expect(recorded.invalidations).toEqual([defaultReference])
  })

  it("answers 401 and invalidates nothing when there is no usable session", async () => {
    const tag = await tagFor(defaultReference)
    install({ session: () => Effect.succeed(noUsableSession) })

    await expectEmpty(await logout(post("/auth/logout", logoutBody(tag))), 401)
    await expectEmpty(await status(statusRequest()), 401)
    expect(recorded.invalidations).toEqual([])
  })

  it("answers 503 and leaves the cookie when invalidation cannot complete", async () => {
    const tag = await tagFor(defaultReference)
    install({ invalidate: Effect.fail(new SessionServiceUnavailable({})) })

    await expectEmpty(await logout(post("/auth/logout", logoutBody(tag))), 503)
  })
})

describe("failure mapping for every handler [PREETS-SESSION-010]", () => {
  const failures: readonly (readonly [string, Doubles, number])[] = [
    ["tenant mismatch", { session: () => Effect.fail(new SessionTenantMismatch({})) }, 403],
    ["store outage", { session: () => Effect.fail(new SessionServiceUnavailable({})) }, 503],
    ["missing tenant", { tenant: Result.fail(new TenantNotFound({ cause: new Error("x"), message: "x" })) }, 404],
    ["unreadable tenant", { tenant: Result.fail(new TenantReadError({ cause: new Error("x"), message: "x" })) }, 500]
  ]

  it.each(failures)("maps %s to a stable empty response", async (_label, doubles, expected) => {
    const tag = await tagFor(defaultReference)
    install(doubles)

    await expectEmpty(await activity(post("/session/activity", activityBody(tag))), expected)
    await expectEmpty(await status(statusRequest()), expected)
    await expectEmpty(await logout(post("/auth/logout", logoutBody(tag))), expected)
    expect(recorded.invalidations).toEqual([])
  })
})

describe("authorizeSessionAction [PREETS-SESSION-005, PREETS-SESSION-010]", () => {
  const authorize = (reference: string, coordinationTag: string | undefined) =>
    authorizeSessionAction({ coordinationTag, host: "springfield.example.test", reference })

  it.prop([reference, reference, fc.option(fc.string(), { nil: undefined }), fc.integer({ max: 2, min: 0 })], {
    numRuns: 200
  })(
    "renews iff the submitted tag is the cookie's tag, and only after the check",
    async (cookieReference, otherReference, arbitrary, choice) => {
      const own = await tagFor(cookieReference)
      const claimed = [own, await tagFor(otherReference), arbitrary][choice]
      install()

      const result = await authorize(cookieReference, claimed)

      if (claimed === own) {
        expect(result).toStrictEqual({ _tag: "Authorized", session: usableSession, tenantAlias: alias })
        expect(recorded.refreshes).toStrictEqual([{
          activity: "deliberate-form-submission",
          policy: effectiveSessionPolicy(tenantConfig),
          reference: cookieReference,
          tenantAlias: alias
        }])
      } else {
        expect(result).toStrictEqual({ _tag: "SessionChanged" })
        expect(recorded.refreshes).toStrictEqual([])
      }
    }
  )

  it("answers NoUsableSession without renewing when there is no reference", async () => {
    const tag = await tagFor(defaultReference)
    install()

    expect(await authorizeSessionAction({ coordinationTag: tag, host: "springfield.example.test" })).toStrictEqual(
      noUsableSession
    )
    expect(recorded.refreshes).toStrictEqual([])
  })

  it("answers NoUsableSession when the matching session cannot be renewed", async () => {
    const tag = await tagFor(defaultReference)
    install({ session: () => Effect.succeed(noUsableSession) })

    expect(await authorize(defaultReference, tag)).toStrictEqual(noUsableSession)
  })

  it("throws when the store is unavailable", async () => {
    const tag = await tagFor(defaultReference)
    install({ session: () => Effect.fail(new SessionServiceUnavailable({})) })

    await expect(authorize(defaultReference, tag)).rejects.toBeInstanceOf(SessionServiceUnavailable)
  })
})
