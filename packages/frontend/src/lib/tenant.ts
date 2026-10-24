/**
 * Resolves a request host to a tenant alias and loads that tenant's configuration file.
 *
 * Host mode reads the alias from the label before the configured base hostname. Static mode uses the configured
 * alias for every host. The loaded file is `{alias}.json` under the configured tenant directory.
 */
import "server-only"
import {
  type Config,
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  pipe,
  PlatformError,
  Result,
  Schema,
  String
} from "effect"

import type { ServerConfig, TenantConfig as TenantResolutionConfig, TenantStaticConfig } from "./config/index.ts"

import { HttpError } from "./error.ts"
import { effectiveSessionPolicy, TenantConfig } from "./tenant/config.ts"

const fixedStatus = <const Code extends 404 | 500>(code: Code) =>
  Schema.Literal(code).pipe(Schema.withConstructorDefault(Effect.succeed(code)))

/**
 * Expected failure from tenant alias resolution or configuration loading.
 *
 * @category errors
 */
type TenantFailure = TenantNotFound | TenantReadError

/**
 * The selected tenant file is missing, is not valid JSON, or does not match the tenant configuration schema.
 *
 * Static mode reports a missing selected file as {@link TenantReadError} instead.
 *
 * @category errors
 */
class TenantNotFound extends HttpError.extend<TenantNotFound>(
  "@pathableai/pre-ets-frontend/TenantNotFound"
)({
  status: fixedStatus(404)
}) {}

/**
 * The tenant configuration directory is unavailable, or static mode cannot read the selected file.
 *
 * @category errors
 */
class TenantReadError extends HttpError.extend<TenantReadError>(
  "@pathableai/pre-ets-frontend/TenantReadError"
)({
  status: fixedStatus(500)
}) {}

const TenantAliasBrand = "@pathableai/pre-ets-frontend/TenantAlias" as const

/**
 * Tenant slug schema: a non-empty string of lowercase letters and hyphens.
 *
 * @category models
 */
export const TenantAlias = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[a-z-]+$/)),
  Schema.brand(TenantAliasBrand)
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

const tenantAliasFromHost = (baseHostname: string) => {
  const pattern = new RegExp(`^([A-Za-z-]+)\\.${escapeRegExp(baseHostname)}$`)
  return (host: string): Result.Result<TenantAlias, TenantFailure> =>
    pipe(
      host,
      String.match(pattern),
      Option.flatMap((match) => Option.fromNullishOr(match[1])),
      Option.match({
        onNone: () =>
          Result.fail(hostAliasError(host, new Error(`Host "${host}" does not match the tenant alias pattern`))),
        onSome: (label) =>
          pipe(
            label,
            String.toLowerCase,
            decodeTenantAlias,
            Result.mapError((error) => hostAliasError(host, error))
          )
      })
    )
}

const tenantAliasFromStaticTenantConfig = (
  config: TenantStaticConfig
): Result.Result<TenantAlias, TenantFailure> => {
  return pipe(
    config.staticAlias,
    decodeTenantAlias,
    Result.mapError(
      (error) =>
        new TenantReadError({
          cause: error,
          message: `Failed to read tenant alias from config value: "${config.staticAlias}"`
        })
    )
  )
}

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
  config: TenantResolutionConfig
): (host: string) => Result.Result<TenantAlias, TenantFailure> => {
  switch (config.resolution) {
    case "host":
      return tenantAliasFromHost(config.baseHostname)
    case "static":
      return (_host: string) => tenantAliasFromStaticTenantConfig(config)
  }
}

type TenantFailureReason = "alias" | "directory" | "json" | "not-found" | "read" | "schema"

const failTenant = <E extends TenantFailure>(reason: TenantFailureReason, error: E) =>
  Effect.logWarning("Tenant configuration request failed", {
    _tag: error.constructor.name,
    reason
  }).pipe(Effect.andThen(Effect.fail(error)))

const tenantConfigPathFromAlias = (
  config: TenantResolutionConfig,
  path: Path.Path
) =>
(alias: TenantAlias) =>
  pipe(
    `${alias}.json`,
    (f) => path.join(config.configDir, f),
    path.normalize
  )

