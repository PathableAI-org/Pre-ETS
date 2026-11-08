"use server"

import { readSessionRequest, requestCookieOptions, SESSION_COOKIE } from "@pathableai/pre-ets-frontend-services"
import { cookies, headers } from "next/headers"

import type { ReferenceActionState } from "../../features/session-reference.ts"

const receiptCookie = "preets-ref-effect"
const receiptLifetimeSeconds = 120

const acknowledgeUntrustedInput = (previousState: ReferenceActionState, formData: FormData): void => {
  if (previousState._tag.length === 0 || formData.has("")) return
}

export async function runReferenceOperation(
  previousState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState> {
  acknowledgeUntrustedInput(previousState, formData)
  const headerList = await headers()
  const host = headerList.get("host") ?? ""
  const reference = (await cookies()).get(SESSION_COOKIE)?.value
  const resolved = await readSessionRequest({ host, reference })
  if (resolved.session._tag === "NoUsableSession") {
    return { _tag: "Denied", message: "This operation is unavailable until you have a usable session." }
  }
  const jar = await cookies()
  jar.set(receiptCookie, crypto.randomUUID(), requestCookieOptions({ host, maxAge: receiptLifetimeSeconds, path: "/" }))
  return { _tag: "Succeeded", message: "The reference operation finished." }
}
