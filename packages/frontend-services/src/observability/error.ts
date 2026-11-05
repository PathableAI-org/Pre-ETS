import { Schema } from "effect"

const unknownToError = (u: unknown): globalThis.Error => u instanceof globalThis.Error ? u : new Error(String(u))

const OtelSdkErrorTag = "@pathableai/pre-ets-frontend-services/OtelSdkErrorTag" as const

export class OtelSdkError extends Schema.TaggedError<OtelSdkError>()(OtelSdkErrorTag, {
  cause: Schema.instanceOf(globalThis.Error)
}) {
  public static new(cause: unknown) {
    return new OtelSdkError({
      cause: unknownToError(cause)
    })
  }
}
