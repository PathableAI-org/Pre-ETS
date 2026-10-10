import { Effect, type FileSystem, type Path, pipe, Schema } from "effect"

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
      // Validate the directory separately: ENOENT on the file alone cannot tell
      // a missing selected file from a missing configuration directory.
      yield* fs.readDirectory(config.configDir).pipe(
        Effect.mapError((cause) =>
          new TenantReadError({
            cause,
            message: "Tenant configuration directory is unavailable"
          })
        )
      )

      const configPath = tenantConfigPathFromAlias(config, path)(alias)

      yield* Effect.logDebug("Reading tenant config from path", { alias, path: configPath })

      const raw = yield* fs.readFileString(configPath).pipe(
        Effect.mapError((cause) =>
          config.resolution === "static" && cause.reason._tag === "NotFound" ?
            new TenantReadError({
              cause,
              message: `Failed to read tenant config from ${configPath}`
            }) :
            new TenantNotFound({
              cause,
              message: `Failed to read tenant config from ${configPath}`
            })
        )
      )

      const parsed: unknown = yield* Effect.try({
        catch: (cause) =>
          new TenantNotFound({
            cause: cause instanceof Error ? cause : new Error("Failed to parse tenant config JSON"),
            message: `Failed to parse tenant config from ${configPath}`
          }),
        try: (): unknown => JSON.parse(raw)
      })

      return yield* Schema.decodeUnknownEffect(TenantConfig)(parsed).pipe(
        Effect.mapError((error) =>
          new TenantNotFound({
            cause: new Error(error.message),
            message: `Failed to parse tenant config from ${configPath}`
          })
        )
      )
    }
  )
