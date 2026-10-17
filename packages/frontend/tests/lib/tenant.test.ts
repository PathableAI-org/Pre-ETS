import { NodeServices } from "@effect/platform-node"
import { Config, ConfigProvider, Effect, FileSystem, Path, PlatformError, References, Result } from "effect"
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { TenantConfigService } from "../../src/lib/tenant.ts"

const alpha = {
  displayName: "Alpha Organization",
  oidc: { clientAuth: "public", clientId: "alpha-client", issuer: "https://alpha.identity.test" }
}
const beta = {
  displayName: "Beta Organization",
  oidc: {
    clientAuth: "confidential",
    clientId: "beta-client",
    clientSecretRef: "beta/oidc",
    connection: "enterprise",
    issuer: "https://beta.identity.test"
  }
}

const resolutionConfig = (resolution: "host" | "static", configDir = "/tenant-config") =>
  resolution === "host" ?
    { baseHostname: "example.test", configDir, resolution } :
    { configDir, resolution, staticAlias: "alpha" }

const platformFailure = (reason: "NotFound" | "PermissionDenied", method = "readFileString") =>
  PlatformError.systemError({
    _tag: reason,
    method,
    module: "FileSystem",
    pathOrDescriptor: "/tenant-config"
  })

const withFiles = <A, E>(
  program: Effect.Effect<A, E, TenantConfigService>,
  files: ReadonlyMap<string, string>,
  resolution: "host" | "static" = "host",
  overrides: Partial<FileSystem.FileSystem> = {}
) =>
  program.pipe(
    Effect.provide(TenantConfigService.layer({ env: "test", tenant: resolutionConfig(resolution) })),
    Effect.provide(FileSystem.layerNoop({
      readDirectory: () => Effect.succeed([]),
      readFileString: (path) =>
        Effect.yieldNow.pipe(Effect.andThen(Effect.suspend(() => {
          const content = files.get(path)
          return content === undefined ? Effect.fail(platformFailure("NotFound")) : Effect.succeed(content)
        }))),
      ...overrides
    })),
    Effect.provide(Path.layer),
    Effect.provideService(References.MinimumLogLevel, "Error"),
    Effect.runPromise
  )

const readHost = (host = "alpha.example.test") =>
  Effect.gen(function*() {
    const service = yield* TenantConfigService
    return yield* service.getConfigFromHost(host).pipe(Effect.result)
  })

const readDocument = (document: unknown, resolution: "host" | "static" = "host") =>
  withFiles(readHost(), new Map([["/tenant-config/alpha.json", JSON.stringify(document)]]), resolution)

const expectFailure = (
  result: Result.Result<unknown, { readonly cause: Error; readonly status: number }>,
  status: number
) => {
  expect(Result.isFailure(result)).toBe(true)
  if (Result.isFailure(result)) {
    expect(result.failure.status).toBe(status)
    expect(result.failure.cause).toBeInstanceOf(Error)
  }
}

