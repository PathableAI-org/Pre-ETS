import { Config, Context, Effect, Layer, Schema, SchemaIssue } from "effect"
import { Redis } from "effect/persistence/Redis"
import { createHash } from "node:crypto"
import { ClientClosedError, ClientOfflineError } from "redis"

import type { BrowserCorrelation } from "./codec.ts"

export interface AttemptAddress {
  readonly correlation: BrowserCorrelation
  readonly state: string
  readonly tenantAlias: string
}

interface TransactionStoreSettings {
  readonly prefix: string
  readonly ttlMilliseconds: number
  readonly ttlSeconds: number
}

export class TransactionStoreUnavailable extends Schema.TaggedError<TransactionStoreUnavailable>()(
  "TransactionStoreUnavailable",
  { phase: Schema.Literals(["ambiguous", "before-send"]) }
) {}

const invalidTransactionConfig = () =>
  new Config.ConfigError(
    new Schema.SchemaError(
      new SchemaIssue.InvalidValue({ message: "Authentication transaction settings are invalid" })
    )
  )

const decodeTtlSeconds = Schema.decodeUnknownEffect(
  Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/)))
)

const TransactionStoreConfig: Config.Config<TransactionStoreSettings> = Config.all({
  prefix: Config.String("OIDC_TX_KEY_PREFIX").pipe(Config.withDefault("preets:oidc-tx:v1")),
  ttl: Config.String("OIDC_TX_TTL_SECONDS").pipe(
    Config.withDefault("600"),
    Config.mapEffect((raw) =>
      decodeTtlSeconds(raw).pipe(
        Effect.map((validated) => Number(validated)),
        Effect.mapError(invalidTransactionConfig)
      )
    )
  )
}).pipe(
  Config.map(({ prefix, ttl }) => ({ prefix, ttlMilliseconds: ttl * 1_000, ttlSeconds: ttl }))
)

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

export class AuthenticationTransactionStore extends Context.Service<AuthenticationTransactionStore, {
  readonly consume: (
    address: AttemptAddress
  ) => Effect.Effect<string | undefined, TransactionStoreUnavailable>
  readonly create: (
    address: AttemptAddress,
    payload: string
  ) => Effect.Effect<"created" | "exists", TransactionStoreUnavailable>
  readonly settings: TransactionStoreSettings
}>()("@pathableai/pre-ets-frontend/AuthenticationTransactionStore") {
  static readonly layer = Layer.effect(
    AuthenticationTransactionStore,
    Effect.gen(function*() {
      const redis = yield* Redis
      const settings = yield* TransactionStoreConfig

      const create = Effect.fnUntraced(function*(address: AttemptAddress, payload: string) {
        const result = yield* redis.send<null | string>(
          "SET",
          keyFor(settings.prefix, address),
          payload,
          "NX",
          "PX",
          String(settings.ttlMilliseconds)
        ).pipe(
          Effect.mapError(() => new TransactionStoreUnavailable({ phase: "ambiguous" }))
        )
        return result === "OK" ? "created" : "exists"
      })

      const consume = Effect.fnUntraced(function*(address: AttemptAddress) {
        return yield* redis.send<null | string>("GETDEL", keyFor(settings.prefix, address)).pipe(
          Effect.map((value) => value ?? undefined),
          Effect.mapError((error) => new TransactionStoreUnavailable({ phase: phaseFromCause(error.cause) }))
        )
      })

      return AuthenticationTransactionStore.of({ consume, create, settings })
    })
  )
}
