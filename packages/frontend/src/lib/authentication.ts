import "server-only"
import { Context, Effect, Layer, Schema } from "effect"

import type { HttpError } from "./error.ts"

import { AuthenticationConfig, permittedUrl } from "./authentication/config.ts"
import { prepareProvider } from "./authentication/provider.ts"
import { TenantConfigService } from "./tenant.ts"

/** Safe provider-preparation failure; upstream responses and protocol context remain private. */
export class AuthenticationUnavailable extends Schema.TaggedError<AuthenticationUnavailable>()(
  "@pathableai/pre-ets-frontend/AuthenticationUnavailable",
  {}
) {}

/** Prepares a tenant's provider destination without establishing a session or recoverable attempt. */
export class AuthenticationService extends Context.Service<AuthenticationService, {
  readonly prepare: (request: { readonly host: string }) => Effect.Effect<string, AuthenticationUnavailable | HttpError>
}>()("@pathableai/pre-ets-frontend/AuthenticationService") {
  static readonly layer = Layer.effect(
    AuthenticationService,
    Effect.gen(function*() {
      const settings = yield* AuthenticationConfig
      const tenant = yield* TenantConfigService
      const validateUrl = Schema.decodeUnknownSync(permittedUrl(settings.allowInsecureLoopback))
      const prepare = Effect.fn("AuthenticationService.prepare")(function*({ host }: { readonly host: string }) {
        const alias = yield* Effect.fromResult(tenant.getAlias(host))
        const config = yield* tenant.getConfigFromAlias(alias)
        const origin = Object.hasOwn(settings.callbackOrigins, alias) ? settings.callbackOrigins[alias] : undefined
        if (origin === undefined) return yield* Effect.fail(new AuthenticationUnavailable({}))
        return yield* prepareProvider({
          allowInsecureLoopback: settings.allowInsecureLoopback,
          clientId: config.oidc.clientId,
          issuer: config.oidc.issuer,
          redirectUri: new URL("/auth/callback", origin).href,
          validateUrl
        }).pipe(Effect.mapError(() => new AuthenticationUnavailable({})))
      })
      return AuthenticationService.of({ prepare })
    })
  )
}
