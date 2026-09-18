import type { OidcClientAuth } from "../tenant/types.ts"
import type { DiscoveredOidcClient } from "./discovery.ts"
import type { OidcSecretResolution } from "./secrets.ts"

import { discoverOidcIssuer } from "./discovery.ts"
import { OidcSecretsConfigError, resolveOidcClientSecret } from "./secrets.ts"

export interface ResolveClientAndDiscoverDeps {
  readonly discover?: typeof discoverOidcIssuer
  readonly resolveSecret?: (
    slug: string,
    clientAuth: OidcClientAuth
  ) => OidcSecretResolution
}

export interface ResolveClientAndDiscoverInput {
  readonly clientAuth: OidcClientAuth
  readonly clientId: string
  readonly issuer: string
  readonly tenantId: string
}

export type ResolveClientAndDiscoverResult =
  | {
    readonly clientSecret: string | undefined
    readonly discovered: DiscoveredOidcClient
    readonly kind: "ok"
  }
  | {
    readonly kind: "config-refusal"
  }
  | {
    readonly kind: "login-unavailable"
  }
  | {
    readonly kind: "process-config"
  }

export async function resolveClientAndDiscover(
  input: ResolveClientAndDiscoverInput,
  deps: ResolveClientAndDiscoverDeps = {}
): Promise<ResolveClientAndDiscoverResult> {
  let secretResolution: OidcSecretResolution
  try {
    secretResolution = (deps.resolveSecret ?? resolveOidcClientSecret)(
      input.tenantId,
      input.clientAuth
    )
  } catch (error) {
    if (error instanceof OidcSecretsConfigError) {
      return { kind: "process-config" }
    }

    throw error
  }

  if (secretResolution.kind === "config-refusal") {
    return { kind: "config-refusal" }
  }

  const clientSecret = secretResolution.kind === "secret" ? secretResolution.secret : undefined

  try {
    const discover = deps.discover ?? discoverOidcIssuer
    const discovered = clientSecret === undefined
      ? await discover(input.issuer, input.clientId)
      : await discover(input.issuer, input.clientId, { clientSecret })

    return {
      clientSecret,
      discovered,
      kind: "ok"
    }
  } catch {
    return { kind: "login-unavailable" }
  }
}
