import { tenantConfigResponse } from "@pathableai/pre-ets-frontend-services"

export function GET(request: Request): Promise<Response> {
  return tenantConfigResponse(request.headers.get("host") ?? "")
}
