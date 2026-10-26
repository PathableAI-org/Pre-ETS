"use server"

import { readSessionRequest, SESSION_COOKIE } from "@pathableai/pre-ets-frontend-services"
import { cookies, headers } from "next/headers"

import type { ReferenceActionState } from "../../features/session-reference.ts"

const receiptCookie = "preets-ref-effect"
const receiptLifetimeSeconds = 120

const acknowledgeUntrustedInput = (previousState: ReferenceActionState, formData: FormData): void => {
  if (previousState._tag.length === 0 || formData.has("")) return
}

const explicitLoopback = (host: string): boolean => {
  const hostname = host.replace(/^\[|\](?::\d+)?$|:\d+$/g, "")
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

export async function runReferenceOperation(
  previousState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState> {
  acknowledgeUntrustedInput(previousState, formData)
  const headerList = await headers()
  const host = headerList.get("host") ?? ""
  const reference = (await cookies()).get(SESSION_COOKIE)?.value
  const resolved = await readSessionRequest(reference === undefined ? { host } : { host, reference })
  if (resolved.session._tag === "NoUsableSession") {
    return { _tag: "Denied", message: "This operation is unavailable until you have a usable session." }
  }
  const jar = await cookies()
  jar.set(receiptCookie, crypto.randomUUID(), {
    httpOnly: true,
    maxAge: receiptLifetimeSeconds,
    path: "/",
    sameSite: "lax",
    secure: !explicitLoopback(host)
  })
  return { _tag: "Succeeded", message: "The reference operation finished." }
}
