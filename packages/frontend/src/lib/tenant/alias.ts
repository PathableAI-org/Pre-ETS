import { Option, pipe, Result, Schema, String } from "effect"

import type { TenantConfig, TenantStaticConfig } from "../config/index.ts"

import { TenantAlias, type TenantFailure, TenantNotFound, TenantReadError } from "./schema.ts"

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
            Schema.decodeResult(TenantAlias),
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
    Schema.decodeResult(TenantAlias),
    Result.mapError(
      (error) =>
        new TenantReadError({
          cause: error,
          message: `Failed to read tenant alias from config value: "${config.staticAlias}"`
        })
    )
  )
}

export const tenantAliasFromServerConfig = (
  config: TenantConfig
): (host: string) => Result.Result<TenantAlias, TenantFailure> => {
  switch (config.resolution) {
    case "host":
      return tenantAliasFromHost(config.baseHostname)
    case "static":
      return (_host: string) => tenantAliasFromStaticTenantConfig(config)
  }
}
