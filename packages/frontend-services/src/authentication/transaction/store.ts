import type { Redis } from "effect/persistence/Redis"

import { Duration, Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { ClientClosedError, ClientOfflineError } from "redis"

import type { TransactionStoreSettings } from "../../config.js"
import type { BrowserCorrelation } from "./codec.js"

export interface AttemptAddress {
  readonly correlation: BrowserCorrelation
  readonly state: string
  readonly tenantAlias: string
}

export class TransactionStoreUnavailable extends Schema.TaggedError<TransactionStoreUnavailable>()(
  "TransactionStoreUnavailable",
  { phase: Schema.Literals(["ambiguous", "before-send"]) }
) {}

const phaseFromCause = (cause: unknown): "ambiguous" | "before-send" =>
  cause instanceof ClientClosedError || cause instanceof ClientOfflineError ? "before-send" : "ambiguous"

const keyFor = (prefix: string, address: AttemptAddress): string => {
  const digest = createHash("sha256")
    .update(address.tenantAlias)
    .update("\0")
    .update(address.correlation)
    .update("\0")
    .update(address.state)
    .digest("base64url")
  return `${prefix}:${digest}`
}

/** Redis-backed attempt storage. A private child of `AuthenticationTransactions`, which owns the Redis capability. */
export const makeTransactionStore = (redis: Redis["Service"], settings: TransactionStoreSettings) => {
  const create = Effect.fnUntraced(function*(address: AttemptAddress, payload: string) {
    const result = yield* redis.send<null | string>(
      "SET",
      keyFor(settings.prefix, address),
      payload,
      "NX",
      "PX",
      String(Duration.toMillis(settings.ttl))
    ).pipe(
      Effect.mapError(() => new TransactionStoreUnavailable({ phase: "ambiguous" }))
    )
    return result === "OK" ? "created" as const : "exists" as const
  })

  const consume = Effect.fnUntraced(function*(address: AttemptAddress) {
    return yield* redis.send<null | string>("GETDEL", keyFor(settings.prefix, address)).pipe(
      Effect.map((value) => value ?? undefined),
      Effect.mapError((error) => new TransactionStoreUnavailable({ phase: phaseFromCause(error.cause) }))
    )
  })

  return { consume, create }
}
