import "server-only"

import type { OidcClientAuth } from "../tenant/types.ts"

export type OidcSecretResolution =
  | { readonly kind: "config-refusal" }
  | { readonly kind: "none" }
  | { readonly kind: "secret"; readonly secret: string }
  | { readonly kind: "unused" }

export class OidcSecretsConfigError extends Error {
  override readonly name = "OidcSecretsConfigError"
}

let cachedMap: Map<string, string> | undefined
let cachedError: OidcSecretsConfigError | undefined

export function resetOidcSecretsCacheForTests(): void {
  cachedMap = undefined
  cachedError = undefined
}

export function resolveOidcClientSecret(
  slug: string,
  clientAuth: OidcClientAuth,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): OidcSecretResolution {
  const map = getSecretsMap(env)
  const raw = map.get(slug)
  const hasNonempty = raw !== undefined && raw.trim() !== ""

  if (clientAuth === "public") {
    return hasNonempty ? { kind: "unused" } : { kind: "none" }
  }

  if (!hasNonempty) {
    return { kind: "config-refusal" }
  }

  return { kind: "secret", secret: raw }
}

function getSecretsMap(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): Map<string, string> {
  if (cachedMap !== undefined) {
    return cachedMap
  }

  if (cachedError !== undefined) {
    throw cachedError
  }

  try {
    cachedMap = parseSecretsMap(env.OIDC_CLIENT_SECRETS_JSON)
    return cachedMap
  } catch (error) {
    const configError = error instanceof OidcSecretsConfigError
      ? error
      : new OidcSecretsConfigError("Invalid OIDC_CLIENT_SECRETS_JSON.")
    cachedError = configError
    throw configError
  }
}

function parseSecretsMap(raw: string | undefined): Map<string, string> {
  if (raw === undefined || raw === "") {
    return new Map()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new OidcSecretsConfigError("OIDC_CLIENT_SECRETS_JSON must be valid JSON.")
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OidcSecretsConfigError("OIDC_CLIENT_SECRETS_JSON must be a JSON object.")
  }

  const map = new Map<string, string>()
  for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new OidcSecretsConfigError("OIDC_CLIENT_SECRETS_JSON values must be strings.")
    }

    map.set(slug, value)
  }

  return map
}
