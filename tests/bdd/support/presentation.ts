import assert from "node:assert/strict"

/** A displayed name requires a successful rendered response, never fixture inspection. */
export function assertRenderedTenant(status: number, text: null | string, expected: string): void {
  assert.equal(status, 200, "tenant presentation requires a successful document response")
  assert.equal(text, `Tenant: ${expected}`)
}
