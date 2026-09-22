import { bindHost } from "./host.ts"
import { createFilesystemTenantSource, type TenantSource } from "./source.ts"
import {
  CONFIG_UNAVAILABLE,
  type HostSuffix,
  isCanonicalTenantSlug,
  LOCAL_CONFIG_ERROR,
  resolveTenantConfigDir,
  resolveTenantStaticAlias,
  selectTenantMode,
  type TenantConfig,
  type TenantMode
} from "./types.ts"

export interface CreateTenantOperationsOptions {
  readonly allowLoopbackHttp?: boolean | undefined
  readonly configDir?: string | undefined
  readonly cwd?: string | undefined
  readonly hostSuffix: HostSuffix
  readonly mode: TenantMode
  readonly production?: boolean | undefined
  readonly staticAlias?: string | undefined
  /** Injected source for unit tests and in-process harnesses. */
  readonly tenantSource?: TenantSource | undefined
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
  const source = resolveSource(options)
  let staticAlias: string | undefined

  return {
    async resolve(input) {
      if (mode === "static") {
        try {
          const alias = loadStaticAlias()
          const record = await source.readTenantRecord(alias)
          if (record === undefined) {
            return {
              kind: "config-error",
              message: LOCAL_CONFIG_ERROR
            }
          }

          if (record.slug !== alias) {
            return {
              kind: "config-error",
              message: LOCAL_CONFIG_ERROR
            }
          }

          return {
            config: record.config,
            kind: "ok",
            origin: "local-static",
            tenantId: record.slug
          }
        } catch {
          return {
            kind: "config-error",
            message: LOCAL_CONFIG_ERROR
          }
        }
      }

      const slug = bindHost(input.host, options.hostSuffix)
      if (slug === undefined) {
        return { kind: "unknown" }
      }

      try {
        const record = await source.readTenantRecord(slug)
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

  function loadStaticAlias(): string {
    staticAlias ??= resolveTenantStaticAlias(options.staticAlias)
    return staticAlias
  }
}

let loggedInvalidMode = false

export function createEnvTenantOperations(
  env: NodeJS.ProcessEnv = process.env,
  production?: boolean
): TenantOperations {
  const isProduction = production ?? env.NODE_ENV === "production"
  const configDir = resolveTenantConfigDir(env.TENANT_CONFIG_DIR)
  const allowLoopbackHttp = !isProduction || env.BDD_ALLOW_LOOPBACK_HTTP === "1"
  const tenantSource = createFilesystemTenantSource(configDir, { allowLoopbackHttp })

  if (isProduction) {
    return createTenantOperations({
      allowLoopbackHttp,
      hostSuffix: "pathable.com",
      mode: "host",
      production: true,
      tenantSource
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
    allowLoopbackHttp,
    hostSuffix: "localhost",
    mode: selection.mode,
    staticAlias: env.TENANT_STATIC_ALIAS,
    tenantSource
  })
}

export function requireCanonicalTenant(tenant: string): boolean {
  return isCanonicalTenantSlug(tenant)
}

function resolveSource(options: CreateTenantOperationsOptions): TenantSource {
  if (options.tenantSource !== undefined) {
    return options.tenantSource
  }

  if (options.configDir === undefined || options.configDir.trim() === "") {
    throw new Error(CONFIG_UNAVAILABLE)
  }

  return createFilesystemTenantSource(options.configDir, {
    ...(options.allowLoopbackHttp === undefined ? {} : { allowLoopbackHttp: options.allowLoopbackHttp }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd })
  })
}
