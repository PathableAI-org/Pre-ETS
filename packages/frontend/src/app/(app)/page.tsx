import { Effect } from "effect"
import { redirect } from "next/navigation"

import { Runtime } from "../../lib/runtime"
import { SessionService } from "../../lib/session.ts"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const hasSession = await Effect.gen(function*() {
    const service = yield* SessionService
    return yield* service.hasSession()
  }).pipe(Runtime.runPromise)

  if (!hasSession) redirect("/auth/login")

  // Presence cannot authorize protected rendering until stored sessions and
  // independent request-tenant binding are implemented.
  redirect("/login-unavailable")
}
