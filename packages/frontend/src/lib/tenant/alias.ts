import { Array, pipe, Result, Schema, String } from "effect"

import type { TenantConfig, TenantStaticConfig } from "../config"

import { TenantAlias, TenantConfigError } from "./schema"

export const tenantAliasFromHost: (a: string) => Result.Result<TenantAlias, TenantConfigError> = (
  host
) =>
  pipe(
    host,
    String.split("."),
    Array.headNonEmpty,
    String.toLowerCase,
    Schema.decodeResult(TenantAlias),
    Result.mapError(
      (e) =>
        new TenantConfigError({
          cause: e,
          message: `Failed to read tenant alias from HOST: "${host}"`
        })
    )
  )

export const tenantAliasFromStaticTenantConfig = (
  config: TenantStaticConfig
): Result.Result<TenantAlias, TenantConfigError> => {
  return pipe(
    config.staticAlias,
    Schema.decodeResult(TenantAlias),
    Result.mapError(
      (e) =>
        new TenantConfigError({
          cause: e,
          message: `Failed to read tenant alias from config value: "${config.staticAlias}"`
        })
    )
  )
}

export const tenantAliasFromServerConfig = (
  config: TenantConfig
) =>
(host: string): Result.Result<TenantAlias, TenantConfigError> => {
  switch (config.resolution) {
    case "host":
      return tenantAliasFromHost(host)
    case "static":
      return tenantAliasFromStaticTenantConfig(config)
  }
}
