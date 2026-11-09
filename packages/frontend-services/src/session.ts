import type { Redis } from "effect/persistence/Redis"

import { Clock, Context, Effect, Layer, Option, Schema } from "effect"

import type { SessionSettings } from "./config.js"
import type { SessionPolicy, TenantAlias } from "./tenant.js"

import {
  decodeSessionReference,
  decodeStoredSession,
  encodeStoredSession,
  makeSessionReference,
  makeTelemetryId,
  type SessionReference
} from "./session/codec.js"
import { SessionStore } from "./session/store.js"

export { decodeSessionReference }
export type { SessionReference }

export interface EstablishedSession {
  readonly reference: SessionReference
  readonly session: UsableSession
}

export interface EstablishSessionInput {
  readonly identity: SessionIdentity
  readonly policy: SessionPolicy
  readonly tenantAlias: TenantAlias
}

export type ExcludedSessionActivity =
  | "automatic-polling"
  | "programmatic-focus"
  | "raw-pointer-movement"
  | "unrelated-background-traffic"

/** Missing, malformed, expired, and deleted references. No identity or policy. */
export interface NoUsableSession {
  readonly _tag: "NoUsableSession"
}

/** Activities that renew the idle timeout. Every other activity is excluded and leaves the deadline unchanged. */
const QualifyingSessionActivity = Schema.Literals([
  "continue-session",
  "deliberate-form-submission",
  "deliberate-page-request",
  "intentional-control-activation",
  "keyboard-interaction",
  "text-entry",
  "touch-interaction",
  "user-driven-meaningful-input-focus"
])

export type QualifyingSessionActivity = typeof QualifyingSessionActivity.Type

export interface ReadSessionForTenantInput {
  readonly reference?: string | undefined
  readonly tenantAlias: TenantAlias
}

export type RefreshSessionForTenantInput =
  | {
    readonly activity: ExcludedSessionActivity
    readonly policy?: never
    readonly reference?: string | undefined
    readonly tenantAlias: TenantAlias
  }
  | {
    readonly activity: QualifyingSessionActivity
    readonly policy: SessionPolicy
    readonly reference?: string | undefined
    readonly tenantAlias: TenantAlias
  }

export interface SessionIdentity {
  readonly issuer: string
  readonly subject: string
}

export interface UsableSession {
  readonly _tag: "UsableSession"
  readonly identity: SessionIdentity
  readonly idleDeadlineEpochMilliseconds: number
  /**
   * Redis `TIME` read inside the atomic store transition that returned this state, in milliseconds with microsecond
   * fraction; orders observations of one record.
   */
  readonly observedAtEpochMilliseconds: number
  readonly tenantAlias: TenantAlias
  readonly warningLeadMinutes: number
}

export class SessionServiceUnavailable extends Schema.TaggedError<SessionServiceUnavailable>()(
  "SessionServiceUnavailable",
  {}
) {}

export class SessionTenantMismatch extends Schema.TaggedError<SessionTenantMismatch>()("SessionTenantMismatch", {}) {}

/** Drops codec and store diagnostics so records, keys, and identity stay off the public error and its span. */
const serviceUnavailable = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError(() => new SessionServiceUnavailable({})))

/** Total establishment attempts; only a generated-reference collision is retried. */
const COLLISION_RETRIES = 3

class SessionReferenceCollision extends Schema.TaggedError<SessionReferenceCollision>()(
  "SessionReferenceCollision",
  {}
) {}
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }

const toUsableSession = (
  record: {
    readonly idleDeadlineEpochMilliseconds: number
    readonly issuer: string
    readonly subject: string
    readonly tenantAlias: TenantAlias
    readonly warningLeadMinutes: number
  },
  observedAtEpochMilliseconds: number
): UsableSession => ({
  _tag: "UsableSession",
  identity: { issuer: record.issuer, subject: record.subject },
  idleDeadlineEpochMilliseconds: record.idleDeadlineEpochMilliseconds,
  observedAtEpochMilliseconds,
  tenantAlias: record.tenantAlias,
  warningLeadMinutes: record.warningLeadMinutes
})

const isQualifyingActivity = Schema.is(QualifyingSessionActivity)

const isQualifyingRefresh = (
  input: RefreshSessionForTenantInput
): input is Extract<RefreshSessionForTenantInput, { readonly activity: QualifyingSessionActivity }> =>
  isQualifyingActivity(input.activity)

const exposeIfStillUsable = Effect.fnUntraced(function*(
  outcome: { readonly observedAtEpochMilliseconds: number; readonly payload: string }
) {
  const record = yield* serviceUnavailable(decodeStoredSession(outcome.payload))
  if (record.idleDeadlineEpochMilliseconds <= (yield* Clock.currentTimeMillis)) return noUsableSession
  yield* Effect.annotateCurrentSpan("session.id", record.telemetryId)
  return toUsableSession(record, outcome.observedAtEpochMilliseconds)
})

