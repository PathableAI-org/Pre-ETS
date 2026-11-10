"use server"

import { requestCookieOptions } from "@pathableai/pre-ets-frontend-services"
import { cookies, headers } from "next/headers"

import type { ReferenceActionState } from "../../features/session-reference.ts"

import { admitSubmission } from "./session-request.ts"

const receiptCookie = "preets-ref-effect"
const receiptLifetimeSeconds = 120

export async function runReferenceOperation(
  _previousState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState> {
  if (!(await admitSubmission(formData))) {
    return { _tag: "Denied", message: "This operation is unavailable until you have a usable session." }
  }
  const host = (await headers()).get("host") ?? ""
  const jar = await cookies()
  jar.set(receiptCookie, crypto.randomUUID(), requestCookieOptions({ host, maxAge: receiptLifetimeSeconds, path: "/" }))
  return { _tag: "Succeeded", message: "The reference operation finished." }
}
