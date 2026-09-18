"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import type { RedisOidcTransactionStore } from "../../../lib/oidc/transaction.ts"
import type { RedisSessionStore } from "../../../lib/session/store.ts"

import { OIDC_COOKIE_NAME, oidcCookieAttributes } from "../../../lib/oidc/types.ts"
import { applyLoginAgainCookies, buildLoginAgainRedirect } from "../../../lib/session/login-again-runtime.ts"
import { cookieAttributes, SESSION_COOKIE_NAME } from "../../../lib/session/types.ts"
import { createEnvTenantOperations } from "../../../lib/tenant/operations.ts"

const storeCache: {
  oidcStore: RedisOidcTransactionStore | undefined
  sessionStore: RedisSessionStore | undefined
} = {
  oidcStore: undefined,
  sessionStore: undefined
}

/**
 * Dedicated login-again action: rotate new sessionId + cookie, leave old tombstone,
 * then initiate OIDC on the new sid only. Not a bare navigation to `/`.
 */
export async function loginAgainAction(): Promise<void> {
  redirect(await resolveLoginAgainLocation())
}

async function resolveLoginAgainLocation(): Promise<string> {
  const headerStore = await headers()
  const cookieStore = await cookies()
  const result = await buildLoginAgainRedirect({
    cache: storeCache,
    cookieValue: cookieStore.get(SESSION_COOKIE_NAME)?.value,
    host: headerStore.get("host") ?? undefined,
    nowSeconds: Math.floor(Date.now() / 1000),
    proto: headerStore.get("x-forwarded-proto"),
    resolveTenant: (input) => createEnvTenantOperations().resolve(input)
  })

  if (result === undefined) {
    return "/login-unavailable"
  }

  applyLoginAgainCookies(cookieStore, result, {
    cookieAttributes,
    development: process.env.NODE_ENV === "development",
    oidcCookieAttributes,
    oidcCookieName: OIDC_COOKIE_NAME,
    sessionCookieName: SESSION_COOKIE_NAME
  })
  return result.location
}
