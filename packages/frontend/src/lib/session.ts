import { Context, Effect, Layer } from "effect"

/** Session presence only; stored-session lookup remains deferred. */
export class SessionService extends Context.Service<SessionService, {
  readonly hasSession: () => Effect.Effect<boolean>
}>()("@pathableai/pre-ets-frontend/SessionService") {
  static readonly layer = Layer.succeed(SessionService, {
    hasSession: () => Effect.succeed(false)
  })
}
