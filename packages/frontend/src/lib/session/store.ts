import { Context, Effect, Layer, Schema } from "effect"
import { Redis } from "effect/persistence/Redis"
import { createHash } from "node:crypto"

import type { SessionReference } from "./codec.ts"

import { SessionKeyPrefix } from "../config/index.ts"

/**
 * Store-level existence outcomes kept deliberately coarse: the parent owns the
 * public session vocabulary and never exposes a key or encoded payload here.
 */
type CreateOutcome = "created" | "exists"

type ReadOutcome = string | undefined

class SessionStoreUnavailable extends Schema.TaggedError<SessionStoreUnavailable>()(
  "SessionStoreUnavailable",
  {}
) {}

const keyFor = (prefix: string, reference: SessionReference): string => {
  const digest = createHash("sha256").update(reference).digest("base64url")
  return `${prefix}:${digest}`
}

export class SessionStore extends Context.Service<SessionStore, {
  readonly create: (
    address: { readonly reference: SessionReference },
    payload: string,
    ttlMilliseconds: number
  ) => Effect.Effect<CreateOutcome, SessionStoreUnavailable>
  readonly read: (
    address: { readonly reference: SessionReference }
  ) => Effect.Effect<ReadOutcome, SessionStoreUnavailable>
}>()("@pathableai/pre-ets-frontend/SessionStore") {
  static readonly layer = Layer.effect(
    SessionStore,
    Effect.gen(function*() {
      const redis = yield* Redis
      const prefix = yield* SessionKeyPrefix

      const create = Effect.fnUntraced(function*(
        address: { readonly reference: SessionReference },
        payload: string,
        ttlMilliseconds: number
      ) {
        const result = yield* redis.send<null | string>(
          "SET",
          keyFor(prefix, address.reference),
          payload,
          "NX",
          "PX",
          String(ttlMilliseconds)
        ).pipe(
          Effect.mapError(() => new SessionStoreUnavailable({}))
        )
        return result === "OK" ? "created" : "exists"
      })

      const read = Effect.fnUntraced(function*(address: { readonly reference: SessionReference }) {
        return yield* redis.send<null | string>("GET", keyFor(prefix, address.reference)).pipe(
          Effect.map((value) => value ?? undefined),
          Effect.mapError(() => new SessionStoreUnavailable({}))
        )
      })

      return SessionStore.of({ create, read })
    })
  )
}
