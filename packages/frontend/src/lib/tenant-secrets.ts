import "server-only"
import { Context, Effect, type Redacted, Schema } from "effect"

/** A safe failure contract for an unavailable credential, without provider details or secret material. */
export class TenantSecretLookupError extends Schema.TaggedError<TenantSecretLookupError>()(
  "@pathableai/pre-ets-frontend/TenantSecretLookupError",
  {
    message: Schema.Literal("Tenant credential is unavailable").pipe(
      Schema.withConstructorDefault(Effect.succeed("Tenant credential is unavailable"))
    )
  }
) {}

/**
 * Resolves a non-secret lookup reference for a server-side authentication consumer.
 *
 * Tenant files and diagnostic reads never require this service. Authentication composition must supply
 * an implementation separately; no concrete provider or default credential source is selected here.
 * Implementations must translate provider failures into TenantSecretLookupError without retaining raw
 * provider errors, credentials, requested references, or resolved values in that failure.
 */
export class TenantSecrets extends Context.Service<TenantSecrets, {
  readonly resolve: (reference: string) => Effect.Effect<Redacted.Redacted, TenantSecretLookupError>
}>()("@pathableai/pre-ets-frontend/TenantSecrets") {}
