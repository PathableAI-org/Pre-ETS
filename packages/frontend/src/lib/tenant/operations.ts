import { bindHost } from "./host.ts"
import { parseRecordsJson, type TenantSource } from "./source.ts"
import {
  CONFIG_UNAVAILABLE,
  type HostSuffix,
  isCanonicalTenantSlug,
  LOCAL_CONFIG_ERROR,
  parseLocalConfigJson,
  selectTenantMode,
  type TenantConfig,
  type TenantMode,
  type TenantRecord
} from "./types.ts"

export interface CreateTenantOperationsOptions {
  readonly hostRecordsJson?: string | undefined
  readonly hostSuffix: HostSuffix
  readonly localConfigJson?: string | undefined
  readonly mode: TenantMode
  readonly production?: boolean | undefined
}

export type TenantOperationOrigin = "host-associated" | "local-static"

export type TenantOperationResult =
  | {
    readonly config: TenantConfig
    readonly kind: "ok"
    readonly origin: TenantOperationOrigin
    readonly tenantId: string
  }
  | {
    readonly kind: "config-error"
    readonly message: string
  }
  | {
    readonly kind: "unknown"
  }

export interface TenantOperations {
  resolve(input: { readonly host: string | undefined }): Promise<TenantOperationResult>
}

export function createTenantOperations(options: CreateTenantOperationsOptions): TenantOperations {
  const mode = options.production === true ? "host" : options.mode
  let hostSource: TenantSource | undefined
  let staticRecord: TenantRecord | undefined

  return {
    async resolve(input) {
      if (mode === "static") {
        try {
          const record = loadStaticRecord()
          return {
            config: record.config,
            kind: "ok",
            origin: "local-static",
            tenantId: record.slug
          }
        } catch (error) {
          return {
            kind: "config-error",
            message: error instanceof Error ? error.message : LOCAL_CONFIG_ERROR
          }
        }
      }

      const slug = bindHost(input.host, options.hostSuffix)
      if (slug === undefined) {
        return { kind: "unknown" }
      }

      try {
        const record = await loadHostSource().readTenantRecord(slug)
        if (record === undefined) {
          return { kind: "unknown" }
        }

        if (record.slug !== slug) {
          return {
            kind: "config-error",
            message: CONFIG_UNAVAILABLE
          }
        }

        return {
          config: record.config,
          kind: "ok",
          origin: "host-associated",
          tenantId: slug
        }
      } catch {
        return {
          kind: "config-error",
          message: CONFIG_UNAVAILABLE
        }
      }
    }
  }

  function loadHostSource(): TenantSource {
    hostSource ??= parseRecordsJson(options.hostRecordsJson ?? "[]")
    return hostSource
  }

  function loadStaticRecord(): TenantRecord {
    staticRecord ??= parseLocalConfigJson(options.localConfigJson)
    return staticRecord
  }
}

let loggedInvalidMode = false

export function createEnvTenantOperations(
  env: NodeJS.ProcessEnv = process.env,
  production?: boolean
): TenantOperations {
  const isProduction = production ?? env.NODE_ENV === "production"

  if (isProduction) {
    return createTenantOperations({
      hostRecordsJson: env.TENANT_CONFIG_RECORDS_JSON,
      hostSuffix: "pathable.com",
      mode: "host",
      production: true
    })
  }

  const selection = selectTenantMode(env.TENANT_RESOLUTION)
  if ("diagnostic" in selection && !loggedInvalidMode) {
    loggedInvalidMode = true
    try {
      console.error(JSON.stringify(selection.diagnostic))
    } catch {
      // Logging failure must not change tenant selection.
    }
  }

  return createTenantOperations({
    hostRecordsJson: env.TENANT_CONFIG_RECORDS_JSON,
    hostSuffix: "localhost",
    localConfigJson: env.TENANT_LOCAL_CONFIG_JSON,
    mode: selection.mode
  })
}

export function requireCanonicalTenant(tenant: string): boolean {
  return isCanonicalTenantSlug(tenant)
}
