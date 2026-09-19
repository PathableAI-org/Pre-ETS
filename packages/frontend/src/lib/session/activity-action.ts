import type { RecordQualifyingActivityResult } from "./activity.ts"

export type RecordActivityActionResult =
  | { readonly coalesced?: boolean; readonly ok: true }
  | { readonly ok: false }

/** Map activity lib result → server-action DTO (no Redis dump). */
export function toRecordActivityActionResult(
  result: RecordQualifyingActivityResult
): RecordActivityActionResult {
  if (result.kind === "renewed") {
    return { ok: true }
  }
  if (result.kind === "coalesced") {
    return { coalesced: true, ok: true }
  }
  return { ok: false }
}
