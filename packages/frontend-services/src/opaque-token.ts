import { Effect, Schema } from "effect"

/**
 * An unguessable bearer reference: 32 random bytes as unpadded base64url, 43 characters. It never carries identity
 * or policy; the server-held state it addresses does. Owners add their own brand.
 */
export const OpaqueToken = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)))

/** Fresh token text; brand it with the owning schema's `make`. */
export const randomOpaqueTokenText = Effect.sync(() =>
  Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
)
