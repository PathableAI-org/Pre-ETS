import { Effect, Schema } from "effect"

import { OpaqueToken, randomOpaqueTokenText } from "../../opaque-token.js"

/** The correlation cookie's opaque reference to one stored authentication attempt. */
const BrowserCorrelation = OpaqueToken.pipe(Schema.brand("BrowserCorrelation"))

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

export const makeBrowserCorrelation = randomOpaqueTokenText.pipe(
  Effect.map((text) => BrowserCorrelation.make(text))
)
