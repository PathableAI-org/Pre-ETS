import { Clock, Context, Duration, Effect, Layer, Schema } from "effect"
import { Redis } from "effect/persistence/Redis"

import type { TransactionStoreSettings } from "../config.js"

import { decodeStoredAttempt, encodeStoredAttempt, type RecoverableAuthenticationAttempt } from "./transaction/codec.js"
import { type AttemptAddress, makeTransactionStore, type TransactionStoreUnavailable } from "./transaction/store.js"

export { decodeBrowserCorrelation, makeBrowserCorrelation } from "./transaction/codec.js"

class AuthenticationAttemptCollision extends Schema.TaggedError<AuthenticationAttemptCollision>()(
  "AuthenticationAttemptCollision",
  {}
) {}

class AuthenticationAttemptUnavailable extends Schema.TaggedError<AuthenticationAttemptUnavailable>()(
  "AuthenticationAttemptUnavailable",
  { reason: Schema.Literals(["corrupt", "expired", "missing"]) }
) {}

export class AuthenticationTransactions extends Context.Service<AuthenticationTransactions, {
  readonly consume: (
    address: AttemptAddress
  ) => Effect.Effect<RecoverableAuthenticationAttempt, AuthenticationAttemptUnavailable | TransactionStoreUnavailable>
  readonly create: (
    attempt: RecoverableAuthenticationAttempt
  ) => Effect.Effect<void, AuthenticationAttemptCollision | TransactionStoreUnavailable>
  readonly ttl: Duration.Duration
}>()("AuthenticationTransactions") {
  static readonly layer = (settings: TransactionStoreSettings) =>
    Layer.effect(
      AuthenticationTransactions,
      Effect.gen(function*() {
        const store = makeTransactionStore(yield* Redis, settings)

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
          if (decoded.expiresAt > decoded.createdAt + Duration.toMillis(settings.ttl)) {
            return yield* new AuthenticationAttemptUnavailable({ reason: "corrupt" })
          }
          const now = yield* Clock.currentTimeMillis
          if (decoded.expiresAt <= now) {
            return yield* new AuthenticationAttemptUnavailable({ reason: "expired" })
          }
          return decoded
        })

        return AuthenticationTransactions.of({ consume, create, ttl: settings.ttl })
      })
    )
}
