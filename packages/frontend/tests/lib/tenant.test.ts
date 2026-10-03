import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError, Result, Schema } from "effect"

import { TenantAlias, TenantConfigError, TenantConfigService } from "../../src/lib/tenant/index.ts"
import { MixedCase, TenantAliasArb } from "../arbitraries.ts"
import * as Fixtures from "../fixtures.ts"

const configDir = "/tenant-test/config"
const hostResolution: Fixtures.ServerConfigOverride = {
  tenant: {
    configDir,
    resolution: "host"
  }
}
const staticResolution = (staticAlias: string): Fixtures.ServerConfigOverride => ({
  tenant: {
    configDir,
    resolution: "static",
    staticAlias
  }
})
const requestedAlias = Schema.decodeUnknownSync(TenantAlias)("springfield")
const requestedPath = `${configDir}/springfield.json`
const tenantDocument = {
  displayName: "Springfield Schools",
  oidc: { clientAuth: "public", clientId: "springfield-client", issuer: "https://id.example/springfield" }
}
const otherDocument = {
  displayName: "Shelbyville Schools",
  oidc: { clientAuth: "confidential", clientId: "shelbyville-client", issuer: "https://id.example/shelbyville" }
}
const fileError = (path: string, reason: "NotFound" | "PermissionDenied") =>
  PlatformError.systemError({
    _tag: reason,
    method: "readFileString",
    module: "FileSystem",
    pathOrDescriptor: path
  })

const scenario = (
  config: Fixtures.ServerConfigOverride,
  files: ReadonlyMap<string, PlatformError.PlatformError | string> = new Map()
) =>
  TenantConfigService.layer(Fixtures.buildServerConfig(config)).pipe(
    Layer.provide(Path.layer),
    Layer.provide(FileSystem.layerNoop({
      readFileString: (path) => {
        const entry = files.get(path)
        return typeof entry === "string"
          ? Effect.succeed(entry)
          : Effect.fail(entry ?? fileError(path, "NotFound"))
      }
    }))
  )
const loadRequested = Effect.flatMap(TenantConfigService, (service) => service.getConfigFromAlias(requestedAlias))
const expectTenantFailure = <A>(operation: Effect.Effect<A, TenantConfigError, TenantConfigService>) =>
  Effect.gen(function*() {
    const error = yield* Effect.flip(operation)
    expect(error).toBeInstanceOf(TenantConfigError)
    return error
  })
const invalidHosts = [
  "",
  ".example.com",
  "tenant1.example.com",
  "tenant_name.example.com",
  "tenant name.example.com",
  "école.example.com"
]
const invalidAliases = ["", "Springfield", "tenant1", "tenant_name", "tenant.name", "tenant name", "école"]
const bothTenantFiles = new Map([
  [`${configDir}/shelbyville.json`, JSON.stringify(otherDocument)],
  [requestedPath, JSON.stringify(tenantDocument)]
])

