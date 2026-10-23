import { Clock, Context, Effect, Layer, Schema } from "effect"

import { decodeStoredAttempt, encodeStoredAttempt, type RecoverableAuthenticationAttempt } from "./transaction/codec.ts"
import {
  type AttemptAddress,
  AuthenticationTransactionStore,
  TransactionStoreUnavailable
} from "./transaction/store.ts"

export { decodeBrowserCorrelation, makeBrowserCorrelation } from "./transaction/codec.ts"

class AuthenticationAttemptUnavailable extends Schema.TaggedError<AuthenticationAttemptUnavailable>()(
  "AuthenticationAttemptUnavailable",
  { reason: Schema.Literals(["corrupt", "expired", "missing"]) }
) {}

export class AuthenticationAttemptCollision extends Schema.TaggedError<AuthenticationAttemptCollision>()(
  "AuthenticationAttemptCollision",
  {}
) {}

export { TransactionStoreUnavailable }

export class AuthenticationTransactions extends Context.Service<AuthenticationTransactions, {
  readonly consume: (
    address: AttemptAddress
  ) => Effect.Effect<RecoverableAuthenticationAttempt, AuthenticationAttemptUnavailable | TransactionStoreUnavailable>
  readonly create: (
    attempt: RecoverableAuthenticationAttempt
  ) => Effect.Effect<void, AuthenticationAttemptCollision | TransactionStoreUnavailable>
  readonly ttlSeconds: number
}>()("@pathableai/pre-ets-frontend/AuthenticationTransactions") {
  static readonly layer = Layer.effect(
    AuthenticationTransactions,
    Effect.gen(function*() {
      const store = yield* AuthenticationTransactionStore

      const create = Effect.fnUntraced(function*(attempt: RecoverableAuthenticationAttempt) {
        const payload = yield* encodeStoredAttempt(attempt).pipe(
          Effect.orDie
        )
        const outcome = yield* store.create({
          correlation: attempt.correlation,
          state: attempt.state,
          tenantAlias: attempt.tenantAlias
        }, payload)
        if (outcome === "exists") return yield* new AuthenticationAttemptCollision({})
      })

      const consume = Effect.fnUntraced(function*(address: AttemptAddress) {
        const payload = yield* store.consume(address)
        if (payload === undefined) {
          return yield* new AuthenticationAttemptUnavailable({ reason: "missing" })
        }
        const decoded = yield* decodeStoredAttempt(payload).pipe(
          Effect.mapError(() => new AuthenticationAttemptUnavailable({ reason: "corrupt" }))
        )
        if (decoded.expiresAt > decoded.createdAt + store.settings.ttlMilliseconds) {
          return yield* new AuthenticationAttemptUnavailable({ reason: "corrupt" })
        }
        const now = yield* Clock.currentTimeMillis
        if (decoded.expiresAt <= now) {
          return yield* new AuthenticationAttemptUnavailable({ reason: "expired" })
        }
        return decoded
      })

      return AuthenticationTransactions.of({ consume, create, ttlSeconds: store.settings.ttlSeconds })
    })
  ).pipe(
    Layer.provide(AuthenticationTransactionStore.layer)
  )
}
