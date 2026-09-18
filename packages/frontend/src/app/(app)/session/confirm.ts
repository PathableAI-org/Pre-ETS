"use server"

import { cookies } from "next/headers"

import {
  confirmSessionActionInputFrom,
  type ConfirmSessionActionResult,
  toConfirmSessionActionResult
} from "../../../lib/session/confirm-action.ts"
import { confirmSessionAccess } from "../../../lib/session/confirm.ts"
import { RedisSessionStore } from "../../../lib/session/store.ts"
import { getSessionConfig, SESSION_COOKIE_NAME } from "../../../lib/session/types.ts"

export type { ConfirmSessionActionResult }

export interface ConfirmSessionActionInput {
  readonly mountedSessionId?: string
  readonly sessionEndGeneration?: number
}

let store: RedisSessionStore | undefined

/**
 * POST-only CSRF-protected Server Action. Cookie-derived identity only.
 */
export async function confirmSessionAction(
  input: ConfirmSessionActionInput = {}
): Promise<ConfirmSessionActionResult> {
  const cookieValue = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  const config = trySessionConfig()
  if (config === undefined) {
    return { status: "unavailable" }
  }

  store ??= new RedisSessionStore(config)
  const result = await confirmSessionAccess(
    confirmSessionActionInputFrom(cookieValue, input),
    { config, store }
  )
  return toConfirmSessionActionResult(result)
}

function trySessionConfig(): ReturnType<typeof getSessionConfig> | undefined {
  try {
    return getSessionConfig()
  } catch {
    return undefined
  }
}