const refreshRequest = (
  input: RefreshSessionForTenantInput,
  receivedAt: number,
  reference: string
) => {
  const shared = { receivedAt, reference, tenantAlias: input.tenantAlias }
  if (!isQualifyingRefresh(input)) {
    return { ...shared, activity: "excluded" as const, idleTimeoutMilliseconds: 0, warningLeadMinutes: 0 }
  }
  return {
    ...shared,
    activity: "qualifying" as const,
    idleTimeoutMilliseconds: input.policy.idleTimeoutMinutes * 60_000,
    warningLeadMinutes: input.policy.warningLeadMinutes
  }
}

export class SessionService extends Context.Service<SessionService, {
  readonly establish: (
    input: EstablishSessionInput
  ) => Effect.Effect<EstablishedSession, SessionServiceUnavailable>
  readonly invalidate: (
    input: { readonly reference?: string | undefined }
  ) => Effect.Effect<NoUsableSession, SessionServiceUnavailable>
  readonly read: (
    input: { readonly reference?: string | undefined }
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable>
  readonly readForTenant: (
    input: ReadSessionForTenantInput
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>
  readonly refreshForTenant: (
    input: RefreshSessionForTenantInput
  ) => Effect.Effect<NoUsableSession | UsableSession, SessionServiceUnavailable | SessionTenantMismatch>
}>()("SessionService") {
  static readonly layer = (settings: SessionSettings): Layer.Layer<SessionService, never, Redis> =>
    Layer.effect(
      SessionService,
      Effect.gen(function*() {
        const store = yield* SessionStore

        const establish = Effect.fn("SessionService.establish")(function*(input: EstablishSessionInput) {
          const attempt: Effect.Effect<EstablishedSession, SessionReferenceCollision | SessionServiceUnavailable> =
            Effect.gen(function*() {
              const now = yield* Clock.currentTimeMillis
              const reference = yield* makeSessionReference
              const telemetryId = yield* makeTelemetryId
              const idleDeadlineEpochMilliseconds = now + input.policy.idleTimeoutMinutes * 60_000
              const payload = yield* serviceUnavailable(encodeStoredSession({
                idleDeadlineEpochMilliseconds,
                issuer: input.identity.issuer,
                subject: input.identity.subject,
                telemetryId,
                tenantAlias: input.tenantAlias,
                version: 1,
                warningLeadMinutes: input.policy.warningLeadMinutes
              }))
              const ttlMilliseconds = idleDeadlineEpochMilliseconds - now
              const outcome = yield* serviceUnavailable(store.create({ reference }, payload, ttlMilliseconds))
              if (outcome._tag === "Exists") return yield* new SessionReferenceCollision({})
              yield* Effect.annotateCurrentSpan("session.id", telemetryId)
              return {
                reference,
                session: toUsableSession({
                  idleDeadlineEpochMilliseconds,
                  issuer: input.identity.issuer,
                  subject: input.identity.subject,
                  tenantAlias: input.tenantAlias,
                  warningLeadMinutes: input.policy.warningLeadMinutes
                }, outcome.observedAtEpochMilliseconds)
              }
            })

          return yield* attempt.pipe(
            Effect.retry({
              times: COLLISION_RETRIES - 1,
              while: (failure) => failure._tag === "SessionReferenceCollision"
            }),
            Effect.catchTag("SessionReferenceCollision", () => Effect.fail(new SessionServiceUnavailable({})))
          )
        })

        const invalidate = Effect.fn("SessionService.invalidate")(function*(
          input: { readonly reference?: string | undefined }
        ) {
          const reference = decodeSessionReference(input.reference)
          if (Option.isNone(reference)) return noUsableSession
          yield* serviceUnavailable(store.invalidate({ reference: reference.value }))
          return noUsableSession
        })

        const read = Effect.fn("SessionService.read")(function*(input: { readonly reference?: string | undefined }) {
          const reference = decodeSessionReference(input.reference)
          if (Option.isNone(reference)) return noUsableSession
          const receivedAt = yield* Clock.currentTimeMillis
          const outcome = yield* serviceUnavailable(store.read({ receivedAt, reference: reference.value }))
          if (outcome._tag === "Missing" || outcome._tag === "Expired") return noUsableSession
          return yield* exposeIfStillUsable(outcome)
        })

        const readForTenant = Effect.fn("SessionService.readForTenant")(function*(input: ReadSessionForTenantInput) {
          const session = yield* read({ reference: input.reference })
          if (session._tag === "NoUsableSession") return session
          if (session.tenantAlias === input.tenantAlias) return session
          return yield* new SessionTenantMismatch({})
        })

        const refreshForTenant = Effect.fn("SessionService.refreshForTenant")(function*(
          input: RefreshSessionForTenantInput
        ) {
          const reference = decodeSessionReference(input.reference)
          if (Option.isNone(reference)) return noUsableSession
          const receivedAt = yield* Clock.currentTimeMillis
          const outcome = yield* serviceUnavailable(store.refresh(refreshRequest(input, receivedAt, reference.value)))
          if (outcome._tag === "Missing" || outcome._tag === "Expired") return noUsableSession
          if (outcome._tag === "Mismatch") return yield* new SessionTenantMismatch({})
          return yield* exposeIfStillUsable(outcome)
        })

        return SessionService.of({
          establish,
          invalidate,
          read,
          readForTenant,
          refreshForTenant
        })
      })
    ).pipe(
      Layer.provide(SessionStore.layer(settings.keyPrefix))
    )
}
