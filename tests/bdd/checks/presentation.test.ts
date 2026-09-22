import assert from "node:assert/strict"
import { test } from "node:test"

import { assertRenderedTenant } from "../support/presentation.ts"

await test("redirects and errors cannot satisfy tenant presentation even with expected text", () => {
  for (const status of [302, 303, 307, 308, 500]) {
    assert.throws(() => {
      assertRenderedTenant(status, "Tenant: Springfield Demo", "Springfield Demo")
    })
  }
  assert.throws(() => {
    assertRenderedTenant(200, "Tenant: Shelbyville Demo", "Springfield Demo")
  })
  assert.doesNotThrow(() => {
    assertRenderedTenant(200, "Tenant: Springfield Demo", "Springfield Demo")
  })
})
