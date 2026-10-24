import { Effect, Result, Schema } from "effect"

import { TenantAlias } from "../tenant.ts"

const SessionReferenceBrand = "@pathableai/pre-ets-frontend/SessionReference" as const

/**
 * Opaque browser reference: 32 random bytes encoded as unpadded base64url, 43 characters.
 * It is a bearer reference to server-held state and never carries identity or policy.
 */
const SessionReference = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  Schema.brand(SessionReferenceBrand)
)

export type SessionReference = typeof SessionReference.Type

const TelemetryIdBrand = "@pathableai/pre-ets-frontend/SessionTelemetryId" as const

/**
 * Non-bearer correlation identifier stored with the record and used only as the
 * `session.id` span annotation on successful usable-session paths.
 */
const TelemetryId = Schema.String.pipe(
  Schema.check(Schema.isUUID()),
  Schema.brand(TelemetryIdBrand)
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

export const decodeSessionReference = (value: string | undefined): SessionReference | undefined => {
  if (value === undefined) return undefined
  const decoded = decodeReference(value)
  return Result.isSuccess(decoded) ? decoded.success : undefined
}

export const makeSessionReference = Effect.gen(function*() {
  const bytes = yield* Effect.sync(() => globalThis.crypto.getRandomValues(new Uint8Array(32)))
  return Schema.decodeUnknownSync(SessionReference)(Buffer.from(bytes).toString("base64url"))
})

export const makeTelemetryId = Effect.gen(function*() {
  const value = yield* Effect.sync(() => globalThis.crypto.randomUUID())
  return Schema.decodeUnknownSync(TelemetryId)(value)
})