describe("TenantConfigService", () => {
  describe(".getAlias", () => {
    describe("when tenant resolution is host-based", () => {
      it.effect.prop(
        "returns the lowercase first host label as the tenant alias",
        { alias: MixedCase(TenantAliasArb), baseHostname: Schema.URL },
        ({ alias, baseHostname }) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            const result = service.getAlias(`${alias}.${baseHostname}`)
            expect(result).toEqual(Result.succeed(alias.toLowerCase()))
          }).pipe(Effect.provide(
            scenario({
              baseHostname: baseHostname.hostname,
              tenant: {
                resolution: "host"
              }
            })
          ))
      )
    })

    describe("when tenant resolution is static", () => {
      it.effect.prop("returns the configured alias regardless of the supplied host, including an empty host", {
        alias: TenantAliasArb,
        host: Schema.String
      }, ({ alias, host }) =>
        Effect.gen(function*() {
          const service = yield* TenantConfigService
          for (const input of [host, "", "other.example.com"]) {
            expect(service.getAlias(input)).toEqual(Result.succeed(alias))
          }
        }).pipe(Effect.provide(scenario(staticResolution(alias)))))
      it.effect.each(invalidAliases)(
        "fails with TenantConfigError when the configured alias is empty or contains characters other than lowercase letters and hyphens" +
          ": %s",
        (alias) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            const error = yield* Effect.fromResult(Result.flip(service.getAlias("springfield.example.com")))
            expect(error).toBeInstanceOf(TenantConfigError)
          }).pipe(Effect.provide(scenario(staticResolution(alias))))
      )
    })
  })

  describe(".getConfigFromAlias", () => {
    it.effect("reads the file named for the requested alias", () =>
      Effect.gen(function*() {
        expect((yield* loadRequested).displayName).toBe(tenantDocument.displayName)
      }).pipe(Effect.provide(scenario(hostResolution, bothTenantFiles))))
    it.effect("reads the requested alias's file even when static resolution selects another tenant", () =>
      Effect.gen(function*() {
        expect((yield* loadRequested).displayName).toBe(tenantDocument.displayName)
      }).pipe(Effect.provide(scenario(staticResolution("shelbyville"), bothTenantFiles))))

    describe("when the alias file cannot be read", () => {
      it.effect.each(["NotFound", "PermissionDenied"] as const)(
        "fails with TenantConfigError for that file and retains the underlying cause" + ": %s",
        (reason) => {
          const cause = fileError(requestedPath, reason)
          const files = new Map<string, PlatformError.PlatformError | string>([
            [`${configDir}/shelbyville.json`, JSON.stringify(otherDocument)],
            [requestedPath, cause]
          ])
          return Effect.gen(function*() {
            const error = yield* expectTenantFailure(loadRequested)
            expect(error.message).toContain("Failed to read")
            expect(error.message).toContain(requestedPath)
            expect(error.cause).toBe(cause)
          }).pipe(Effect.provide(scenario(hostResolution, files)))
        }
      )
    })
  })

  describe(".getConfigFromHost", () => {
    describe("when tenant resolution is host-based", () => {
      it.effect.prop("reads the file named for the alias in the host", {
        alias: TenantAliasArb
      }, ({ alias }) =>
        Effect.gen(function*() {
          const service = yield* TenantConfigService
          const fromHost = yield* service.getConfigFromHost(`${alias.toUpperCase()}.example.com`)
          const fromNeighbor = yield* service.getConfigFromHost(`other-${alias}.example.com`)
          expect(fromHost.displayName).toBe(tenantDocument.displayName)
          expect(fromNeighbor.displayName).toBe(otherDocument.displayName)
        }).pipe(Effect.provide(scenario(
          hostResolution,
          new Map([
            [`${configDir}/${alias}.json`, JSON.stringify(tenantDocument)],
            [`${configDir}/other-${alias}.json`, JSON.stringify(otherDocument)]
          ])
        ))))
      it.effect.each(invalidHosts)(
        "fails with TenantConfigError when the host cannot resolve to a valid alias" + ": %s",
        (host) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            const error = yield* expectTenantFailure(service.getConfigFromHost(host))
            expect(error.message).toContain("Failed to read tenant alias")
          }).pipe(Effect.provide(scenario(hostResolution)))
      )
    })

    describe("when tenant resolution is static", () => {
      it.effect.prop("reads the configured alias's file regardless of the supplied host", {
        host: Schema.String
      }, ({ host }) =>
        Effect.gen(function*() {
          const service = yield* TenantConfigService
          for (const input of [host, "", "shelbyville.example.com"]) {
            const config = yield* service.getConfigFromHost(input)
            expect(config.displayName).toBe(tenantDocument.displayName)
          }
        }).pipe(Effect.provide(scenario(staticResolution("springfield"), bothTenantFiles))))
      it.effect.each(invalidAliases)(
        "fails with TenantConfigError when the configured static alias is invalid" + ": %s",
        (alias) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            const error = yield* expectTenantFailure(service.getConfigFromHost("springfield.example.com"))
            expect(error.message).toContain("Failed to read tenant alias from config")
          }).pipe(Effect.provide(scenario(staticResolution(alias))))
      )
    })

    describe("when the resolved alias's file cannot be read", () => {
      it.effect.each(["host", "static"] as const)(
        "fails with TenantConfigError for that file without reading another tenant's file" + ": %s",
        (mode) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            const error = yield* expectTenantFailure(service.getConfigFromHost("springfield.example.com"))
            expect(error.message).toContain("Failed to read")
            expect(error.message).toContain(requestedPath)
          }).pipe(Effect.provide(scenario(
            mode === "host" ? hostResolution : staticResolution("springfield"),
            new Map([[`${configDir}/shelbyville.json`, JSON.stringify(otherDocument)]])
          )))
      )
    })
  })
})
