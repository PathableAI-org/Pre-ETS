import { readSessionRequest, SESSION_COOKIE } from "@pathableai/pre-ets-frontend-services"
import { cookies, headers } from "next/headers"

import { COORDINATION_TAG_FIELD } from "../../providers/coordination-tag-field.ts"

/** The tenant-resolved session read for the current protected request; never renews. */
export const readRequestSession = async () => {
  const host = (await headers()).get("host") ?? ""
  const reference = (await cookies()).get(SESSION_COOKIE)?.value
  return readSessionRequest({ host, reference })
}

/**
 * Whether a protected Server Action may take effect: a usable session whose coordination tag equals the tag the form
 * submitted. A stale tab carries a later session's cookie, so a mismatch is refused with no effect (research D2).
 */
export const admitSubmission = async (formData: FormData) => {
  const resolved = await readRequestSession()
  const submitted = formData.get(COORDINATION_TAG_FIELD)
  const expected = resolved.coordination?.coordinationTag
  return expected !== undefined && submitted === expected
}
