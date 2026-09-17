"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { approvedApplicationOrigin } from "../../../lib/oidc/initiation-http.ts"
import { RedisOidcTransactionStore } from "../../../lib/oidc/transaction.ts"
import { getOidcTxConfig, OIDC_COOKIE_NAME, oidcCookieAttributes, OidcTxConfigError } from "../../../lib/oidc/types.ts"
import { loginAgain } from "../../../lib/session/login-again.ts"
import { toTenantResolveResult } from "../../../lib/session/setup.ts"
import { RedisSessionStore } from "../../../lib/session/store.ts"
import {
  cookieAttributes,
  getSessionConfig,
  SESSION_COOKIE_NAME,
  SessionConfigError
} from "../../../lib/session/types.ts"
import { createEnvTenantOperations } from "../../../lib/tenant/operations.ts"

let sessionStore: RedisSessionStore | undefined
let oidcStore: RedisOidcTransactionStore | undefined

/**
 * Dedicated login-again action: rotate new sessionId + cookie, leave old tombstone,
 * then initiate OIDC on the new sid only. Not a bare navigation to `/`.
 */
// fallow-ignore-next-line complexity -- request-boundary: config, tenant, origin, rotate, cookies
export async function loginAgainAction(): Promise<void> {
  let config
  let txConfig
  try {
    config = getSessionConfig()
    txConfig = getOidcTxConfig()
  } catch (error) {
    if (error instanceof SessionConfigError || error instanceof OidcTxConfigError) {
      redirect("/login-unavailable")
    }
    throw error
  }

  sessionStore ??= new RedisSessionStore(config)
  oidcStore ??= new RedisOidcTransactionStore({
    keyPrefix: txConfig.keyPrefix,
    redisUrl: config.redisUrl,
    storeTimeoutMs: txConfig.storeTimeoutMs
  })

  const headerStore = await headers()
  const host = headerStore.get("host") ?? undefined
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value

  const operations = createEnvTenantOperations()
  const tenant = toTenantResolveResult(
    await operations.resolve({ host })
  )
  if (tenant.kind !== "ok") {
    redirect("/login-unavailable")
  }

  const proto = headerStore.get("x-forwarded-proto")
  const scheme = proto === "http" || proto === "https" ? proto : "https"
  const requestUrl = new URL(`${scheme}://${host ?? "localhost"}/`)
  const origin = approvedApplicationOrigin(host, requestUrl, {
    tenantOrigin: tenant.origin
  })
  if (origin === undefined) {
    redirect("/login-unavailable")
  }

  const result = await loginAgain(
    {
      cookieValue,
      nowSeconds: Math.floor(Date.now() / 1000),
      origin,
      tenantId: tenant.tenantId,
      tenantRecord: {
        config: tenant.config,
        slug: tenant.tenantId
      }
    },
    {
      config,
      initiateDeps: {
        store: oidcStore,
        txConfig
      },
      store: sessionStore
    }
  )

  if (result.kind !== "redirect") {
    redirect("/login-unavailable")
  }

  const secure = process.env.NODE_ENV !== "development"
  const sessionAttrs = cookieAttributes(result.sessionExpiresAt, secure)
  const oidcAttrs = oidcCookieAttributes(result.expiresAt, secure)

  cookieStore.set(SESSION_COOKIE_NAME, result.sessionCookieValue, {
    expires: sessionAttrs.expires,
    httpOnly: sessionAttrs.httpOnly,
    path: sessionAttrs.path,
    sameSite: sessionAttrs.sameSite,
    secure: sessionAttrs.secure
  })
  cookieStore.set(OIDC_COOKIE_NAME, result.oidcCookieValue, {
    expires: oidcAttrs.expires,
    httpOnly: oidcAttrs.httpOnly,
    path: oidcAttrs.path,
    sameSite: oidcAttrs.sameSite,
    secure: oidcAttrs.secure
  })

  redirect(result.location)
}
