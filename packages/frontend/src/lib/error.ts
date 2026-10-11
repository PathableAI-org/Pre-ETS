import { Schema } from "effect"
import { notFound } from "next/navigation"
import { NextResponse } from "next/server"

export class HttpError extends Schema.TaggedError<HttpError>()(
  "@pathableai/pre-ets-frontend/HttpError",
  {
    cause: Schema.instanceOf(globalThis.Error),
    message: Schema.String,
    status: Schema.Literals([404, 500])
  }
) {}

export function httpErrorJson(error: HttpError, headers?: HeadersInit): NextResponse {
  const body = { _tag: error._tag, message: error.message, status: error.status }
  return NextResponse.json(
    body,
    headers === undefined ? { status: error.status } : { headers, status: error.status }
  )
}

export function httpErrorPage(error: HttpError): never {
  if (error.status === 404) notFound()
  throw error
}
