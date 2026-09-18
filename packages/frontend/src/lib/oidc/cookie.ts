import { errors as joseErrors, jwtVerify, SignJWT } from "jose"

import {
  isSafeUnixSeconds,
  type OidcCorrelationClaims,
  type OidcTxConfig,
  parseOidcCorrelationClaims
} from "./types.ts"

const ALLOWED_CLAIMS = new Set(["exp", "state", "tenant"])

export async function signOidcCorrelationCookie(
  claims: OidcCorrelationClaims,
  config: Pick<OidcTxConfig, "signingSecret">
): Promise<string> {
  assertClaims(claims)

  return await new SignJWT({
    state: claims.state,
    tenant: claims.tenant
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(claims.exp)
    .sign(config.signingSecret)
}

export async function verifyOidcCorrelationCookie(
  token: string,
  config: Pick<OidcTxConfig, "signingSecret">,
  nowSeconds: number
): Promise<OidcCorrelationClaims | undefined> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, config.signingSecret, {
      algorithms: ["HS256"],
      clockTolerance: 0,
      currentDate: new Date(nowSeconds * 1000)
    })

    if (protectedHeader.alg !== "HS256" || protectedHeader.typ !== "JWT") {
      return undefined
    }

    const keys = Object.keys(payload)
    if (keys.some((key) => !ALLOWED_CLAIMS.has(key))) {
      return undefined
    }

    const claims = parseOidcCorrelationClaims(payload)
    if (claims === undefined || claims.exp <= nowSeconds) {
      return undefined
    }

    return claims
  } catch (error) {
    if (error instanceof joseErrors.JOSEError || error instanceof Error) {
      return undefined
    }

    return undefined
  }
}

function assertClaims(claims: OidcCorrelationClaims): void {
  if (claims.state.trim() === "") {
    throw new Error("Invalid OIDC correlation state claim.")
  }

  if (claims.tenant.trim() === "") {
    throw new Error("Invalid OIDC correlation tenant claim.")
  }

  if (!isSafeUnixSeconds(claims.exp)) {
    throw new Error("Invalid OIDC correlation exp claim.")
  }
}
