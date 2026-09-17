import { resolveSessionCookie, type ResolveSessionCookieDeps } from "./cookie.ts"
import { type SessionStore, SessionStoreError } from "./store.ts"
import { SESSION_COOKIE_NAME, type SessionRecord } from "./types.ts"

export { SESSION_COOKIE_NAME }

export type RecordQualifyingActivityDenyReason =
  | "cleared"
  | "expired"
  | "invalid-cookie"
  | "missing-cookie"
  | "missing-session"
  | "not-authenticated"
  | "store-error"
  | "tenant"

export interface RecordQualifyingActivityDependencies extends ResolveSessionCookieDeps {
  readonly store: SessionStore
}

export interface RecordQualifyingActivityInput {
  /** Raw `pathable-session` cookie value only — no client timestamps or session ids. */
  readonly cookieValue: string | undefined
}

export type RecordQualifyingActivityResult =
  | {
    readonly kind: "coalesced"
    readonly record: SessionRecord
  }
  | {
    readonly kind: "denied"
    readonly reason: RecordQualifyingActivityDenyReason
  }
  | {
    readonly kind: "renewed"
    readonly record: SessionRecord
  }

/**
 * Cookie-derived idle activity renewal. Stamps from the application clock only;
 * never accepts a client-supplied `at` or caller-chosen session/tenant target.
 */
export async function recordQualifyingActivity(
  input: RecordQualifyingActivityInput,
  deps: RecordQualifyingActivityDependencies
): Promise<RecordQualifyingActivityResult> {
  if (input.cookieValue === undefined || input.cookieValue === "") {
    return deny("missing-cookie")
  }

  const resolved = await resolveSessionCookie(input.cookieValue, deps)
  if (resolved.kind === "config-error") {
    return deny("store-error")
  }
  if (resolved.kind === "invalid-cookie") {
    return deny("invalid-cookie")
  }

  try {
    const result = await deps.store.renewIdleActivity(
      resolved.claims.sid,
      resolved.nowSeconds,
      resolved.claims.tenant
    )

    if (result.kind === "renewed") {
      return { kind: "renewed", record: result.record }
    }
    if (result.kind === "coalesced") {
      return { kind: "coalesced", record: result.record }
    }
    if (result.kind === "cleared") {
      return deny("cleared")
    }
    return deny("expired")
  } catch (error) {
    if (error instanceof SessionStoreError) {
      return deny("store-error")
    }
    throw error
  }
}

function deny(
  reason: RecordQualifyingActivityDenyReason
): Extract<RecordQualifyingActivityResult, { kind: "denied" }> {
  return { kind: "denied", reason }
}
