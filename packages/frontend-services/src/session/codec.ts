import { Effect, Option, Result, Schema } from "effect"

import { TenantAlias } from "../tenant.js"

/**
 * Opaque browser reference: 32 random bytes encoded as unpadded base64url, 43 characters.
 * It is a bearer reference to server-held state and never carries identity or policy.
 */
const SessionReference = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  Schema.brand("SessionReference")
)

export type SessionReference = typeof SessionReference.Type

/**
 * Non-bearer correlation identifier stored with the record and used only as the
 * `session.id` span annotation on successful usable-session paths.
 */
const TelemetryId = Schema.String.pipe(
  Schema.check(Schema.isUUID()),
  Schema.brand("SessionTelemetryId")
)

type TelemetryId = typeof TelemetryId.Type

const NonEmptyString = Schema.NonEmptyString

/**
 * Version-1 stored session record. The private wire representation of one
 * frontend-owned transient session. It contains no provider token, credential,
 * callback evidence, role, arbitrary value, refresh timestamp, maximum lifetime,
 * or tombstone.
 */
const StoredSessionV1 = Schema.Struct({
  idleDeadlineEpochMilliseconds: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
  issuer: NonEmptyString,
  subject: NonEmptyString,
  telemetryId: TelemetryId,
  tenantAlias: TenantAlias,
  version: Schema.Literal(1),
  warningLeadMinutes: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))
})

type StoredSessionV1 = typeof StoredSessionV1.Type

const StoredSession = Schema.fromJsonString(StoredSessionV1)

export const decodeStoredSession = Schema.decodeUnknownEffect(StoredSession, { onExcessProperty: "error" })
export const encodeStoredSession = Schema.encodeEffect(StoredSession)

const decodeReference = Schema.decodeResult(SessionReference)

/** Absent and malformed cookie values are both no reference. Callers do not branch on why. */
export const decodeSessionReference = (value: string | undefined): Option.Option<SessionReference> => {
  if (value === undefined) return Option.none()
  const decoded = decodeReference(value)
  return Result.isSuccess(decoded) ? Option.some(decoded.success) : Option.none()
}

export const makeSessionReference = Effect.sync(() =>
  SessionReference.make(Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString("base64url"))
)

export const makeTelemetryId = Effect.sync(() => TelemetryId.make(globalThis.crypto.randomUUID()))
