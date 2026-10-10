import { ConfigProvider, Effect, type FileSystem, type Path, pipe } from "effect"

import type * as ServerConfig from "../config/index.ts"

import { type TenantAlias, TenantConfig, type TenantFailure, TenantNotFound, TenantReadError } from "./schema.ts"

const tenantConfigPathFromAlias = (
  config: ServerConfig.TenantConfig,
  path: Path.Path
) =>
(alias: TenantAlias) =>
  pipe(
    `${alias}.json`,
    (f) => path.join(config.configDir, f),
    path.normalize
  )

export const tenantConfigFromAlias: (
  config: ServerConfig.TenantConfig,
  path: Path.Path,
  fs: FileSystem.FileSystem
) => (
  alias: TenantAlias
) => Effect.Effect<TenantConfig, TenantFailure> = (
  config,
  path,
  fs
) =>
  Effect.fn(
    function*(alias: TenantAlias) {
      const configPath = tenantConfigPathFromAlias(config, path)(alias)

      yield* Effect.logDebug("Reading tenant config from path", { alias, path: configPath })

      const raw = yield* fs.readFileString(configPath).pipe(
        Effect.mapError((cause) =>
          config.resolution === "host" && cause.reason._tag === "NotFound" ?
            new TenantNotFound({
              cause,
              message: `Failed to read tenant config from ${configPath}`
            }) :
            new TenantReadError({
              cause,
              message: `Failed to read tenant config from ${configPath}`
            })
        )
      )

      const parsed: unknown = yield* Effect.try({
        catch: (cause) =>
          new TenantReadError({
            cause: cause instanceof Error ? cause : new Error("Failed to parse tenant config JSON"),
            message: `Failed to parse tenant config from ${configPath}`
          }),
        try: (): unknown => JSON.parse(raw)
      })

      return yield* TenantConfig.parse(ConfigProvider.fromUnknown(parsed)).pipe(
        Effect.mapError((error) =>
          new TenantReadError({
            cause: new Error(error.message),
            message: `Failed to parse tenant config from ${configPath}`
          })
        )
      )
    }
  )
