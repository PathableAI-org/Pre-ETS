import {
  type BoundTenant,
  fail,
  isCanonicalTenantSlug,
  ok,
  type TenantMode,
  type TenantOrigin,
  type TenantResult
} from "./model.ts"

const TENANT_ORIGIN_HEADER = "x-preets-tenant-origin"
const TENANT_SLUG_HEADER = "x-preets-tenant-slug"

export function decodeTenantHandoff(headers: Headers, mode: TenantMode): TenantResult<BoundTenant> {
  const slug = headers.get(TENANT_SLUG_HEADER)
  const origin = headers.get(TENANT_ORIGIN_HEADER)
  if (slug === null || origin === null || !isCanonicalTenantSlug(slug) || !isOrigin(origin)) {
    return fail("invalid-context")
  }

  if (mode === "host" && origin !== "host-associated") {
    return fail("invalid-context")
  }

  if (mode === "static" && origin !== "local-static") {
    return fail("invalid-context")
  }

  return ok({ origin, slug })
}

export function encodeTenantHandoff(headers: Headers, bound: BoundTenant): Headers {
  const nextHeaders = stripInboundTenantHeaders(headers)
  nextHeaders.set(TENANT_SLUG_HEADER, bound.slug)
  nextHeaders.set(TENANT_ORIGIN_HEADER, bound.origin)
  return nextHeaders
}

export function stripInboundTenantHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers()
  for (const [name, value] of headers.entries()) {
    if (!name.toLowerCase().startsWith("x-preets-tenant-")) {
      nextHeaders.append(name, value)
    }
  }

  return nextHeaders
}

function isOrigin(value: string): value is TenantOrigin {
  return value === "host-associated" || value === "local-static"
}
