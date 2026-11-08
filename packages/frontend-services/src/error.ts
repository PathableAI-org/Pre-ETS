import { notFound } from "next/navigation"
import { NextResponse } from "next/server"

import type { TenantFailure } from "./tenant.js"

/** HTTP outcome of a tenant failure. Domain errors carry no status; host adapters choose it here. */
export const tenantFailureStatus = (failure: TenantFailure): 404 | 500 => {
  switch (failure._tag) {
    case "TenantNotFound":
      return 404
    case "TenantReadError":
      return 500
  }
}

export function tenantFailureJson(failure: TenantFailure, headers?: HeadersInit): NextResponse {
  const status = tenantFailureStatus(failure)
  const body = { _tag: failure._tag, message: failure.message, status }
  return NextResponse.json(body, headers === undefined ? { status } : { headers, status })
}

export function tenantFailurePage(failure: TenantFailure): never {
  if (tenantFailureStatus(failure) === 404) notFound()
  throw failure
}
