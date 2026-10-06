import { NextResponse } from "next/server"

export function GET(): NextResponse {
  return NextResponse.json({}, {
    headers: { "Cache-Control": "private, no-store" },
    status: 200
  })
}
