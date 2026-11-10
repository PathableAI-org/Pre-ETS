import { Effect, Option, Result, Schema } from "effect"

import { OpaqueToken, randomOpaqueTokenText } from "../opaque-token.js"
import { TenantAlias } from "../tenant.js"

/** The session cookie's opaque reference to the server-held session record. */
const SessionReference = OpaqueToken.pipe(Schema.brand("SessionReference"))

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

const storedFields = {
  idleDeadlineEpochMilliseconds: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
  issuer: NonEmptyString,
  subject: NonEmptyString,
  telemetryId: TelemetryId,
  tenantAlias: TenantAlias,
  warningLeadMinutes: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))
}

/**
 * The private wire representation of one frontend-owned transient session. It contains no provider token,
 * credential, callback evidence, role, arbitrary value, refresh timestamp, maximum lifetime, or tombstone.
 * Version 2 adds `revision`, incremented on every store write; a version-1 record reads as revision 0 and is
 * rewritten as version 2 on its next write (research D6, R16).
 */
const StoredSessionRecord = Schema.Union([
  Schema.Struct({ ...storedFields, version: Schema.Literal(1) }),
  Schema.Struct({
    ...storedFields,
    revision: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
    version: Schema.Literal(2)
  })
])

const StoredSession = Schema.fromJsonString(StoredSessionRecord)

/** The record's revision; a version-1 record has none and reads as 0. */
export const storedRevision = (record: typeof StoredSessionRecord.Type): number =>
  record.version === 2 ? record.revision : 0

export const decodeStoredSession = Schema.decodeUnknownEffect(StoredSession, { onExcessProperty: "error" })
export const encodeStoredSession = Schema.encodeEffect(StoredSession)

const decodeReference = Schema.decodeResult(SessionReference)

/** Absent and malformed cookie values are both no reference. Callers do not branch on why. */
export const decodeSessionReference = (value: string | undefined): Option.Option<SessionReference> => {
  if (value === undefined) return Option.none()
  const decoded = decodeReference(value)
  return Result.isSuccess(decoded) ? Option.some(decoded.success) : Option.none()
}

export const makeSessionReference = randomOpaqueTokenText.pipe(Effect.map((text) => SessionReference.make(text)))

export const makeTelemetryId = Effect.sync(() => TelemetryId.make(globalThis.crypto.randomUUID()))
