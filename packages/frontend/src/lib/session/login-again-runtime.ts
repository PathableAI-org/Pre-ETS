import { RedisOidcTransactionStore } from "../oidc/transaction.ts"
import { getOidcTxConfig, type OidcTxConfig, OidcTxConfigError } from "../oidc/types.ts"
import {
  type LoginAgainActionContext,
  type LoginAgainActionOutcome,
  runLoginAgainAction
} from "./login-again-action.ts"
import { RedisSessionStore } from "./store.ts"
import { getSessionConfig, type SessionConfig, SessionConfigError } from "./types.ts"

export interface LoginAgainCookieTarget {
  set(
    name: string,
    value: string,
    options: {
      readonly expires: Date
      readonly httpOnly: boolean
      readonly path: string
      readonly sameSite: "lax" | "none" | "strict"
      readonly secure: boolean
    }
  ): void
}

export interface LoginAgainRuntime {
  readonly config: SessionConfig
  readonly oidcStore: RedisOidcTransactionStore
  readonly sessionStore: RedisSessionStore
  readonly txConfig: OidcTxConfig
}

export interface LoginAgainStoreCache {
  oidcStore: RedisOidcTransactionStore | undefined
  sessionStore: RedisSessionStore | undefined
}

export function applyLoginAgainCookies(
  cookieStore: LoginAgainCookieTarget,
  result: Extract<LoginAgainActionOutcome, { kind: "redirect" }>,
  opts: {
    readonly cookieAttributes: (
      expiresAt: number,
      secure: boolean
    ) => {
      readonly expires: Date
      readonly httpOnly: boolean
      readonly path: string
      readonly sameSite: "lax" | "none" | "strict"
      readonly secure: boolean
    }
    readonly development: boolean
    readonly oidcCookieAttributes: (
      expiresAt: number,
      secure: boolean
    ) => {
      readonly expires: Date
      readonly httpOnly: boolean
      readonly path: string
      readonly sameSite: "lax" | "none" | "strict"
      readonly secure: boolean
    }
    readonly oidcCookieName: string
    readonly sessionCookieName: string
  }
): void {
  const secure = !opts.development
  const sessionAttrs = opts.cookieAttributes(result.sessionExpiresAt, secure)
  const oidcAttrs = opts.oidcCookieAttributes(result.expiresAt, secure)

  cookieStore.set(opts.sessionCookieName, result.sessionCookieValue, {
    expires: sessionAttrs.expires,
    httpOnly: sessionAttrs.httpOnly,
    path: sessionAttrs.path,
    sameSite: sessionAttrs.sameSite,
    secure: sessionAttrs.secure
  })
  cookieStore.set(opts.oidcCookieName, result.oidcCookieValue, {
    expires: oidcAttrs.expires,
    httpOnly: oidcAttrs.httpOnly,
    path: oidcAttrs.path,
    sameSite: oidcAttrs.sameSite,
    secure: oidcAttrs.secure
  })
}

/**
 * Load runtime + run login-again; undefined means redirect to login-unavailable.
 */
export async function buildLoginAgainRedirect(input: {
  readonly cache: LoginAgainStoreCache
  readonly cookieValue: string | undefined
  readonly host: string | undefined
  readonly nowSeconds: number
  readonly proto: null | string
  readonly resolveTenant: LoginAgainActionContext["resolveTenant"]
}): Promise<Extract<LoginAgainActionOutcome, { kind: "redirect" }> | undefined> {
  const runtime = loadLoginAgainRuntime(input.cache)
  if (runtime === undefined) {
    return undefined
  }

  const result = await runLoginAgainAction({
    config: runtime.config,
    cookieValue: input.cookieValue,
    host: input.host,
    initiateDeps: {
      store: runtime.oidcStore,
      txConfig: runtime.txConfig
    },
    nowSeconds: input.nowSeconds,
    proto: input.proto,
    resolveTenant: input.resolveTenant,
    store: runtime.sessionStore
  })

  if (result.kind !== "redirect") {
    return undefined
  }
  return result
}

/**
 * Lazy-init session + OIDC stores for login-again (exported for unit coverage).
 */
export function ensureLoginAgainStores(
  cache: LoginAgainStoreCache,
  config: SessionConfig,
  txConfig: OidcTxConfig
): {
  readonly oidcStore: RedisOidcTransactionStore
  readonly sessionStore: RedisSessionStore
} {
  cache.sessionStore ??= new RedisSessionStore(config)
  cache.oidcStore ??= new RedisOidcTransactionStore({
    keyPrefix: txConfig.keyPrefix,
    redisUrl: config.redisUrl,
    storeTimeoutMs: txConfig.storeTimeoutMs
  })
  return {
    oidcStore: cache.oidcStore,
    sessionStore: cache.sessionStore
  }
}

/** True when login-again should fall back to login-unavailable. */
export function isLoginAgainConfigError(error: unknown): boolean {
  return error instanceof SessionConfigError || error instanceof OidcTxConfigError
}

/**
 * Lazy-init session + OIDC stores for login-again (exported for unit coverage).
 */
export function loadLoginAgainRuntime(
  cache: LoginAgainStoreCache
): LoginAgainRuntime | undefined {
  try {
    return buildLoginAgainRuntime(cache)
  } catch (error) {
    if (isLoginAgainConfigError(error)) {
      return undefined
    }
    throw error
  }
}

function buildLoginAgainRuntime(cache: LoginAgainStoreCache): LoginAgainRuntime {
  const config = getSessionConfig()
  const txConfig = getOidcTxConfig()
  const stores = ensureLoginAgainStores(cache, config, txConfig)
  return {
    config,
    oidcStore: stores.oidcStore,
    sessionStore: stores.sessionStore,
    txConfig
  }
}
