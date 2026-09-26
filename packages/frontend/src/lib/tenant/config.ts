import { Effect, type FileSystem, type Path, pipe, Schema } from "effect"

import type * as ServerConfig from "../config"

import { type TenantAlias, TenantConfig, TenantConfigError } from "./schema"

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
) => Effect.Effect<TenantConfig, TenantConfigError> = (
  config,
  path,
  fs
) =>
  Effect.fn(
    function*(alias: TenantAlias) {
      const getPath = tenantConfigPathFromAlias(config, path)
      const parseJson = Schema.decodeEffect(Schema.fromJsonString(TenantConfig))

      const configPath = getPath(alias)

      yield* Effect.logDebug("Reading tenant config from path", { alias, path: configPath })

      const raw = yield* fs.readFileString(configPath).pipe(
        Effect.mapError((e) =>
          new TenantConfigError({
            cause: e,
            message: `Failed to read tenant config from ${configPath}`
          })
        )
      )

      return yield* parseJson(raw).pipe(
        Effect.mapError((e) =>
          new TenantConfigError({
            cause: e,
            message: `Failed to parse tenant config from ${configPath}`
          })
        ),
        Effect.tap(
          (config) => Effect.logDebug("Parsed tenant config", { config })
        )
      )
    }
  )
