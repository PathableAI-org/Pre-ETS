import { notFound } from "next/navigation"
import { NextResponse } from "next/server"

import type { TenantFailure } from "./tenant.js"

/** Host-supplied response for a tenant failure, such as the Next app's 404 page. */
export type TenantFailureResponse = (status: TenantFailureStatus) => Promise<NextResponse>

/** HTTP status a host adapter returns for a tenant failure. */
export type TenantFailureStatus = 404 | 500

/** HTTP outcome of a tenant failure. Domain errors carry no status; host adapters choose it here. */
export const tenantFailureStatus = (failure: TenantFailure): TenantFailureStatus => {
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