describe("TenantConfigService file configuration", () => {
  it.each([alpha, beta])("preserves the complete permitted document for $displayName", async (document) => {
    expect(await readDocument(document)).toStrictEqual(Result.succeed(document))
  })

  it("keeps omitted policy fields absent from the parsed document", async () => {
    const result = await readDocument(alpha)
    expect(result).toStrictEqual(Result.succeed(alpha))
    if (Result.isSuccess(result)) {
      expect(Object.hasOwn(result.success, "idleTimeoutMinutes")).toBe(false)
      expect(Object.hasOwn(result.success, "warningLeadMinutes")).toBe(false)
    }
  })

  it.each([
    { label: "missing displayName", value: { oidc: alpha.oidc } },
    { label: "numeric displayName", value: { ...alpha, displayName: 42 } },
    { label: "missing oidc", value: { displayName: "Alpha" } },
    { label: "null oidc", value: { ...alpha, oidc: null } },
    { label: "missing issuer", value: { ...alpha, oidc: { clientAuth: "public", clientId: "alpha" } } },
    { label: "numeric issuer", value: { ...alpha, oidc: { ...alpha.oidc, issuer: 123 } } },
    { label: "blank issuer", value: { ...alpha, oidc: { ...alpha.oidc, issuer: "  " } } },
    { label: "missing clientId", value: { ...alpha, oidc: { clientAuth: "public", issuer: "https://identity.test" } } },
    { label: "numeric clientId", value: { ...alpha, oidc: { ...alpha.oidc, clientId: 123 } } },
    { label: "blank clientId", value: { ...alpha, oidc: { ...alpha.oidc, clientId: " " } } },
    { label: "missing clientAuth", value: { ...alpha, oidc: { clientId: "alpha", issuer: "https://identity.test" } } },
    { label: "unknown clientAuth", value: { ...alpha, oidc: { ...alpha.oidc, clientAuth: "secret" } } },
    { label: "null connection", value: { ...alpha, oidc: { ...alpha.oidc, connection: null } } },
    { label: "numeric connection", value: { ...alpha, oidc: { ...alpha.oidc, connection: 1 } } },
    {
      label: "missing confidential reference",
      value: { ...alpha, oidc: { ...alpha.oidc, clientAuth: "confidential" } }
    },
    { label: "empty confidential reference", value: { ...beta, oidc: { ...beta.oidc, clientSecretRef: " " } } },
    { label: "numeric confidential reference", value: { ...beta, oidc: { ...beta.oidc, clientSecretRef: 12 } } },
    { label: "unknown root field", value: { ...alpha, extra: "unexpected" } },
    { label: "embedded root credential", value: { ...alpha, clientSecret: "synthetic-secret" } },
    {
      label: "embedded nested credential",
      value: { ...alpha, oidc: { ...alpha.oidc, clientSecret: "synthetic-secret" } }
    },
    { label: "unknown nested field", value: { ...alpha, oidc: { ...alpha.oidc, extra: "unexpected" } } },
    { label: "array root", value: [alpha] },
    { label: "null root", value: null }
  ])("rejects $label through the public service", async ({ value }) => {
    expectFailure(await readDocument(value), 404)
  })

  it("reads explicitly requested aliases even when static resolution selects another tenant", async () => {
    const requested = await withFiles(
      Effect.gen(function*() {
        const service = yield* TenantConfigService
        return yield* Effect.fromResult(service.getAlias("beta.example.test"))
      }),
      new Map()
    )
    const result = await withFiles(
      Effect.gen(function*() {
        const service = yield* TenantConfigService
        return yield* service.getConfigFromAlias(requested)
      }),
      new Map([["/tenant-config/beta.json", JSON.stringify(beta)]]),
      "static"
    )
    expect(result).toStrictEqual(beta)
  })

  it("uses the configured static tenant regardless of the supplied host", async () => {
    const result = await withFiles(
      Effect.gen(function*() {
        const service = yield* TenantConfigService
        return yield* Effect.forEach(["", "beta.example.test", "unrelated.test"], service.getConfigFromHost)
      }),
      new Map([["/tenant-config/alpha.json", JSON.stringify(alpha)]]),
      "static"
    )
    expect(result).toStrictEqual([alpha, alpha, alpha])
  })

  it("isolates interleaved and concurrent selected files while preserving the process provider", async () => {
    const processProvider = ConfigProvider.fromUnknown({ processToken: "process-setting" })
    const result = await withFiles(
      Effect.gen(function*() {
        const service = yield* TenantConfigService
        const sequence = ["alpha", "beta", "alpha", "beta"]
        const sequential = yield* Effect.forEach(
          sequence,
          (alias) => service.getConfigFromHost(`${alias}.example.test`)
        )
        const concurrent = yield* Effect.forEach(
          sequence,
          (alias) => service.getConfigFromHost(`${alias}.example.test`),
          {
            concurrency: "unbounded"
          }
        )
        const processToken = yield* Config.String("processToken")
        return { concurrent, processToken, sequential }
      }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, processProvider)),
      new Map([
        ["/tenant-config/alpha.json", JSON.stringify(alpha)],
        ["/tenant-config/beta.json", JSON.stringify(beta)]
      ])
    )
    expect(result).toStrictEqual({
      concurrent: [alpha, beta, alpha, beta],
      processToken: "process-setting",
      sequential: [alpha, beta, alpha, beta]
    })
  })

  it.each(["host", "static"] as const)(
    "preserves selected-file failures in %s mode without substitution",
    async (resolution) => {
      const files = new Map([["/tenant-config/beta.json", JSON.stringify(beta)]])
      expectFailure(await withFiles(readHost(), files, resolution), resolution === "static" ? 500 : 404)
      files.set("/tenant-config/alpha.json", "{\"displayName\":")
      expectFailure(await withFiles(readHost(), files, resolution), 404)
      files.set("/tenant-config/alpha.json", JSON.stringify({ ...alpha, oidc: null }))
      expectFailure(await withFiles(readHost(), files, resolution), 404)
      expectFailure(
        await withFiles(readHost(), files, resolution, {
          readFileString: () => Effect.fail(platformFailure("PermissionDenied"))
        }),
        404
      )
    }
  )

  it.each(["host", "static"] as const)("reports an unavailable directory as 500 in %s mode", async (resolution) => {
    expectFailure(
      await withFiles(readHost(), new Map(), resolution, {
        readDirectory: () => Effect.fail(platformFailure("NotFound", "readDirectory"))
      }),
      500
    )
    expectFailure(
      await withFiles(readHost(), new Map(), resolution, {
        readDirectory: () => Effect.fail(platformFailure("PermissionDenied", "readDirectory"))
      }),
      500
    )
  })

  it("rejects an unresolvable host through the configuration operation", async () => {
    expectFailure(await withFiles(readHost("unrelated.test"), new Map()), 404)
  })

  it("reads updates and deletions from an owned real directory without affecting another tenant", async () => {
    const directory = await mkdtemp(join(tmpdir(), "preets-tenant-loader-"))
    try {
      await writeFile(join(directory, "alpha.json"), JSON.stringify(alpha))
      await writeFile(join(directory, "beta.json"), JSON.stringify(beta))
      const result = await Effect.gen(function*() {
        const service = yield* TenantConfigService
        const first = yield* service.getConfigFromHost("alpha.example.test")
        const updated = { ...alpha, displayName: "Updated Alpha" }
        yield* Effect.promise(() => writeFile(join(directory, "alpha.json"), JSON.stringify(updated)))
        const second = yield* service.getConfigFromHost("alpha.example.test")
        yield* Effect.promise(() => unlink(join(directory, "alpha.json")))
        const deleted = yield* service.getConfigFromHost("alpha.example.test").pipe(Effect.result)
        const other = yield* service.getConfigFromHost("beta.example.test")
        return { deleted, first, other, second }
      }).pipe(
        Effect.provide(TenantConfigService.layer({ env: "test", tenant: resolutionConfig("host", directory) })),
        Effect.provide(NodeServices.layer),
        Effect.provideService(References.MinimumLogLevel, "Error"),
        Effect.runPromise
      )
      expect(result.first).toStrictEqual(alpha)
      expect(result.second).toStrictEqual({ ...alpha, displayName: "Updated Alpha" })
      expectFailure(result.deleted, 404)
      expect(result.other).toStrictEqual(beta)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
