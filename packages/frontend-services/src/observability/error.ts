import { Schema } from "effect"

export class OtelSdkError extends Schema.TaggedError<OtelSdkError>()("OtelSdkError", {
  cause: Schema.Defect()
}) {}
