import type { TenantConfig, TenantOidcConfig, TenantRecord } from "../../src/lib/tenant/types.ts"

export const springfieldOidc: TenantOidcConfig = {
  clientAuth: "public",
  clientId: "springfield-web",
  connection: "springfield-idp",
  issuer: "https://identity.example/realms/pre-ets"
}

export const shelbyvilleOidc: TenantOidcConfig = {
  clientAuth: "public",
  clientId: "shelbyville-web",
  connection: "shelbyville-idp",
  issuer: "https://identity.example/realms/pre-ets"
}

export const springfieldConfig: TenantConfig = {
  displayName: "Springfield Demo",
  oidc: springfieldOidc
}

export const shelbyvilleConfig: TenantConfig = {
  displayName: "Shelbyville Demo",
  oidc: shelbyvilleOidc
}

export const localConfig: TenantConfig = {
  displayName: "Local Demo",
  oidc: springfieldOidc
}

export const springfieldRecord: TenantRecord = {
  config: springfieldConfig,
  slug: "springfield"
}

export const shelbyvilleRecord: TenantRecord = {
  config: shelbyvilleConfig,
  slug: "shelbyville"
}

export const localRecord: TenantRecord = {
  config: localConfig,
  slug: "springfield"
}

export const springfieldRecordsJson = JSON.stringify([springfieldRecord])
export const localRecordJson = JSON.stringify(localRecord)
