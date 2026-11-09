import type {
  InPageSessionActivity,
  LogoutRequestBody,
  SessionActivityRequestBody,
  SessionCoordinationSnapshot
} from "@pathableai/pre-ets-frontend-services"

export type LogoutOutcome = "ended" | "failed" | "not-in-force"

/** What the server says about this tab's session. `Ended` covers 401 and a different session in force (409). */
export type SessionOutcome =
  | { readonly _tag: "Ended" }
  | { readonly _tag: "Undetermined" }
  | { readonly _tag: "Usable"; readonly snapshot: SessionCoordinationSnapshot }

const CONFIRMATION_TIMEOUT_MILLISECONDS = 1_500

const ended: SessionOutcome = { _tag: "Ended" }
const undetermined: SessionOutcome = { _tag: "Undetermined" }

type UnknownRecord = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null
const isNumber = (record: UnknownRecord, key: string) => typeof record[key] === "number"

const asSnapshot = (value: unknown): SessionCoordinationSnapshot | undefined => {
  if (!isRecord(value) || typeof value.coordinationTag !== "string") return undefined
  const timing = ["idleDeadlineEpochMilliseconds", "serverTimeEpochMilliseconds", "warningLeadMinutes"]
  if (!timing.every((key) => isNumber(value, key))) return undefined
  return {
    coordinationTag: value.coordinationTag,
    idleDeadlineEpochMilliseconds: Number(value.idleDeadlineEpochMilliseconds),
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

/** Reads the session without renewing it; no answer within 1.5 seconds is undetermined (research D7). */
export const readSessionStatus = (): Promise<SessionOutcome> =>
  call("/session/status", { signal: AbortSignal.timeout(CONFIRMATION_TIMEOUT_MILLISECONDS) }).then(
    outcomeOf,
    () => undetermined
  )

export const sendActivity = (activity: InPageSessionActivity, coordinationTag: string): Promise<SessionOutcome> =>
  call("/session/activity", postJson({ activity, coordinationTag })).then(outcomeOf, () => undetermined)

export const sendLogout = async (coordinationTag: string): Promise<LogoutOutcome> => {
  const response = await call("/auth/logout", postJson({ coordinationTag })).catch(() => undefined)
  if (response?.status === 204) return "ended"
  if (response?.status === 401 || response?.status === 409) return "not-in-force"
  return "failed"
}
