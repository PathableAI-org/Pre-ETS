import { createLoginHandler } from "@pathableai/pre-ets-frontend-services"

import { tenantFailureResponse } from "../presentation.tsx"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const GET = createLoginHandler(tenantFailureResponse)
