import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, References, Result, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"

import { readSessionRequest } from "../../src/session-request.ts"
import {
  type NoUsableSession,
  SessionService,
  SessionServiceUnavailable,
  SessionTenantMismatch,
  type UsableSession
} from "../../src/session.ts"
import { TenantAlias, type TenantConfig, TenantConfigService } from "../../src/tenant.ts"
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
  tenantAlias: alias,
  warningLeadMinutes: 5
}
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }

const hostFailure = (host: string) =>
  Effect.gen(function*() {
    const service = yield* TenantConfigService
    const result = service.getAlias(host)
    if (Result.isSuccess(result)) throw new Error(`expected host failure for ${host}`)
    return result.failure
  }).pipe(
    Effect.provide(TenantConfigService.layer({
      env: "test",
      tenant: { baseHostname: "example.test", configDir: "/tenant-config", resolution: "host" }
    })),
    Effect.provide(NodeServices.layer),
    Effect.provideService(References.MinimumLogLevel, "Error"),
    Effect.runSync
  )

const staticFailure = Effect.gen(function*() {
  const service = yield* TenantConfigService
  const result = service.getAlias("ignored.example.test")
  if (Result.isSuccess(result)) throw new Error("expected static alias failure")
  return result.failure
}).pipe(
  Effect.provide(TenantConfigService.layer({
    env: "test",
    tenant: { configDir: "/tenant-config", resolution: "static", staticAlias: "NOT-VALID" }
  })),
  Effect.provide(NodeServices.layer),
  Effect.provideService(References.MinimumLogLevel, "Error"),
  Effect.runSync
)

const directPortFailure = hostFailure("alias.localhost:3000")
const retryFailure = staticFailure

interface RecordedTenant {
  readonly events: string[]
  readonly getAlias: (host: string) => Result.Result<TenantAlias, (typeof directPortFailure)>
  readonly getConfigFromAlias: (selected: TenantAlias) => Effect.Effect<TenantConfig, (typeof retryFailure)>
}

const tenantDouble = (
  getAlias: RecordedTenant["getAlias"],
  getConfigFromAlias: RecordedTenant["getConfigFromAlias"] = (selected) => {
    recorded.events.push(`config:${selected}`)
    return Effect.succeed(tenantConfig)
  }
): TenantConfigService["Service"] => ({
  effectiveSessionPolicy: () => {
    throw new Error("effectiveSessionPolicy must remain unused")
  },
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
      Effect.provide(Layer.succeed(SessionService, session)),
      Effect.provide(Layer.succeed(TenantConfigService, tenant))
    ))
  )
}

const sessionDouble = (
  readForTenant: SessionService["Service"]["readForTenant"]
): SessionService["Service"] => ({
  establish: () => Effect.die("establish must remain unused"),
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

describe("readSessionRequest", () => {
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

  it("retries only the lowercase hostname after a portful host fails direct selection", async () => {
    install(
      sessionDouble(() => Effect.succeed(usableSession)),
      tenantDouble((host) => {
        recorded.events.push(`alias:${host}`)
        if (host === "alias.localhost:3000") return Result.fail(directPortFailure)
        if (host === "alias.localhost") return Result.succeed(alias)
        return Result.fail(directPortFailure)
      })
    )

    const resolved = await readSessionRequest({ host: "alias.localhost:3000" })

    expect(recorded.events).toEqual([
      "alias:alias.localhost:3000",
      "alias:alias.localhost",
      "config:springfield",
      "read:springfield"
    ])
    expect(resolved.session).toBe(usableSession)
  })

  it("preserves the original direct failure when the host cannot be normalized", async () => {
    const calls: string[] = []
    install(
      sessionDouble(() => Effect.die("readForTenant must remain unused")),
      tenantDouble((host) => {
        calls.push(host)
        return Result.fail(directPortFailure)
      })
    )

    const error = await readSessionRequest({ host: " alias.localhost" }).then(
      () => undefined,
      (caught: unknown) => caught
    )

    expect(calls).toEqual([" alias.localhost"])
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).not.toBeInstanceOf(RedirectError)
    expect(recorded.events).not.toContain("read:springfield")
    expect(String(error)).not.toContain("/auth/login")
  })

  it("preserves the original direct failure when the normalized retry also fails", async () => {
    install(
      sessionDouble(() => Effect.die("readForTenant must remain unused")),
      tenantDouble((host) => {
        recorded.events.push(`alias:${host}`)
        if (host === "alias.localhost:3000") return Result.fail(directPortFailure)
        return Result.fail(retryFailure)
      })
    )

    const error = await readSessionRequest({ host: "alias.localhost:3000" }).then(
      () => undefined,
      (caught: unknown) => caught
    )

    expect(recorded.events).toEqual(["alias:alias.localhost:3000", "alias:alias.localhost"])
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).not.toBe(retryFailure)
    expect(retryFailure.status).toBe(500)
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
        () => Effect.fail(retryFailure)
      )
    )

    const error = await readSessionRequest({ host: "springfield.example.test" }).then(
      () => undefined,
      (caught: unknown) => caught
    )

    expect(recorded.events[0]).toBe("alias:springfield.example.test")
    expect(readCalled).toBe(false)
    expect(error).toBe(retryFailure)
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
