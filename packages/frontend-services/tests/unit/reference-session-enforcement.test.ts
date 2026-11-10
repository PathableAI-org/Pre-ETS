import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, References, Result, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"

import { readSessionRequest } from "../../src/next.ts"
import {
  type NoUsableSession,
  SessionService,
  SessionServiceUnavailable,
  SessionTenantMismatch,
  type UsableSession
} from "../../src/session.ts"
import { TenantAlias, type TenantConfig, TenantConfigService, type TenantFailure } from "../../src/tenant.ts"
import { ForbiddenError, NotFoundError, RedirectError } from "./next-navigation-stub.ts"

const runtime = vi.hoisted(() => ({ runPromise: vi.fn() }))
vi.mock("../../src/runtime.ts", () => ({ Runtime: runtime }))

const alias = Schema.decodeSync(TenantAlias)("springfield")
const tenantConfig: TenantConfig = {
  displayName: "Springfield",
  oidc: { clientAuth: "public", clientId: "springfield-web", issuer: "https://provider.test" }
}
const identity = { issuer: "https://provider.test/", subject: "subject-1" }
const usableSession: UsableSession = {
  _tag: "UsableSession",
  identity,
  idleDeadlineEpochMilliseconds: 1_800_000_000_000,
  observedAtEpochMilliseconds: 1_799_999_999_000,
  revision: 3,
  tenantAlias: alias,
  warningLeadMinutes: 5
}
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }

const staticFailure = Effect.gen(function*() {
  const service = yield* TenantConfigService
  const result = service.getAlias("ignored.example.test")
  if (Result.isSuccess(result)) throw new Error("expected static alias failure")
  return result.failure
}).pipe(
  Effect.provide(
    TenantConfigService.layer({ configDir: "/tenant-config", resolution: "static", staticAlias: "NOT-VALID" }).pipe(
      Layer.provide(NodeServices.layer)
    )
  ),
  Effect.provideService(References.MinimumLogLevel, "Error"),
  Effect.runSync
)

interface RecordedTenant {
  readonly events: string[]
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantFailure>
  readonly getConfigFromAlias: (selected: TenantAlias) => Effect.Effect<TenantConfig, (typeof staticFailure)>
}

const tenantDouble = (
  getAlias: RecordedTenant["getAlias"],
  getConfigFromAlias: RecordedTenant["getConfigFromAlias"] = (selected) => {
    recorded.events.push(`config:${selected}`)
    return Effect.succeed(tenantConfig)
  }
): TenantConfigService["Service"] => ({
  getAlias,
  getConfigFromAlias,
  getConfigFromHost: () => Effect.die("getConfigFromHost must remain unused")
})

const recorded: { events: string[] } = { events: [] }

const install = (
  session: SessionService["Service"],
  tenant: TenantConfigService["Service"]
) => {
  recorded.events = []
  runtime.runPromise.mockImplementation((
    program: Effect.Effect<unknown, unknown, SessionService | TenantConfigService>
  ) =>
    Effect.runPromise(program.pipe(
      Effect.provide(Layer.mergeAll(
        Layer.succeed(SessionService, session),
        Layer.succeed(TenantConfigService, tenant)
      ))
    ))
  )
}

const sessionDouble = (
  readForTenant: SessionService["Service"]["readForTenant"]
): SessionService["Service"] => ({
  establish: () => Effect.die("establish must remain unused"),
  invalidate: () => Effect.die("invalidate must remain unused"),
  read: () => Effect.die("read must remain unused"),
  readForTenant: (input) => {
    recorded.events.push(`read:${input.tenantAlias}`)
    return readForTenant(input)
  },
  refreshForTenant: () => Effect.die("refreshForTenant must remain unused")
})

const publicDiagnostic = (value: unknown): string => {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const visit = (current: unknown): void => {
    if (typeof current === "string") {
      parts.push(current)
      return
    }
    if (typeof current !== "object" || current === null || seen.has(current)) return
    seen.add(current)
    if (current instanceof Error) parts.push(current.message)
    for (const key of Object.getOwnPropertyNames(current)) {
      visit((current as Record<string, unknown>)[key])
    }
  }
  visit(value)
  return parts.join("\n")
}

