"use server"

import { cookies } from "next/headers"

import { recordQualifyingActivity, SESSION_COOKIE_NAME } from "../../../lib/session/activity.ts"
import { RedisSessionStore } from "../../../lib/session/store.ts"
import { getSessionConfig } from "../../../lib/session/types.ts"

export type RecordActivityActionResult =
  | { readonly coalesced?: boolean; readonly ok: true }
  | { readonly ok: false }

let store: RedisSessionStore | undefined

/**
 * POST-only CSRF-protected Server Action. Cookie-derived identity only;
 * no client-supplied activity timestamp or session target.
 */
// fallow-ignore-next-line complexity -- action boundary: cookie + renew outcome mapping
export async function recordActivityAction(): Promise<RecordActivityActionResult> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value

  const config = getSessionConfig()
  store ??= new RedisSessionStore(config)

  const result = await recordQualifyingActivity(
    { cookieValue },
    {
      config,
      store
    }
  )

  if (result.kind === "renewed") {
    return { ok: true }
  }
  if (result.kind === "coalesced") {
    return { coalesced: true, ok: true }
  }
  return { ok: false }
}
