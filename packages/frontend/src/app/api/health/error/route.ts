import { NextResponse } from "next/server"

export function GET(): NextResponse {
  return NextResponse.json({ error: "intentional", ok: false }, { status: 500 })
}
