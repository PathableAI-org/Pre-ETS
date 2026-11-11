import type { Redis } from "effect/persistence/Redis"

import { Clock, Context, Effect, Layer, Option, Schema } from "effect"

import type { SessionSettings } from "./config.js"
import type { SessionPolicy, TenantAlias } from "./tenant.js"

import { annotateOutcome } from "./observability.js"
import {
  decodeSessionReference,
  decodeStoredSession,
  encodeStoredSession,
  makeSessionReference,
  makeTelemetryId,
  type SessionReference,
  storedRevision
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

/** A cutoff invalidation reached the store after its cutoff and deleted nothing (research D8, R27). */
export interface InvalidationExpired {
  readonly _tag: "InvalidationExpired"
}

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
   * fraction. Diagnostic only; never the ordering key.
   */
  readonly observedAtEpochMilliseconds: number
  /** Stored record revision: 1 at establishment, plus 1 on every store write; orders states of one record (D6). */
  readonly revision: number
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

const FAILURE_OUTCOME = {
  SessionServiceUnavailable: "unavailable",
  SessionTenantMismatch: "tenant_mismatch"
} as const

/** Records a public service failure as the span outcome; the failure itself is unchanged. */
const annotateFailure = <A, E extends SessionServiceUnavailable | SessionTenantMismatch, R>(
  effect: Effect.Effect<A, E, R>
) => effect.pipe(Effect.tapError((failure) => annotateOutcome(FAILURE_OUTCOME[failure._tag])))

/** Non-secret policy facts; identity, references, and tags never reach a span. */
const annotatePolicy = (policy: SessionPolicy) =>
  Effect.annotateCurrentSpan({
    "preets.session.idle_timeout_minutes": policy.idleTimeoutMinutes,
    "preets.session.warning_lead_minutes": policy.warningLeadMinutes
  })

/** Total establishment attempts; only a generated-reference collision is retried. */
const COLLISION_RETRIES = 3

class SessionReferenceCollision extends Schema.TaggedError<SessionReferenceCollision>()(
  "SessionReferenceCollision",
  {}
) {}
const noUsableSession: NoUsableSession = { _tag: "NoUsableSession" }
const invalidationExpired: InvalidationExpired = { _tag: "InvalidationExpired" }

const toUsableSession = (
  record: {
    readonly idleDeadlineEpochMilliseconds: number
    readonly issuer: string
    readonly subject: string
    readonly tenantAlias: TenantAlias
    readonly warningLeadMinutes: number
  },
  observation: { readonly observedAtEpochMilliseconds: number; readonly revision: number }
): UsableSession => ({
  _tag: "UsableSession",
  identity: { issuer: record.issuer, subject: record.subject },
  idleDeadlineEpochMilliseconds: record.idleDeadlineEpochMilliseconds,
  observedAtEpochMilliseconds: observation.observedAtEpochMilliseconds,
  revision: observation.revision,
  tenantAlias: record.tenantAlias,
  warningLeadMinutes: record.warningLeadMinutes
})

const isQualifyingActivity = Schema.is(QualifyingSessionActivity)

const isQualifyingRefresh = (
  input: RefreshSessionForTenantInput
): input is Extract<RefreshSessionForTenantInput, { readonly activity: QualifyingSessionActivity }> =>
  isQualifyingActivity(input.activity)

/**
 * Missing and expired records are no usable session; a current or renewed record is exposed if still usable.
 * Annotates the calling span's outcome, using `current` as the label for an unrenewed record.
 */
const exposeOutcome = (
  outcome:
    | { readonly _tag: "Current" | "Renewed"; readonly observedAtEpochMilliseconds: number; readonly payload: string }
    | { readonly _tag: "Expired" | "Missing" },
  current: "current" | "unchanged"
) => {
  if (!("payload" in outcome)) {
    return annotateOutcome(outcome._tag === "Expired" ? "expired" : "missing").pipe(Effect.as(noUsableSession))
  }
  return exposeIfStillUsable(outcome, outcome._tag === "Renewed" ? "renewed" : current)
}

const exposeIfStillUsable = Effect.fnUntraced(function*(
  outcome: { readonly observedAtEpochMilliseconds: number; readonly payload: string },
  label: "current" | "renewed" | "unchanged"
) {
  const record = yield* serviceUnavailable(decodeStoredSession(outcome.payload))
  yield* Effect.annotateCurrentSpan({
    "preets.session.deadline_ms": record.idleDeadlineEpochMilliseconds,
    "preets.session.revision": storedRevision(record),
    "preets.session.warning_lead_minutes": record.warningLeadMinutes,
    "session.id": record.telemetryId
  })
  if (record.idleDeadlineEpochMilliseconds <= (yield* Clock.currentTimeMillis)) {
    yield* annotateOutcome("expired")
    return noUsableSession
  }
  yield* annotateOutcome(label)
  return toUsableSession(record, {
    observedAtEpochMilliseconds: outcome.observedAtEpochMilliseconds,
    revision: storedRevision(record)
  })
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
  readonly invalidate: (input: {
    /** When present, delete only if Redis `TIME` is at or before this value; otherwise delete nothing. */
    readonly notAfterEpochMilliseconds?: number | undefined
    readonly reference?: string | undefined
  }) => Effect.Effect<InvalidationExpired | NoUsableSession, SessionServiceUnavailable>
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
          yield* annotatePolicy(input.policy)
          yield* Effect.annotateCurrentSpan("preets.tenant.alias", input.tenantAlias)
          const attempt: Effect.Effect<EstablishedSession, SessionReferenceCollision | SessionServiceUnavailable> =
            Effect.gen(function*() {
              const now = yield* Clock.currentTimeMillis
              const reference = yield* makeSessionReference
              const telemetryId = yield* makeTelemetryId
              const idleDeadlineEpochMilliseconds = now + input.policy.idleTimeoutMinutes * 60_000
              const payload = yield* serviceUnavailable(encodeStoredSession({
                idleDeadlineEpochMilliseconds,
                issuer: input.identity.issuer,
                revision: 1,
                subject: input.identity.subject,
                telemetryId,
                tenantAlias: input.tenantAlias,
                version: 2,
                warningLeadMinutes: input.policy.warningLeadMinutes
              }))
              const ttlMilliseconds = idleDeadlineEpochMilliseconds - now
              const outcome = yield* serviceUnavailable(store.create({ reference }, payload, ttlMilliseconds))
              if (outcome._tag === "Exists") return yield* new SessionReferenceCollision({})
              yield* Effect.annotateCurrentSpan({
                "preets.session.deadline_ms": idleDeadlineEpochMilliseconds,
                "session.id": telemetryId
              })
              return {
                reference,
                session: toUsableSession(
                  {
                    idleDeadlineEpochMilliseconds,
                    issuer: input.identity.issuer,
                    subject: input.identity.subject,
                    tenantAlias: input.tenantAlias,
                    warningLeadMinutes: input.policy.warningLeadMinutes
                  },
                  { observedAtEpochMilliseconds: outcome.observedAtEpochMilliseconds, revision: 1 }
                )
              }
            })

          return yield* attempt.pipe(
            Effect.retry({
              times: COLLISION_RETRIES - 1,
              while: (failure) => failure._tag === "SessionReferenceCollision"
            }),
            Effect.catchTag("SessionReferenceCollision", () => Effect.fail(new SessionServiceUnavailable({}))),
            Effect.tap(() => annotateOutcome("established"))
          )
        }, annotateFailure)

        const invalidate = Effect.fn("SessionService.invalidate")(function*(
          input: Parameters<SessionService["Service"]["invalidate"]>[0]
        ) {
          if (input.notAfterEpochMilliseconds !== undefined) {
            yield* Effect.annotateCurrentSpan("preets.session.logout_cutoff_ms", input.notAfterEpochMilliseconds)
          }
          const reference = decodeSessionReference(input.reference)
          if (Option.isNone(reference)) {
            yield* annotateOutcome("no_reference")
            return noUsableSession
          }
          const outcome = yield* serviceUnavailable(
            store.invalidate({ reference: reference.value }, input.notAfterEpochMilliseconds)
          )
          yield* annotateOutcome(outcome === "expired" ? "rejected_late" : outcome)
          return outcome === "expired" ? invalidationExpired : noUsableSession
        }, annotateFailure)

        const read = Effect.fn("SessionService.read")(function*(input: { readonly reference?: string | undefined }) {
          const reference = decodeSessionReference(input.reference)
          if (Option.isNone(reference)) {
            yield* annotateOutcome("no_reference")
            return noUsableSession
          }
          const outcome = yield* serviceUnavailable(
            store.read({ receivedAt: yield* Clock.currentTimeMillis, reference: reference.value })
          )
          return yield* exposeOutcome(outcome, "current")
        }, annotateFailure)

        const readForTenant = Effect.fn("SessionService.readForTenant")(function*(input: ReadSessionForTenantInput) {
          yield* Effect.annotateCurrentSpan("preets.tenant.alias", input.tenantAlias)
          const session = yield* read({ reference: input.reference })
          if (session._tag === "NoUsableSession") {
            yield* annotateOutcome("no_session")
            return session
          }
          if (session.tenantAlias !== input.tenantAlias) return yield* new SessionTenantMismatch({})
          yield* annotateOutcome("current")
          return session
        }, annotateFailure)

        const refreshForTenant = Effect.fn("SessionService.refreshForTenant")(function*(
          input: RefreshSessionForTenantInput
        ) {
          const qualifying = isQualifyingRefresh(input)
          yield* Effect.annotateCurrentSpan({
            "preets.session.activity": input.activity,
            "preets.session.activity_class": qualifying ? "qualifying" : "excluded",
            "preets.tenant.alias": input.tenantAlias
          })
          if (qualifying) yield* annotatePolicy(input.policy)
          const reference = decodeSessionReference(input.reference)
          if (Option.isNone(reference)) {
            yield* annotateOutcome("no_reference")
            return noUsableSession
          }
          const receivedAt = yield* Clock.currentTimeMillis
          const outcome = yield* serviceUnavailable(store.refresh(refreshRequest(input, receivedAt, reference.value)))
          if (outcome._tag === "Mismatch") return yield* new SessionTenantMismatch({})
          return yield* exposeOutcome(outcome, "unchanged")
        }, annotateFailure)

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
