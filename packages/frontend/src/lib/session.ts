import type { Redis } from "effect/persistence/Redis"

import { Clock, type Config, Context, Effect, Layer, Schema } from "effect"

import type { TenantAlias } from "./tenant.ts"

import {
  decodeSessionReference,
  decodeStoredSession,
  encodeStoredSession,
  makeSessionReference,
  makeTelemetryId,
  type SessionReference
} from "./session/codec.ts"
import { SessionStore } from "./session/store.ts"

export interface EffectiveSessionPolicy {
  readonly idleTimeoutMinutes: number
  readonly warningLeadMinutes: number
}

export interface EstablishedSession {
  readonly reference: SessionReference
  readonly session: UsableSession
}

export interface EstablishSessionInput {
  readonly identity: SessionIdentity
  readonly policy: EffectiveSessionPolicy
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
  readonly tenantAlias: TenantAlias
  readonly warningLeadMinutes: number
}

const sessionServiceUnavailableTag = "@pathableai/pre-ets-frontend/SessionServiceUnavailable"

export class SessionServiceUnavailable extends Schema.TaggedError<SessionServiceUnavailable>()(
  sessionServiceUnavailableTag,
  {}
) {
  static readonly tag = sessionServiceUnavailableTag
}

const COLLISION_RETRIES = 3

const toUsableSession = (
  record: {
    readonly idleDeadlineEpochMilliseconds: number
    readonly issuer: string
    readonly subject: string
    readonly tenantAlias: TenantAlias
    readonly warningLeadMinutes: number
  }
): UsableSession => ({
  _tag: "UsableSession",
  identity: { issuer: record.issuer, subject: record.subject },
  idleDeadlineEpochMilliseconds: record.idleDeadlineEpochMilliseconds,
  tenantAlias: record.tenantAlias,
  warningLeadMinutes: record.warningLeadMinutes
})

export class SessionService extends Context.Service<SessionService, {
  readonly establish: (
    input: EstablishSessionInput
  ) => Effect.Effect<EstablishedSession, SessionServiceUnavailable>
  readonly hasSession: () => Effect.Effect<boolean>
  readonly read: (
    input: { readonly reference?: string }
  ) => Effect.Effect<UsableSession | { readonly _tag: "NoUsableSession" }, SessionServiceUnavailable>
}>()("@pathableai/pre-ets-frontend/SessionService") {
  static readonly layer: Layer.Layer<
    SessionService,
    Config.ConfigError,
    Redis
  > = Layer.effect(
    SessionService,
    Effect.gen(function*() {
      const store = yield* SessionStore

      const establish = Effect.fn("SessionService.establish")(function*(input: EstablishSessionInput) {
        const attempt = (remaining: number): Effect.Effect<EstablishedSession, SessionServiceUnavailable> =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const reference = yield* makeSessionReference
            const telemetryId = yield* makeTelemetryId
            const idleDeadlineEpochMilliseconds = now + input.policy.idleTimeoutMinutes * 60_000
            const payload = yield* encodeStoredSession({
              idleDeadlineEpochMilliseconds,
              issuer: input.identity.issuer,
              subject: input.identity.subject,
              telemetryId,
              tenantAlias: input.tenantAlias,
              version: 1,
              warningLeadMinutes: input.policy.warningLeadMinutes
            }).pipe(
              Effect.mapError(() => new SessionServiceUnavailable({}))
            )
            const ttlMilliseconds = idleDeadlineEpochMilliseconds - now
            const outcome = yield* store.create({ reference }, payload, ttlMilliseconds).pipe(
              Effect.mapError(() => new SessionServiceUnavailable({}))
            )
            if (outcome === "exists" && remaining > 1) {
              return yield* attempt(remaining - 1)
            }
            if (outcome === "exists") {
              return yield* new SessionServiceUnavailable({})
            }
            yield* Effect.annotateCurrentSpan("session.id", telemetryId)
            return {
              reference,
              session: toUsableSession({
                idleDeadlineEpochMilliseconds,
                issuer: input.identity.issuer,
                subject: input.identity.subject,
                tenantAlias: input.tenantAlias,
                warningLeadMinutes: input.policy.warningLeadMinutes
              })
            }
          })

        return yield* attempt(COLLISION_RETRIES)
      })

      const read = Effect.fn("SessionService.read")(function*(input: { readonly reference?: string }) {
        const reference = decodeSessionReference(input.reference)
        if (reference === undefined) {
          return { _tag: "NoUsableSession" as const }
        }
        const payload = yield* store.read({ reference }).pipe(
          Effect.mapError(() => new SessionServiceUnavailable({}))
        )
        if (payload === undefined) {
          return { _tag: "NoUsableSession" as const }
        }
        const record = yield* decodeStoredSession(payload).pipe(
          Effect.mapError(() => new SessionServiceUnavailable({}))
        )
        if (record.idleDeadlineEpochMilliseconds <= (yield* Clock.currentTimeMillis)) {
          return { _tag: "NoUsableSession" as const }
        }
        yield* Effect.annotateCurrentSpan("session.id", record.telemetryId)
        return toUsableSession(record)
      })

      return SessionService.of({
        establish,
        hasSession: () => Effect.succeed(false),
        read
      })
    })
  ).pipe(
    Layer.provide(SessionStore.layer)
  )
}
