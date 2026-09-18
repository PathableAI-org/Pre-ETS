"use server"

import { cookies } from "next/headers"

import { type RecordActivityActionResult, toRecordActivityActionResult } from "../../../lib/session/activity-action.ts"
import { recordQualifyingActivity, SESSION_COOKIE_NAME } from "../../../lib/session/activity.ts"
import { RedisSessionStore } from "../../../lib/session/store.ts"
import { getSessionConfig } from "../../../lib/session/types.ts"

export type { RecordActivityActionResult }

let store: RedisSessionStore | undefined

/**
 * POST-only CSRF-protected Server Action. Cookie-derived identity only;
 * no client-supplied activity timestamp or session target.
 */
export async function recordActivityAction(): Promise<RecordActivityActionResult> {
  const cookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  const config = getSessionConfig()
  store ??= new RedisSessionStore(config)

  const result = await recordQualifyingActivity(
    { cookieValue },
    { config, store }
  )
  return toRecordActivityActionResult(result)
}
