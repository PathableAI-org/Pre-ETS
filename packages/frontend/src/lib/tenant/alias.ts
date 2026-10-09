import { Option, pipe, Result, Schema, String } from "effect"

import type { TenantConfig, TenantStaticConfig } from "../config/index.ts"

import { TenantAlias, TenantConfigError } from "./schema.ts"

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const hostAliasError = (host: string, cause: Error): TenantConfigError =>
  new TenantConfigError({
    cause,
    message: `Failed to read tenant alias from HOST: "${host}"`
  })

export const tenantAliasFromHost = (baseHostname: string) => {
  const pattern = new RegExp(`^([A-Za-z-]+)\\.${escapeRegExp(baseHostname)}$`)
  return (host: string): Result.Result<TenantAlias, TenantConfigError> =>
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
            Schema.decodeResult(TenantAlias),
            Result.mapError((error) => hostAliasError(host, error))
          )
      })
    )
}

export const tenantAliasFromStaticTenantConfig = (
  config: TenantStaticConfig
): Result.Result<TenantAlias, TenantConfigError> => {
  return pipe(
    config.staticAlias,
    Schema.decodeResult(TenantAlias),
    Result.mapError(
      (error) =>
        new TenantConfigError({
          cause: error,
          message: `Failed to read tenant alias from config value: "${config.staticAlias}"`
        })
    )
  )
}

export const tenantAliasFromServerConfig = (
  config: TenantConfig
): (host: string) => Result.Result<TenantAlias, TenantConfigError> => {
  switch (config.resolution) {
    case "host":
      return tenantAliasFromHost(config.baseHostname)
    case "static":
      return (_host: string) => tenantAliasFromStaticTenantConfig(config)
  }
}
