/**
 * Resolves a request host to a tenant alias and loads that tenant's configuration file.
 *
 * Host mode reads the alias from the label before the configured base hostname. A port in the Host never changes
 * the selected alias; hostnames compare case-insensitively. Static mode uses the configured
 * alias for every host. The loaded file is `{alias}.json` under the configured tenant directory.
 */
import "server-only"
import { Context, Effect, FileSystem, Layer, Path, type PlatformError, Result, Schema, SchemaIssue } from "effect"

import type { StaticTenantResolution, TenantResolutionSettings } from "./config.js"

import { parseRequestHost } from "./request-host.js"
import { decodeTenantConfig, effectiveSessionPolicy, type SessionPolicy, type TenantConfig } from "./tenant/config.js"

export { effectiveSessionPolicy }
export type { SessionPolicy, TenantConfig }

/**
 * Expected failure from tenant alias resolution or configuration loading. Host adapters choose the HTTP outcome.
 *
 * @category errors
 */
export type TenantFailure = TenantNotFound | TenantReadError

/**
 * The selected tenant file is missing, is not valid JSON, or does not match the tenant configuration schema.
 *
 * Static mode reports a missing selected file as {@link TenantReadError} instead. `cause` is a sanitized summary;
 * it never carries file contents or the raw platform error.
 *
 * @category errors
 */
export class TenantNotFound extends Schema.TaggedError<TenantNotFound>()("TenantNotFound", {
  cause: Schema.Defect(),
  message: Schema.String
}) {}

/**
 * The tenant configuration directory is unavailable, or static mode cannot read the selected file.
 *
 * @category errors
 */
export class TenantReadError extends Schema.TaggedError<TenantReadError>()("TenantReadError", {
  cause: Schema.Defect(),
  message: Schema.String
}) {}

/**
 * Tenant slug schema: a non-empty string of lowercase letters and hyphens.
 *
 * @category models
 */
export const TenantAlias = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[a-z-]+$/)),
  Schema.brand("TenantAlias")
)

/**
 * Decoded tenant slug.
 *
 * @category models
 */
export type TenantAlias = typeof TenantAlias.Type

const decodeTenantAlias = Schema.decodeResult(TenantAlias)

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const hostAliasError = (host: string, cause: Error): TenantNotFound =>
  new TenantNotFound({
    cause,
    message: `Failed to read tenant alias from HOST: "${host}"`
  })

/** Matches the parsed, lowercased hostname, so a port or letter case in the Host never changes the alias. */
const tenantAliasFromHost = (baseHostname: string) => {
  const pattern = new RegExp(`^([a-z-]+)\\.${escapeRegExp(baseHostname.toLowerCase())}$`)
  return (host: string): Result.Result<TenantAlias, TenantFailure> => {
    const hostname = parseRequestHost(host)?.hostname
    const label = hostname === undefined ? undefined : pattern.exec(hostname)?.[1]
    if (label === undefined) {
      return Result.fail(hostAliasError(host, new Error(`Host "${host}" does not match the tenant alias pattern`)))
    }
    return Result.mapError(decodeTenantAlias(label), (error) => hostAliasError(host, error))
  }
}

const tenantAliasFromStaticResolution = (
  config: StaticTenantResolution
): Result.Result<TenantAlias, TenantFailure> =>
  Result.mapError(
    decodeTenantAlias(config.staticAlias),
    (error) =>
      new TenantReadError({
        cause: error,
        message: `Failed to read tenant alias from config value: "${config.staticAlias}"`
      })
  )

/**
 * Selects the alias reader for the process resolution mode.
 *
 * **Details**
 *
 * Host mode returns a function that reads the label before `baseHostname`. Static mode ignores the host and decodes
 * `staticAlias`.
 *
 * @category constructors
 */
const tenantAliasFromServerConfig = (
  config: TenantResolutionSettings
): (host: string) => Result.Result<TenantAlias, TenantFailure> => {
  switch (config.resolution) {
    case "host":
      return tenantAliasFromHost(config.baseHostname)
    case "static":
      return (_host: string) => tenantAliasFromStaticResolution(config)
  }
}

/**
 * Verification facts for the fixed rejection log (docs/session-state.md#verification-signals): the tenant alias and,
 * for a schema rejection, which policy field was rejected. Never file contents or values.
 */
type TenantFailureFacts = Readonly<Record<"preets.tenant.alias" | "preets.tenant.config.rejected_field", string>>

type TenantFailureReason = "alias" | "directory" | "json" | "not-found" | "read" | "schema"

const failTenant = <E extends TenantFailure>(
  reason: TenantFailureReason,
  error: E,
  facts: Partial<TenantFailureFacts> = {}
) =>
  Effect.logWarning("Tenant configuration request failed", {
    _tag: error._tag,
    reason
  }).pipe(Effect.annotateLogs(facts), Effect.andThen(Effect.fail(error)))

