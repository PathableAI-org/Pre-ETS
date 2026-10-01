import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, Effect, FileSystem, Layer, Path, PlatformError, Result, Schema } from "effect"

import type { TenantConfig as TenantResolution } from "../../src/lib/config/index.ts"

import { TenantAlias, TenantConfigError, TenantConfigService } from "../../src/lib/tenant/index.ts"

const configDir = "/tenant-test/config"
const hostResolution: TenantResolution = { configDir, resolution: "host" }
const staticResolution = (staticAlias: string): TenantResolution => ({ configDir, resolution: "static", staticAlias })
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
const expectedConfig = { ...tenantDocument, idleTimeoutMinutes: 30 }
const fileError = (path: string, reason: "NotFound" | "PermissionDenied") =>
  PlatformError.systemError({
    _tag: reason,
    method: "readFileString",
    module: "FileSystem",
    pathOrDescriptor: path
  })

// Only the platform dependency is simulated; the real service reads and decodes each document.
const scenario = (
  tenant: TenantResolution = hostResolution,
  files: ReadonlyMap<string, PlatformError.PlatformError | string> = new Map()
) =>
  TenantConfigService.layer({ env: "test", tenant }).pipe(
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
const documentScenario = (document: unknown) =>
  scenario(
    hostResolution,
    new Map([
      [requestedPath, JSON.stringify(document)]
    ])
  )
const loadRequested = Effect.flatMap(TenantConfigService, (service) => service.getConfigFromAlias(requestedAlias))
const expectTenantFailure = <A>(operation: Effect.Effect<A, TenantConfigError, TenantConfigService>) =>
  Effect.gen(function*() {
    const error = yield* Effect.flip(operation)
    expect(error).toBeInstanceOf(TenantConfigError)
    return error
  })
const aliasArbitrary = Arbitrary.array(
  Arbitrary.schema(
    Schema.Literals([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "s",
      "t",
      "u",
      "v",
      "w",
      "x",
      "y",
      "z",
      "-"
    ])
  ),
  { maxLength: 63, minLength: 1 }
).pipe(Arbitrary.map((characters) => characters.join("")))
const invalidHosts = [
  "",
  ".example.com",
  "tenant1.example.com",
  "tenant_name.example.com",
  "tenant name.example.com",
  "école.example.com"
]
const invalidAliases = ["", "Springfield", "tenant1", "tenant_name", "tenant.name", "tenant name", "école"]
const invalidDocuments = [
  { case: "missing display name", value: { oidc: tenantDocument.oidc } },
  { case: "numeric display name", value: { ...tenantDocument, displayName: 42 } },
  { case: "missing OIDC", value: { displayName: tenantDocument.displayName } },
  { case: "numeric OIDC", value: { ...tenantDocument, oidc: 42 } },
  ...["clientAuth", "clientId", "issuer"].flatMap((field) => [
    {
      case: `missing ${field}`,
      value: {
        ...tenantDocument,
        oidc: Object.fromEntries(Object.entries(tenantDocument.oidc).filter(([key]) => key !== field))
      }
    },
    { case: `numeric ${field}`, value: { ...tenantDocument, oidc: { ...tenantDocument.oidc, [field]: 42 } } }
  ])
]

describe("TenantConfigService", () => {
  describe(".getAlias", () => {
    describe("when tenant resolution is host-based", () => {
      it.effect.prop(
        "returns the lowercase first host label as the tenant alias",
        { alias: aliasArbitrary },
        ({ alias }) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            for (const host of [alias.toUpperCase(), `${alias.toUpperCase()}.OTHER.example:3000`]) {
              expect(service.getAlias(host)).toEqual(Result.succeed(alias))
            }
          }).pipe(Effect.provide(scenario()))
      )
      it.effect.each(["a", "north-school", "-", "-north", "north-", "north--school"])(
        "accepts tenant labels containing lowercase letters and hyphens" + ": %s",
        (alias) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            expect(service.getAlias(`${alias}.example.com`)).toEqual(Result.succeed(alias))
          }).pipe(Effect.provide(scenario()))
      )
      it.effect.each(invalidHosts)(
        "fails with TenantConfigError when the first label is empty or contains characters other than letters and hyphens" +
          ": %s",
        (host) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            const error = yield* Effect.fromResult(Result.flip(service.getAlias(host)))
            expect(error).toBeInstanceOf(TenantConfigError)
          }).pipe(Effect.provide(scenario()))
      )
    })

    describe("when tenant resolution is static", () => {
      it.effect.prop("returns the configured alias regardless of the supplied host, including an empty host", {
        alias: aliasArbitrary,
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
    describe("when the alias has a valid JSON file in the configured tenant directory", () => {
      it.effect("returns that alias's display name and OIDC configuration", () =>
        Effect.gen(function*() {
          expect(yield* loadRequested).toEqual(expectedConfig)
        }).pipe(Effect.provide(documentScenario(tenantDocument))))
      it.effect("uses the explicitly requested alias even when static resolution selects another tenant", () =>
        Effect.gen(function*() {
          expect(yield* loadRequested).toEqual(expectedConfig)
        }).pipe(Effect.provide(scenario(
          staticResolution("shelbyville"),
          new Map([
            [`${configDir}/shelbyville.json`, JSON.stringify(otherDocument)],
            [requestedPath, JSON.stringify(tenantDocument)]
          ])
        ))))
    })

    describe("when the tenant file cannot be read", () => {
      it.effect("fails with TenantConfigError for a missing file", () =>
        expectTenantFailure(loadRequested).pipe(Effect.provide(scenario())))
      it.effect("fails with TenantConfigError for an inaccessible file", () =>
        expectTenantFailure(loadRequested).pipe(
          Effect.provide(
            scenario(hostResolution, new Map([[requestedPath, fileError(requestedPath, "PermissionDenied")]]))
          )
        ))
      it.effect.each(["NotFound", "PermissionDenied"] as const)(
        "identifies the read failure and affected file in its message and retains the underlying cause" + ": %s",
        (reason) => {
          const cause = fileError(requestedPath, reason)
          return Effect.gen(function*() {
            const error = yield* expectTenantFailure(loadRequested)
            expect(error.message).toContain("Failed to read")
            expect(error.message).toContain(requestedPath)
            expect(error.cause).toBe(cause)
          }).pipe(Effect.provide(scenario(hostResolution, new Map([[requestedPath, cause]]))))
        }
      )
    })

    describe("when the tenant file cannot be decoded", () => {
      it.effect.each(["{", "not json", ""])(
        "fails with TenantConfigError for malformed JSON" + ": %j",
        (raw) =>
          expectTenantFailure(loadRequested).pipe(
            Effect.provide(scenario(hostResolution, new Map([[requestedPath, raw]])))
          )
      )
      it.effect.each(invalidDocuments)(
        "fails with TenantConfigError when required display name or OIDC fields are missing or have the wrong type" +
          ": $case",
        ({ value }) => expectTenantFailure(loadRequested).pipe(Effect.provide(documentScenario(value)))
      )
      it.effect.each(["{", JSON.stringify({})])(
        "identifies the parse failure and affected file in its message and retains the underlying cause" + ": %s",
        (raw) =>
          Effect.gen(function*() {
            const error = yield* expectTenantFailure(loadRequested)
            expect(error.message).toContain("Failed to parse")
            expect(error.message).toContain(requestedPath)
            expect(error.cause).toBeInstanceOf(Schema.SchemaError)
            expect(error.cause.message.length).toBeGreaterThan(0)
          }).pipe(Effect.provide(scenario(hostResolution, new Map([[requestedPath, raw]]))))
      )
    })

    describe("idle timeout policy", () => {
      it.effect("defaults idleTimeoutMinutes to 30 when the field is omitted", () =>
        Effect.gen(function*() {
          expect((yield* loadRequested).idleTimeoutMinutes).toBe(30)
        }).pipe(Effect.provide(documentScenario(tenantDocument))))
      it.effect.each(Array.from({ length: 26 }, (_, index) => index + 5))(
        "preserves integer idleTimeoutMinutes values from 5 through 30, including both limits" + ": %i",
        (minutes) =>
          Effect.gen(function*() {
            expect((yield* loadRequested).idleTimeoutMinutes).toBe(minutes)
          }).pipe(Effect.provide(documentScenario({ ...tenantDocument, idleTimeoutMinutes: minutes })))
      )
      it.effect.each([4, 31, -1, 0, 5.5, 29.5, "10", null, true, {}, []])(
        "fails with TenantConfigError for out-of-range, fractional, or nonnumeric idleTimeoutMinutes values" + ": %j",
        (minutes) =>
          expectTenantFailure(loadRequested).pipe(
            Effect.provide(documentScenario({ ...tenantDocument, idleTimeoutMinutes: minutes }))
          )
      )
    })

    describe("OIDC configuration", () => {
      it.effect.each(["public", "confidential"])(
        "accepts both public and confidential client authentication modes" + ": %s",
        (clientAuth) =>
          Effect.gen(function*() {
            expect((yield* loadRequested).oidc.clientAuth).toBe(clientAuth)
          }).pipe(Effect.provide(documentScenario({ ...tenantDocument, oidc: { ...tenantDocument.oidc, clientAuth } })))
      )
      it.effect.prop(
        "fails with TenantConfigError for any other client authentication mode",
        {
          clientAuth: Arbitrary.schema(Schema.String).pipe(
            Arbitrary.filter((value) => value !== "public" && value !== "confidential")
          )
        },
        ({ clientAuth }) =>
          expectTenantFailure(loadRequested).pipe(
            Effect.provide(documentScenario({ ...tenantDocument, oidc: { ...tenantDocument.oidc, clientAuth } }))
          )
      )
      it.effect.prop("accepts an omitted connection and preserves a supplied string connection", {
        connection: Schema.String
      }, ({ connection }) =>
        Effect.gen(function*() {
          const omitted = yield* loadRequested.pipe(Effect.provide(documentScenario(tenantDocument)))
          expect(omitted.oidc).not.toHaveProperty("connection")
          for (const value of [connection, ""]) {
            const supplied = yield* loadRequested.pipe(
              Effect.provide(
                documentScenario({ ...tenantDocument, oidc: { ...tenantDocument.oidc, connection: value } })
              )
            )
            expect(supplied.oidc.connection).toBe(value)
          }
        }))
    })
  })

  describe(".getConfigFromHost", () => {
    describe("when tenant resolution is host-based", () => {
      it.effect.prop("returns the configuration belonging to the alias resolved from the supplied host", {
        alias: aliasArbitrary
      }, ({ alias }) =>
        Effect.gen(function*() {
          const service = yield* TenantConfigService
          expect(yield* service.getConfigFromHost(`${alias.toUpperCase()}.example.com`)).toEqual(expectedConfig)
          expect(yield* service.getConfigFromHost(`other-${alias}.example.com`)).toEqual({
            ...otherDocument,
            idleTimeoutMinutes: 30
          })
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
          }).pipe(Effect.provide(documentScenario(tenantDocument)))
      )
    })

    describe("when tenant resolution is static", () => {
      it.effect.prop("returns the configured tenant's configuration regardless of the supplied host", {
        host: Schema.String
      }, ({ host }) =>
        Effect.gen(function*() {
          const service = yield* TenantConfigService
          for (const input of [host, "", "shelbyville.example.com"]) {
            expect(yield* service.getConfigFromHost(input)).toEqual(expectedConfig)
          }
        }).pipe(Effect.provide(scenario(
          staticResolution("springfield"),
          new Map([
            [`${configDir}/shelbyville.json`, JSON.stringify(otherDocument)],
            [requestedPath, JSON.stringify(tenantDocument)]
          ])
        ))))
      it.effect.each(invalidAliases)(
        "fails with TenantConfigError when the configured static alias is invalid" + ": %s",
        (alias) =>
          Effect.gen(function*() {
            const service = yield* TenantConfigService
            const error = yield* expectTenantFailure(service.getConfigFromHost("springfield.example.com"))
            expect(error.message).toContain("Failed to read tenant alias from config")
          }).pipe(
            Effect.provide(
              scenario(staticResolution(alias), new Map([[requestedPath, JSON.stringify(tenantDocument)]]))
            )
          )
      )
    })

    describe("when the resolved tenant's configuration is unavailable or invalid", () => {
      it.effect.each(
        [
          { mode: "host", raw: undefined },
          { mode: "host", raw: "{" },
          { mode: "static", raw: undefined },
          { mode: "static", raw: "{" }
        ] as const
      )(
        "propagates the configuration failure as TenantConfigError without substituting another tenant's configuration" +
          ": $mode / $raw",
        ({ mode, raw }) => {
          const files = new Map([[`${configDir}/shelbyville.json`, JSON.stringify(otherDocument)]])
          if (raw !== undefined) files.set(requestedPath, raw)
          return Effect.gen(function*() {
            const service = yield* TenantConfigService
            const error = yield* expectTenantFailure(service.getConfigFromHost("springfield.example.com"))
            expect(error.message).toContain(requestedPath)
            expect(error.message).toContain(
              raw === undefined ? "Failed to read tenant config" : "Failed to parse tenant config"
            )
          }).pipe(Effect.provide(scenario(mode === "host" ? hostResolution : staticResolution("springfield"), files)))
        }
      )
    })
  })
})
