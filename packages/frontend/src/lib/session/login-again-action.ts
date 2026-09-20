import type { InitiateLoginDeps } from "../oidc/initiate.ts"
import type { TenantRecord } from "../tenant/types.ts"
import type { SessionStore } from "./store.ts"
import type { SessionConfig } from "./types.ts"

import { approvedApplicationOrigin } from "../oidc/initiation-http.ts"
import { loginAgain, type LoginAgainResult } from "./login-again.ts"
import { toTenantResolveResult } from "./setup.ts"

export interface LoginAgainActionContext {
  readonly config: SessionConfig
  readonly cookieValue: string | undefined
  readonly host: string | undefined
  readonly initiateDeps: InitiateLoginDeps
  readonly nowSeconds: number
  readonly proto: null | string
  readonly resolveTenant: (input: { host: string | undefined }) => Promise<TenantResolveSource>
  readonly store: SessionStore
}

export type LoginAgainActionOutcome =
  | Extract<LoginAgainResult, { kind: "redirect" }>
  | { readonly kind: "login-unavailable" }

type TenantResolveSource = Parameters<typeof toTenantResolveResult>[0]

/**
 * Shared login-again orchestration for the server action (tenant + origin + rotate).
 */
export async function runLoginAgainAction(
  ctx: LoginAgainActionContext
): Promise<LoginAgainActionOutcome> {
  const tenant = await resolveLoginAgainTenant(ctx)
  if (tenant === undefined) {
    return { kind: "login-unavailable" }
  }

  const origin = resolveLoginAgainOrigin(ctx, tenant.association)
  if (origin === undefined) {
    return { kind: "login-unavailable" }
  }

  const result = await loginAgain(
    {
      cookieValue: ctx.cookieValue,
      nowSeconds: ctx.nowSeconds,
      origin,
      tenantId: tenant.tenantId,
      tenantRecord: tenant.tenantRecord
    },
    {
      config: ctx.config,
      initiateDeps: ctx.initiateDeps,
      store: ctx.store
    }
  )

  if (result.kind !== "redirect") {
    return { kind: "login-unavailable" }
  }
  return result
}

function resolveLoginAgainOrigin(
  ctx: LoginAgainActionContext,
  tenantOrigin: "host-associated" | "local-static"
): string | undefined {
  const scheme = ctx.proto === "http" || ctx.proto === "https" ? ctx.proto : "https"
  const requestUrl = new URL(`${scheme}://${ctx.host ?? "localhost"}/`)
  return approvedApplicationOrigin(ctx.host, requestUrl, {
    tenantOrigin
  })
}

async function resolveLoginAgainTenant(ctx: LoginAgainActionContext): Promise<
  | undefined
  | {
    readonly association: "host-associated" | "local-static"
    readonly tenantId: string
    readonly tenantRecord: TenantRecord
  }
> {
  const tenant = toTenantResolveResult(
    await ctx.resolveTenant({ host: ctx.host })
  )
  if (tenant.kind !== "ok") {
    return undefined
  }
  return {
    association: tenant.origin,
    tenantId: tenant.tenantId,
    tenantRecord: {
      config: tenant.config,
      slug: tenant.tenantId
    }
  }
}
