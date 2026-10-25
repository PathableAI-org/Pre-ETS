import { Effect, Schema } from "effect"

const BrowserCorrelationBrand = "@pathableai/pre-ets-frontend/BrowserCorrelation" as const

const BrowserCorrelation = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  Schema.brand(BrowserCorrelationBrand)
)

export type BrowserCorrelation = typeof BrowserCorrelation.Type

const ProtocolValue = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^\S+$/))
)

const RecoverableAuthenticationAttempt = Schema.Struct({
  callbackAuthority: ProtocolValue,
  clientId: ProtocolValue,
  correlation: BrowserCorrelation,
  createdAt: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  expiresAt: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
  issuer: ProtocolValue,
  nonce: ProtocolValue,
  pkceVerifier: ProtocolValue,
  redirectUri: ProtocolValue,
  state: ProtocolValue,
  tenantAlias: ProtocolValue,
  version: Schema.Literal(1)
}).pipe(
  Schema.check(Schema.makeFilter((attempt) =>
    attempt.expiresAt > attempt.createdAt || {
      issue: "Authentication attempt expiry must be after creation",
      path: ["expiresAt"]
    }
  ))
)

export type RecoverableAuthenticationAttempt = typeof RecoverableAuthenticationAttempt.Type

const StoredAttempt = Schema.fromJsonString(RecoverableAuthenticationAttempt)

export const decodeBrowserCorrelation = Schema.decodeUnknownEffect(BrowserCorrelation)
export const decodeStoredAttempt = Schema.decodeUnknownEffect(StoredAttempt, { onExcessProperty: "error" })
export const encodeStoredAttempt = Schema.encodeEffect(StoredAttempt)

export const makeBrowserCorrelation = Effect.sync(() => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return Schema.decodeUnknownSync(BrowserCorrelation)(Buffer.from(bytes).toString("base64url"))
})
