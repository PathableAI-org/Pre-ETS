import { createCallbackHandler } from "@pathableai/pre-ets-frontend-services"
import { NextResponse } from "next/server"

import { PRIVATE_NO_STORE } from "../constants.ts"
import { authenticationReturnBody, tenantFailureResponse } from "../presentation.tsx"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const authenticationReturn = () =>
  authenticationReturnBody().then((body) =>
    new NextResponse(body, {
      headers: {
        "cache-control": PRIVATE_NO_STORE,
        "content-type": "text/html; charset=utf-8"
      },
      status: 200
    })
  )

export const GET = createCallbackHandler({
  authenticationReturn,
  tenantFailure: tenantFailureResponse
})
