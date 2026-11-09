import { createLoginHandler } from "@pathableai/pre-ets-frontend-services"

import { tenantFailureResponse } from "../../../features/access-responses.ts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const GET = createLoginHandler(tenantFailureResponse)