const tenantConfigFromAlias = (
  config: TenantResolutionConfig,
  path: Path.Path,
  fs: FileSystem.FileSystem
): (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantFailure> =>
  Effect.fn("TenantConfigService.getConfigFromAlias", {
    attributes: {
      "tenant.resolution": config.resolution
    }
  })(
    function*(alias: TenantAlias) {
      // Validate the directory separately: ENOENT on the file alone cannot tell
      // a missing selected file from a missing configuration directory.
      yield* fs.readDirectory(config.configDir).pipe(
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

      const configPath = tenantConfigPathFromAlias(config, path)(alias)

      yield* Effect.logDebug("Reading tenant configuration")

      const provider = ConfigProvider.make((key) =>
        key.length === 0 ?
          fs.readFileString(configPath).pipe(
            Effect.map(ConfigProvider.makeValue),
            Effect.mapError((cause) =>
              new ConfigProvider.SourceError({ cause, message: "Tenant configuration source is unavailable" })
            )
          ) :
          Effect.succeed(undefined)
      )

      return yield* TenantConfig.parse(provider).pipe(
        Effect.catch((error) => {
          if (error.cause._tag === "SourceError") {
            const sourceCause = error.cause.cause
            const notFound = PlatformError.isPlatformError(sourceCause) && sourceCause.reason._tag === "NotFound"
            const cause = new Error(
              notFound ? "Tenant configuration file was not found" : "Tenant configuration file could not be read"
            )
            const failure = config.resolution === "static" && notFound ?
              new TenantReadError({ cause, message: `Failed to read tenant config from ${configPath}` }) :
              new TenantNotFound({ cause, message: `Failed to read tenant config from ${configPath}` })
            return failTenant(notFound ? "not-found" : "read", failure)
          }
          const reason = error.message.includes("Tenant configuration JSON is invalid") ? "json" : "schema"
          return failTenant(
            reason,
            new TenantNotFound({
              cause: new Error(`Tenant configuration ${reason} validation failed`),
              message: `Failed to parse tenant config from ${configPath}`
            })
          )
        })
      )
    }
  )

/**
 * Reads the tenant alias and configuration file for a request host.
 *
 * **Details**
 *
 * `getAlias` resolves the alias without reading a file. `getConfigFromAlias` and `getConfigFromHost` read
 * `{alias}.json` from the configured directory. Configuration decoding and session policy are private child
 * implementation details; consumers use this module's public service.
 *
 * @category services
 */
export class TenantConfigService extends Context.Service<TenantConfigService, {
  readonly effectiveSessionPolicy: typeof effectiveSessionPolicy
  readonly getAlias: (host: string) => Result.Result<TenantAlias, TenantFailure>
  readonly getConfigFromAlias: (alias: TenantAlias) => Effect.Effect<TenantConfig, TenantFailure>
  readonly getConfigFromHost: (host: string) => Effect.Effect<TenantConfig, TenantFailure>
}>()("@pathableai/pre-ets-frontend/TenantConfigService") {
  static readonly layer = (config: Config.Success<typeof ServerConfig>) =>
    Layer.effect(
      TenantConfigService,
      Effect.gen(function*() {
        yield* Effect.logInfo("Tenant resolution ready", {
          resolution: config.tenant.resolution
        })

        const path = yield* Path.Path
        const fs = yield* FileSystem.FileSystem

        const getAlias = tenantAliasFromServerConfig(config.tenant)
        const getConfigFromAlias = tenantConfigFromAlias(config.tenant, path, fs)
        const getConfigFromHost = Effect.fn("TenantConfigService.getConfigFromHost", {
          attributes: {
            "tenant.resolution": config.tenant.resolution
          }
        })(function*(host: string) {
          const alias = yield* Effect.fromResult(getAlias(host)).pipe(
            Effect.catch((error) => failTenant("alias", error))
          )
          return yield* getConfigFromAlias(alias)
        })

        return TenantConfigService.of({
          effectiveSessionPolicy,
          getAlias,
          getConfigFromAlias,
          getConfigFromHost
        })
      })
    )
}
