"use server"

import { cookies } from "next/headers"

import { confirmSessionAccess, type ConfirmSessionAccessResult } from "../../../lib/session/confirm.ts"
import { RedisSessionStore } from "../../../lib/session/store.ts"
import { getSessionConfig, SESSION_COOKIE_NAME } from "../../../lib/session/types.ts"

export interface ConfirmSessionActionInput {
  readonly mountedSessionId?: string
  readonly sessionEndGeneration?: number
}

export type ConfirmSessionActionResult =
  | {
    readonly cookieSessionId: string
    readonly status: "mismatch"
  }
  | {
    readonly expiresAt: number
    readonly idleExpiresAt: number
    readonly sessionId: string
    readonly status: "authenticated"
  }
  | {
    readonly mismatch?: true
    readonly sessionEndGeneration: number
    readonly sessionId: string
    readonly status: "ended-inactivity"
  }
  | {
    readonly mismatch?: true
    readonly sessionId?: string
    readonly status: "ended-other"
  }
  | {
    readonly status: "unavailable"
  }

let store: RedisSessionStore | undefined

/**
 * POST-only CSRF-protected Server Action. Cookie-derived identity only.
 */
// fallow-ignore-next-line complexity -- action boundary: cookie + config + confirm mapping
export async function confirmSessionAction(
  input: ConfirmSessionActionInput = {}
): Promise<ConfirmSessionActionResult> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value

  let config
  try {
    config = getSessionConfig()
  } catch {
    return { status: "unavailable" }
  }

  store ??= new RedisSessionStore(config)

  const result = await confirmSessionAccess(
    {
      cookieValue,
      ...(input.mountedSessionId !== undefined
        ? { mountedSessionId: input.mountedSessionId }
        : {}),
      ...(input.sessionEndGeneration !== undefined
        ? { sessionEndGeneration: input.sessionEndGeneration }
        : {})
    },
    { config, store }
  )

  return toActionResult(result)
}

// fallow-ignore-next-line complexity -- confirm result → action DTO switch
function toActionResult(result: ConfirmSessionAccessResult): ConfirmSessionActionResult {
  switch (result.kind) {
    case "authenticated":
      return {
        expiresAt: result.expiresAt,
        idleExpiresAt: result.idleExpiresAt,
        sessionId: result.sessionId,
        status: "authenticated"
      }
    case "ended-inactivity":
      return {
        ...(result.mismatch === true ? { mismatch: true as const } : {}),
        sessionEndGeneration: result.sessionEndGeneration,
        sessionId: result.sessionId,
        status: "ended-inactivity"
      }
    case "ended-other":
      return {
        ...(result.mismatch === true ? { mismatch: true as const } : {}),
        ...(result.sessionId !== undefined ? { sessionId: result.sessionId } : {}),
        status: "ended-other"
      }
    case "mismatch":
      return {
        cookieSessionId: result.cookieSessionId,
        status: "mismatch"
      }
    case "unavailable":
      return { status: "unavailable" }
  }
}
