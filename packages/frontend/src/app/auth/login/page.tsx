import { Effect, Result } from "effect"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthenticationService, AuthenticationUnavailable } from "../../../lib/authentication.ts"
import { httpErrorPage } from "../../../lib/error.ts"
import { Runtime } from "../../../lib/runtime"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const host = (await headers()).get("host") ?? ""
  const result = await Effect.gen(function*() {
    const service = yield* AuthenticationService
    return yield* service.prepare({ host })
  }).pipe(Effect.result, Runtime.runPromise)

  if (Result.isFailure(result)) {
    if (result.failure instanceof AuthenticationUnavailable) {
      redirect("/login-unavailable")
    }
    httpErrorPage(result.failure)
  }

  redirect(result.success)
}
