import { readSessionRequest, SESSION_COOKIE } from "@pathableai/pre-ets-frontend-services"
import { cookies, headers } from "next/headers"

/** The tenant-resolved session read for the current protected request; never renews. */
export const readRequestSession = async () => {
  const host = (await headers()).get("host") ?? ""
  const reference = (await cookies()).get(SESSION_COOKIE)?.value
  return readSessionRequest({ host, reference })
}
