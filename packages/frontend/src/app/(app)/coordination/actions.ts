"use server"

import type { FixtureActionState } from "../../../features/coordination-fixtures.ts"

import { admitSubmission } from "../session-request.ts"

/** Synthetic protected operation for coordination evidence. It records nothing; it reports admission only. */
export async function recordFixtureOperation(
  _previousState: FixtureActionState,
  formData: FormData
): Promise<FixtureActionState> {
  if (!(await admitSubmission(formData))) {
    return { _tag: "Denied", message: "This operation is unavailable until you have a usable session." }
  }
  return { _tag: "Recorded", message: "The attendance note was accepted." }
}
