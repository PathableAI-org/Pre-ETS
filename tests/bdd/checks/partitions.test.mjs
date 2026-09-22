import assert from "node:assert/strict"
import { test } from "node:test"

import { runPartitions } from "../partitions.mjs"

await test("a failed partition does not hide subsequent runtime evidence", () => {
  const visited = []
  const success = runPartitions(["application", "production", "development"], (profile) => {
    visited.push(profile)
    return profile !== "production"
  })
  assert.equal(success, false)
  assert.deepEqual(visited, ["application", "production", "development"])
})

await test("a startup exception preserves failure and still runs later partitions", () => {
  const visited = []
  const errors = []
  const success = runPartitions(["production", "development"], (profile) => {
    visited.push(profile)
    if (profile === "production") throw new Error("missing build")
    return true
  }, (error) => errors.push(error))
  assert.equal(success, false)
  assert.equal(errors.length, 1)
  assert.deepEqual(visited, ["production", "development"])
})
