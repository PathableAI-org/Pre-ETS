import assert from "node:assert/strict"

import type { AppWorld } from "./world.ts"

export function responseJson(world: AppWorld): Record<string, unknown> {
  assert.ok(world.response, "expected an HTTP response")
  const parsed: unknown = JSON.parse(world.response.body)
  assert.equal(typeof parsed, "object")
  assert.notEqual(parsed, null)
  return parsed as Record<string, unknown>
}
