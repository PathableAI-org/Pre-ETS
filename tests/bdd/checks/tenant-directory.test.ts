import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

import { cleanupTenantDirectory, prepareTenantDirectory } from "../../../e2e/tenant-directory.ts"

await test("tenant cleanup preserves external directories and removes only owned fixtures", () => {
  const previous = process.env.E2E_TENANT_DIRECTORY
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "preets-external-test-"))
  const sentinel = path.join(external, "keep.txt")
  try {
    fs.writeFileSync(sentinel, "caller data")
    process.env.E2E_TENANT_DIRECTORY = external
    assert.equal(prepareTenantDirectory(), external)
    cleanupTenantDirectory()
    assert.equal(fs.readFileSync(sentinel, "utf8"), "caller data")
    delete process.env.E2E_TENANT_DIRECTORY
    const owned = prepareTenantDirectory()
    assert.ok(fs.existsSync(path.join(owned, "springfield.json")))
    assert.equal(prepareTenantDirectory(), owned)
    process.env.E2E_TENANT_DIRECTORY = external
    cleanupTenantDirectory()
    cleanupTenantDirectory()
    assert.equal(fs.existsSync(owned), false)
    assert.equal(fs.readFileSync(sentinel, "utf8"), "caller data")
  } finally {
    cleanupTenantDirectory()
    fs.rmSync(external, { force: true, recursive: true })
    if (previous === undefined) delete process.env.E2E_TENANT_DIRECTORY
    else process.env.E2E_TENANT_DIRECTORY = previous
  }
})
