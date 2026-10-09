import { Context, Effect, Layer, Schema } from "effect"
import "server-only"

export class SecretNotFound extends Schema.TaggedError<SecretNotFound>()(
  "@pathableai/pre-ets-frontend/SecretNotFound",
  {
    key: Schema.String
  }
) {}

export class SecretsProvider extends Context.Service<SecretsProvider, {
  readonly resolve: (key: string) => Effect.Effect<string, SecretNotFound>
}>()("@pathableai/pre-ets-frontend/SecretsProvider") {
  static readonly layerMemory = (entries: Readonly<Record<string, string>>) =>
    Layer.succeed(
      SecretsProvider,
      SecretsProvider.of({
        resolve: (key) => {
          const secret = entries[key]
          if (secret === undefined) {
            return Effect.fail(new SecretNotFound({ key }))
          }
          return Effect.succeed(secret)
        }
      })
    )
}
