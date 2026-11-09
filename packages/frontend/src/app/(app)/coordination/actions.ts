"use server"

import type { FixtureActionState } from "../../../features/coordination-fixtures.ts"

import { readRequestSession } from "../session-request.ts"

/** Synthetic protected operation for coordination evidence. It records nothing; it reports admission only. */
export async function recordFixtureOperation(
  previousState: FixtureActionState,
  formData: FormData
): Promise<FixtureActionState> {
  if (previousState._tag.length === 0 || formData.has("")) return previousState
  const resolved = await readRequestSession()
  if (resolved.session._tag === "NoUsableSession") {
    return { _tag: "Denied", message: "This operation is unavailable until you have a usable session." }
  }
  return { _tag: "Recorded", message: "The attendance note was accepted." }
}