describe("readSessionRequest [PREETS-SESSION-005, PREETS-TENANT-003]", () => {
  it("selects a directly resolved alias before session admission and returns that usable session", async () => {
    const calls: string[] = []
    install(
      sessionDouble(() => Effect.succeed(usableSession)),
      tenantDouble((host) => {
        calls.push(host)
        recorded.events.push(`alias:${host}`)
        return Result.succeed(alias)
      })
    )

    const resolved = await readSessionRequest({ host: "bad host", reference: "opaque-reference" })

    expect(calls).toEqual(["bad host"])
    expect(recorded.events).toEqual(["alias:bad host", "config:springfield", "read:springfield"])
    expect(resolved.tenantAlias).toBe(alias)
    expect(resolved.session).toBe(usableSession)
  })

  it("attaches a coordination snapshot to a usable session without its reference or identity", async () => {
    install(
      sessionDouble(() => Effect.succeed(usableSession)),
      tenantDouble(() => Result.succeed(alias))
    )

    const before = Date.now()
    const resolved = await readSessionRequest({ host: "springfield.example.test", reference: "opaque-reference" })
    const after = Date.now()

    expect(resolved.coordination).toBeDefined()
    const { coordinationTag, serverTimeEpochMilliseconds, ...policy } = resolved.coordination ?? {
      coordinationTag: "",
      serverTimeEpochMilliseconds: Number.NaN
    }
    expect(coordinationTag).toMatch(/^[\w-]{43}$/)
    expect(serverTimeEpochMilliseconds).toBeGreaterThanOrEqual(before)
    expect(serverTimeEpochMilliseconds).toBeLessThanOrEqual(after)
    expect(policy).toStrictEqual({
      idleDeadlineEpochMilliseconds: usableSession.idleDeadlineEpochMilliseconds,
      observedAtEpochMilliseconds: usableSession.observedAtEpochMilliseconds,
      revision: usableSession.revision,
      warningLeadMinutes: usableSession.warningLeadMinutes
    })
    const diagnostic = publicDiagnostic(resolved.coordination)
    expect(diagnostic).not.toContain("opaque-reference")
    expect(diagnostic).not.toContain("subject-1")
    expect(diagnostic).not.toContain("https://provider.test/")
  })

  it("loads the selected configuration before reading the tenant-bound session", async () => {
    let readCalled = false
    install(
      sessionDouble(() => {
        readCalled = true
        return Effect.succeed(usableSession)
      }),
      tenantDouble(
        (host) => {
          recorded.events.push(`alias:${host}`)
          return Result.succeed(alias)
        },
        () => Effect.fail(staticFailure)
      )
    )

    const error = await readSessionRequest({ host: "springfield.example.test" }).then(
      () => undefined,
      (caught: unknown) => caught
    )

    expect(recorded.events[0]).toBe("alias:springfield.example.test")
    expect(readCalled).toBe(false)
    expect(error).toBe(staticFailure)
    expect(error).not.toBeInstanceOf(ForbiddenError)
    expect(error).not.toBeInstanceOf(RedirectError)
  })

  it("rejects a tenant mismatch through forbidden without a resolved session", async () => {
    install(
      sessionDouble(() => Effect.fail(new SessionTenantMismatch({}))),
      tenantDouble((host) => {
        recorded.events.push(`alias:${host}`)
        return Result.succeed(alias)
      })
    )

    const error = await readSessionRequest({ host: "springfield.example.test", reference: "opaque-reference" }).then(
      () => undefined,
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(ForbiddenError)
    expect(error).not.toHaveProperty("session")
    const diagnostic = publicDiagnostic(error)
    expect(diagnostic).not.toContain("subject-1")
    expect(diagnostic).not.toContain("https://provider.test/")
    expect(diagnostic).not.toContain("springfield")
    expect(diagnostic).not.toContain("opaque-reference")
  })

  it("passes NoUsableSession through with no protected fields", async () => {
    install(
      sessionDouble(() => Effect.succeed(noUsableSession)),
      tenantDouble(() => Result.succeed(alias))
    )

    const resolved = await readSessionRequest({ host: "springfield.example.test" })

    expect(resolved.session).toBe(noUsableSession)
    expect(resolved.session).toStrictEqual({ _tag: "NoUsableSession" })
    expect(resolved.coordination).toBeUndefined()
    expect(publicDiagnostic(resolved.session)).not.toContain("subject-1")
    expect(publicDiagnostic(resolved.session)).not.toContain("springfield")
  })

  it("keeps session service failure distinct from absence, mismatch, and success", async () => {
    install(
      sessionDouble(() => Effect.fail(new SessionServiceUnavailable({}))),
      tenantDouble(() => Result.succeed(alias))
    )

    const error = await readSessionRequest({ host: "springfield.example.test", reference: "opaque-reference" }).then(
      () => undefined,
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(SessionServiceUnavailable)
    expect(error).not.toBeInstanceOf(SessionTenantMismatch)
    expect(error).not.toBeInstanceOf(ForbiddenError)
    expect(error).not.toBeInstanceOf(NotFoundError)
    expect(error).not.toBeInstanceOf(RedirectError)
    const diagnostic = publicDiagnostic(error)
    expect(diagnostic).not.toContain("subject-1")
    expect(diagnostic).not.toContain("https://provider.test/")
    expect(diagnostic).not.toContain("springfield")
    expect(diagnostic).not.toContain("opaque-reference")
    expect(diagnostic).not.toContain("pathable-session")
  })
})
