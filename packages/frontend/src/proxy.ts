import { type NextRequest, NextResponse } from "next/server"

export function proxy(request: NextRequest): NextResponse {
  return NextResponse.next({
    request: {
      headers: request.headers
    }
  })
}

export const config = {
  matcher: ["/", "/auth/callback"]
}
