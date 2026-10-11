import { Effect, FileSystem, Logger, Path, PlatformError, References, Result, Tracer } from "effect"
import { describe, expect, it } from "vitest"

import { TenantConfigService } from "../../src/lib/tenant.ts"

const runScenario = async (
  resolution: "host" | "static",
  fileSystem: Partial<FileSystem.FileSystem>,
  host = "customer.example.test",
  fromAlias = false
) => {
  const logs: { level: string; message: unknown }[] = []
  const spans: Tracer.NativeSpan[] = []
  const logger = Logger.make(({ logLevel, message }: Logger.Options<unknown>) => {
    logs.push({ level: logLevel, message })
  })
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  const tenant = resolution === "host" ?
    { baseHostname: "example.test", configDir: "/tenant-config", resolution } :
    { configDir: "/tenant-config", resolution, staticAlias: "customer" }

  const result = await Effect.gen(function*() {
    const service = yield* TenantConfigService
    if (fromAlias) {
      const alias = yield* Effect.fromResult(service.getAlias(host))
      return yield* service.getConfigFromAlias(alias).pipe(Effect.result)
    }
    return yield* service.getConfigFromHost(host).pipe(Effect.result)
  }).pipe(
    Effect.provide(TenantConfigService.layer({ env: "test", tenant })),
    Effect.provide(FileSystem.layerNoop({ readDirectory: () => Effect.succeed([]), ...fileSystem })),
    Effect.provide(Path.layer),
    Effect.provide(Logger.layer([logger])),
    Effect.provideService(References.MinimumLogLevel, "Debug"),
    Effect.withTracer(tracer),
    Effect.runPromise
  )

  return { logs, result, spans }
}

const readFailure = (reason: "NotFound" | "PermissionDenied") =>
  Effect.fail(PlatformError.systemError({
    _tag: reason,
    method: "readFileString",
    module: "FileSystem",
    pathOrDescriptor: "/tenant-config/customer.json"
  }))

describe.each(["host", "static"] as const)("tenant telemetry in %s mode", (resolution) => {
  it.each([false, true])("omits tenant identifiers from logs and span attributes (fromAlias=%s)", async (fromAlias) => {
    const { logs, result, spans } = await runScenario(
      resolution,
      {
        readFileString: () => Effect.succeed("{\"displayName\":\"Customer Organization\"}")
      },
      undefined,
      fromAlias
    )

    expect(result).toStrictEqual(Result.succeed({ displayName: "Customer Organization" }))
    expect(logs.some((log) => log.level === "Debug")).toBe(true)
    expect(logs.filter((log) => log.level === "Warn")).toHaveLength(0)
    const emittedLogs = JSON.stringify(logs)
    for (const identifier of ["customer", "Customer Organization", "example.test", "/tenant-config"]) {
      expect(emittedLogs).not.toContain(identifier)
    }
    expect(spans.map((span) => span.name)).toEqual(
      fromAlias ?
        ["TenantConfigService.getConfigFromAlias"] :
        ["TenantConfigService.getConfigFromHost", "TenantConfigService.getConfigFromAlias"]
    )
    for (const span of spans) {
      expect(Object.fromEntries(span.attributes)).toEqual({ "tenant.resolution": resolution })
      expect(span.status._tag).toBe("Ended")
    }
  })

  it.each([
    { read: readFailure("NotFound"), reason: "not-found", status: resolution === "static" ? 500 : 404 },
    { read: readFailure("PermissionDenied"), reason: "read", status: 404 },
    { read: Effect.succeed("{"), reason: "json", status: 404 },
    { read: Effect.succeed("{\"displayName\":42}"), reason: "schema", status: 404 }
  ])("warns once for $reason failures and preserves status $status", async ({ read, reason, status }) => {
    const { logs, result } = await runScenario(resolution, { readFileString: () => read })

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.status).toBe(status)
      expect(result.failure.cause).toBeInstanceOf(Error)
    }
    expect(logs.filter((log) => log.level === "Warn").map((log) => log.message)).toEqual([
      ["Tenant configuration request failed", { _tag: status === 500 ? "TenantReadError" : "TenantNotFound", reason }]
    ])
  })
})