const POLICY_FIELDS: ReadonlySet<PropertyKey> = new Set(["idleTimeoutMinutes", "warningLeadMinutes"])
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1()

/** The first rejected session-policy field, or `other` for any other schema or JSON rejection. */
const rejectedField = (error: Schema.SchemaError): string =>
  formatIssue(error.issue).issues
    .map((issue) => issue.path?.[0])
    .find((segment): segment is string => typeof segment === "string" && POLICY_FIELDS.has(segment)) ?? "other"

const tenantConfigFromAlias = (
  config: TenantResolutionSettings,
  path: Path.Path,
  fs: FileSystem.FileSystem
): (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantFailure> => {
  // A missing configuration directory and a missing selected file both fail the file read, so a failed read checks
  // the directory before classifying the file failure.
  const directoryUnavailable = fs.readDirectory(config.configDir).pipe(
    Effect.catch(() =>
      failTenant(
        "directory",
        new TenantReadError({
          cause: new Error("Tenant configuration directory could not be read"),
          message: "Tenant configuration directory is unavailable"
        })
      )
    )
  )

  const readFailure = (alias: TenantAlias, configPath: string, error: PlatformError.PlatformError) => {
    const notFound = error.reason._tag === "NotFound"
    const cause = new Error(
      notFound ? "Tenant configuration file was not found" : "Tenant configuration file could not be read"
    )
    const message = `Failed to read tenant config from ${configPath}`
    const failure = config.resolution === "static" && notFound ?
      new TenantReadError({ cause, message }) :
      new TenantNotFound({ cause, message })
    // The alias annotation covers the directory check too, so a directory rejection is tenant-correlatable.
    return directoryUnavailable.pipe(
      Effect.andThen(failTenant(notFound ? "not-found" : "read", failure)),
      Effect.annotateLogs({ "preets.tenant.alias": alias })
    )
  }

  const decodeFailure = (alias: TenantAlias, configPath: string, error: Schema.SchemaError) => {
    const reason = error.issue._tag === "Encoding" ? "json" : "schema"
    return failTenant(
      reason,
      new TenantNotFound({
        cause: new Error(`Tenant configuration ${reason} validation failed`),
        message: `Failed to parse tenant config from ${configPath}`
      }),
      { "preets.tenant.alias": alias, "preets.tenant.config.rejected_field": rejectedField(error) }
    )
  }

  return Effect.fn("TenantConfigService.getConfigFromAlias", {
    attributes: {
      "tenant.resolution": config.resolution
    }
  })(function*(alias: TenantAlias) {
    const configPath = path.join(config.configDir, `${alias}.json`)
    yield* Effect.logDebug("Reading tenant configuration")
    const raw = yield* fs.readFileString(configPath).pipe(
      Effect.catchTag("PlatformError", (error) => readFailure(alias, configPath, error))
    )
    return yield* decodeTenantConfig(raw).pipe(
      Effect.catchTag("SchemaError", (error) => decodeFailure(alias, configPath, error))
    )
  })
}

/**
 * Reads the tenant alias and configuration file for a request host.
 *
 * **Details**
 *
 * `getAlias` resolves the alias without reading a file. `getConfigFromAlias` and `getConfigFromHost` read
 * `{alias}.json` from the configured directory. Session consumers derive defaults with the pure
 * {@link effectiveSessionPolicy}.
 *
 * @category services
 */
export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantFailure>
  readonly getConfigFromAlias: (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantFailure>
  readonly getConfigFromHost: (host: string) => Effect.Effect<TenantConfig, TenantFailure>
}>()("TenantConfigService") {
  static readonly layer = (settings: TenantResolutionSettings) =>
    Layer.effect(
      TenantConfigService,
      Effect.gen(function*() {
        yield* Effect.logInfo("Tenant resolution ready", {
          resolution: settings.resolution
        })

        const path = yield* Path.Path
        const fs = yield* FileSystem.FileSystem

        const getAlias = tenantAliasFromServerConfig(settings)
        const getConfigFromAlias = tenantConfigFromAlias(settings, path, fs)
        const getConfigFromHost = Effect.fn("TenantConfigService.getConfigFromHost", {
          attributes: {
            "tenant.resolution": settings.resolution
          }
        })(function*(host: string) {
          const alias = yield* Effect.fromResult(getAlias(host)).pipe(
            Effect.catch((error) => failTenant("alias", error))
          )
          return yield* getConfigFromAlias(alias)
        })

        return TenantConfigService.of({
          getAlias,
          getConfigFromAlias,
          getConfigFromHost
        })
      })
    )
}
