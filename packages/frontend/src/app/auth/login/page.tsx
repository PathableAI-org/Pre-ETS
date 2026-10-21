import { Effect } from "effect"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthenticationService, AuthenticationUnavailable } from "../../../lib/authentication.ts"
import { httpErrorPage } from "../../../lib/error.ts"
import { Runtime } from "../../../lib/runtime"

export const dynamic = "force-dynamic"

const redirectEffect = (destination: string) => Effect.sync(() => redirect(destination))

export default async function LoginPage() {
  const host = (await headers()).get("host") ?? ""
  return Effect.gen(function*() {
    const service = yield* AuthenticationService
    return yield* service.prepare({ host })
  }).pipe(
    Effect.catch((error) =>
      error instanceof AuthenticationUnavailable ?
        redirectEffect("/login-unavailable") :
        Effect.sync(() => httpErrorPage(error))
    ),
    Effect.flatMap(redirectEffect),
    Runtime.runPromise
  )
}
