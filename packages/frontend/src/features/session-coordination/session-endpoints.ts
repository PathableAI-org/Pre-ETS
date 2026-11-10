import type {
  InPageSessionActivity,
  LogoutRequestBody,
  SessionActivityRequestBody,
  SessionCoordinationSnapshot
} from "@pathableai/pre-ets-frontend-services"

/**
 * `refused` is a definitive refusal (403, or another 4xx such as 400 or 415): logout did not happen. `unknown` is a
 * network failure, timeout, 408, or 5xx: the server may have ended the session and lost or failed the reply, so
 * confirmation decides (research D8, R18, R22).
 */
export type LogoutOutcome = "ended" | "not-in-force" | "refused" | "unknown"

/** What the server says about this tab's session. `Ended` covers 401 and a different session in force (409). */
export type SessionOutcome =
  | { readonly _tag: "Ended" }
  | { readonly _tag: "Undetermined" }
  | { readonly _tag: "Usable"; readonly snapshot: SessionCoordinationSnapshot }

const CONFIRMATION_TIMEOUT_MILLISECONDS = 1_500
const LOGOUT_TIMEOUT_MILLISECONDS = 10_000

const isAmbiguous = (status: number) => status === 408 || status >= 500

const ended: SessionOutcome = { _tag: "Ended" }
const undetermined: SessionOutcome = { _tag: "Undetermined" }

type UnknownRecord = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null
const isNumber = (record: UnknownRecord, key: string) => typeof record[key] === "number"

const asSnapshot = (value: unknown): SessionCoordinationSnapshot | undefined => {
  if (!isRecord(value) || typeof value.coordinationTag !== "string") return undefined
  const timing = [
    "idleDeadlineEpochMilliseconds",
    "observedAtEpochMilliseconds",
    "revision",
    "serverTimeEpochMilliseconds",
    "warningLeadMinutes"
  ]
  if (!timing.every((key) => isNumber(value, key))) return undefined
  return {
    coordinationTag: value.coordinationTag,
    idleDeadlineEpochMilliseconds: Number(value.idleDeadlineEpochMilliseconds),
    observedAtEpochMilliseconds: Number(value.observedAtEpochMilliseconds),
    revision: Number(value.revision),
    serverTimeEpochMilliseconds: Number(value.serverTimeEpochMilliseconds),
    warningLeadMinutes: Number(value.warningLeadMinutes)
  }
}

const outcomeOf = async (response: Response): Promise<SessionOutcome> => {
  if (response.status === 401 || response.status === 409) return ended
  if (!response.ok) return undetermined
  const snapshot = asSnapshot(await response.json().catch(() => undefined))
  return snapshot === undefined ? undetermined : { _tag: "Usable", snapshot }
}

const call = (path: string, init: RequestInit) =>
  fetch(path, { cache: "no-store", credentials: "same-origin", ...init })

const postJson = (body: LogoutRequestBody | SessionActivityRequestBody): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
  method: "POST"
})

/**
 * Reads the session without renewing it; no answer within `timeout` (1.5 seconds by default, research D7) or an
 * aborted read is undetermined.
 */
export const readSessionStatus = (
  cancel: AbortSignal,
  timeout = CONFIRMATION_TIMEOUT_MILLISECONDS
): Promise<SessionOutcome> =>
  call("/session/status", { signal: AbortSignal.any([cancel, AbortSignal.timeout(timeout)]) }).then(
    outcomeOf,
    () => undetermined
  )

export const sendActivity = (activity: InPageSessionActivity, coordinationTag: string): Promise<SessionOutcome> =>
  call("/session/activity", postJson({ activity, coordinationTag })).then(outcomeOf, () => undetermined)

/** `keepalive` completes the request even if this tab closes right after starting it (research D8, R11). */
export const sendLogout = async (coordinationTag: string, notAfter: number): Promise<LogoutOutcome> => {
  const response = await call("/auth/logout", {
    ...postJson({ coordinationTag, notAfter }),
    keepalive: true,
    signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MILLISECONDS)
  }).catch(() => undefined)
  if (response === undefined || isAmbiguous(response.status)) return "unknown"
  if (response.status === 204) return "ended"
  if (response.status === 401 || response.status === 409) return "not-in-force"
  return "refused"
}
