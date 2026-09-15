import { errors as joseErrors, jwtVerify, SignJWT } from "jose"

import { isSafeUnixSeconds, isSessionId, type SessionConfig, type SessionCookieClaims } from "./types.ts"

const ALLOWED_CLAIMS = new Set(["exp", "sid", "tenant"])

export async function signSessionCookie(
  claims: SessionCookieClaims,
  config: Pick<SessionConfig, "signingSecret">
): Promise<string> {
  assertClaims(claims)

  return await new SignJWT({
    sid: claims.sid,
    tenant: claims.tenant
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(claims.exp)
    .sign(config.signingSecret)
}

export async function verifySessionCookie(
  token: string,
  config: Pick<SessionConfig, "signingSecret">,
  nowSeconds: number
): Promise<SessionCookieClaims | undefined> {
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

    if (typeof payload.sid !== "string" || !isSessionId(payload.sid)) {
      return undefined
    }

    if (typeof payload.tenant !== "string" || payload.tenant.trim() === "") {
      return undefined
    }

    if (!isSafeUnixSeconds(payload.exp) || payload.exp <= nowSeconds) {
      return undefined
    }

    return {
      exp: payload.exp,
      sid: payload.sid,
      tenant: payload.tenant
    }
  } catch (error) {
    if (
      error instanceof joseErrors.JOSEError
      || error instanceof Error
    ) {
      return undefined
    }

    return undefined
  }
}

function assertClaims(claims: SessionCookieClaims): void {
  if (!isSessionId(claims.sid)) {
    throw new Error("Invalid session id claim.")
  }

  if (claims.tenant.trim() === "") {
    throw new Error("Invalid tenant claim.")
  }

  if (!isSafeUnixSeconds(claims.exp)) {
    throw new Error("Invalid exp claim.")
  }
}
