import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

import { validateFeatures } from "../metadata.mjs"

test("discovery validates inherited execution and runtime tags", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bdd-metadata-"))
  const file = path.join(directory, "tags.feature")
  try {
    for (
      const tags of [
        "",
        "@http",
        "@http @browser @production",
        "@application @production",
        "@browser @production @development"
      ]
    ) {
      await fs.writeFile(file, `${tags}\nFeature: Tags\n  Scenario: Invalid\n    Given a fixture\n`)
      await assert.rejects(validateFeatures([file]), /Invalid execution/)
    }
    await fs.writeFile(
      file,
      "@browser @production\nFeature: Tags\n  Rule: Inheritance\n    Scenario: Valid\n      Given a fixture\n"
    )
    assert.equal(await validateFeatures([file]), 1)
  } finally {
    await fs.rm(directory, { force: true, recursive: true })
  }
})
