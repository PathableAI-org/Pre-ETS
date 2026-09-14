import { type NextRequest, NextResponse } from "next/server"

import type { ApplicationRuntime, TenantFailureReason, TenantMode } from "./tenant/model.ts"

import { encodeTenantHandoff, stripInboundTenantHeaders } from "./tenant/handoff.ts"
import { resolveTenant } from "./tenant/resolve.ts"
import { CACHE_CONTROL, mapTenantFailureToResponse } from "./tenant/response.ts"
import { getProcessTenantSettings } from "./tenant/settings.ts"

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const settings = getProcessTenantSettings()
  if (!settings.ok) {
    return refusalResponse(settings.reason, { mode: settings.mode, runtime: settings.runtime })
  }

  const resolved = await resolveTenant({
    host: request.headers.get("host") ?? undefined,
    hostSuffix: settings.value.hostSuffix,
    localRecord: settings.value.localRecord,
    mode: settings.value.mode,
    source: settings.value.source
  })

  if (!resolved.ok) {
    return refusalResponse(resolved.reason, {
      mode: settings.value.mode,
      runtime: settings.value.runtime
    })
  }

  const requestHeaders = encodeTenantHandoff(stripInboundTenantHeaders(request.headers), {
    origin: resolved.value.origin,
    slug: resolved.value.slug
  })
  const response = NextResponse.next({
    request: { headers: requestHeaders }
  })
  response.headers.set("Cache-Control", CACHE_CONTROL)
  return response
}

function refusalResponse(
  reason: TenantFailureReason,
  options: {
    readonly mode: TenantMode
    readonly runtime: ApplicationRuntime
  }
): NextResponse {
  const mapped = mapTenantFailureToResponse(reason, options)
  return new NextResponse(mapped.body, {
    headers: mapped.headers,
    status: mapped.status
  })
}
