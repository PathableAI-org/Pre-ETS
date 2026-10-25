import { Effect } from "effect"

import { Runtime } from "./runtime.js"
import { SessionService } from "./session.js"

export const hasSession = (): Promise<boolean> =>
  Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.hasSession()
  }).pipe(Runtime.runPromise)
