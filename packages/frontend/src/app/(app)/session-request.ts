import { authorizeSessionAction, readSessionRequest, SESSION_COOKIE } from "@pathableai/pre-ets-frontend-services"
import { cookies, headers } from "next/headers"
import { unauthorized } from "next/navigation"

import { COORDINATION_TAG_FIELD } from "../../providers/coordination-tag-field.ts"

/** The tenant-resolved session read for the current protected request; never renews. */
export const readRequestSession = async () => {
  const host = (await headers()).get("host") ?? ""
  const reference = (await cookies()).get(SESSION_COOKIE)?.value
  return readSessionRequest({ host, reference })
}

/**
 * Whether a protected Server Action may take effect. The gate does not renew actions; `authorizeSessionAction`
 * compares the submitted tag with the cookie's and renews only on a match. A stale tab carries a later session's
 * cookie, so a missing or mismatched tag is refused with no renewal and no effect (research D2, R17). Without a usable
 * session the action is answered with a real 401 through `unauthorized()`; a changed session still exists, so the
 * caller answers it with its own `Denied` state (research D5).
 */
export const admitSubmission = async (formData: FormData) => {
  const host = (await headers()).get("host") ?? ""
  const reference = (await cookies()).get(SESSION_COOKIE)?.value
  const submitted = formData.get(COORDINATION_TAG_FIELD)
  const coordinationTag = typeof submitted === "string" ? submitted : undefined
  const authorized = await authorizeSessionAction({ coordinationTag, host, reference })
  if (authorized._tag === "NoUsableSession") unauthorized()
  return authorized._tag === "Authorized"
}
