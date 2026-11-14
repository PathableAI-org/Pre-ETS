import { Given, Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { AppWorld } from "../support/world.ts"

import { responseJson } from "../support/response.ts"

Given("production tenant sites for Springfield and Shelbyville", async function(this: AppWorld) {
  assert.ok(this.directory)
  const sourceDirectory = this.directory
  this.ownedDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "preets-bdd-tenant-"))
  this.directory = this.ownedDirectory
  await fs.cp(sourceDirectory, this.directory, { recursive: true })
  await fs.access(path.join(this.directory, "springfield.json"))
  await fs.access(path.join(this.directory, "shelbyville.json"))
})
/** Adds a scenario-owned tenant on one of the tracked provider's fixture clients, sharing Springfield's issuer. */
const addFixtureTenant = async (world: AppWorld, alias: string, displayName: string, clientId: string) => {
  assert.ok(world.ownedDirectory, "expected scenario-owned tenant sites")
  const springfield = JSON.parse(await fs.readFile(path.join(world.directory, "springfield.json"), "utf8")) as {
    oidc: { issuer: string }
  }
  await fs.writeFile(
    path.join(world.directory, `${alias}.json`),
    JSON.stringify({ displayName, oidc: { clientAuth: "public", clientId, issuer: springfield.oidc.issuer } })
  )
  world.callbackOrigins = { ...world.callbackOrigins, [alias]: `http://${alias}.localhost:3000` }
}
/** The `stale-auth-time-web` client's ID tokens always report an authentication time in 2001. */
Given("a Stale tenant whose provider always reports an old authentication time", async function(this: AppWorld) {
  await addFixtureTenant(this, "stale", "Stale", "stale-auth-time-web")
})
/** The `consent-web` client asks the visitor to grant access after signing in, so the visitor can cancel there. */
Given("a Consent tenant whose provider asks the visitor to grant access", async function(this: AppWorld) {
  await addFixtureTenant(this, "consent", "Consent", "consent-web")
})
Given("host resolution uses base hostname {string}", function(this: AppWorld, baseHostname: string) {
  this.baseHostname = baseHostname
})
Given("BASE_HOSTNAME is not configured", function(this: AppWorld) {
  this.baseHostname = undefined
})
Given("static resolution selects Shelbyville", function(this: AppWorld) {
  this.staticAlias = "shelbyville"
})
Given("static resolution selects an alias with no tenant file", function(this: AppWorld) {
  this.staticAlias = "capital-city"
})
Then(
  "the response JSON equals the independently parsed {string} tenant file",
  async function(this: AppWorld, alias: string) {
    assert.ok(this.directory)
    const raw = await fs.readFile(path.join(this.directory, `${alias}.json`), "utf8")
    const expected: unknown = JSON.parse(raw)
    assert.deepEqual(responseJson(this), expected)
  }
)

Given("tenant resolution uses {string} mode", function(this: AppWorld, mode: string) {
  assert.ok(mode === "host" || mode === "static")
  this.baseHostname = mode === "host" ? "example.test" : undefined
  this.staticAlias = mode === "static" ? "springfield" : undefined
})

Given("the tenant directory is {string}", async function(this: AppWorld, condition: string) {
  const directory = this.directory
  const arrange: Record<string, () => Promise<void> | void> = {
    "nonexistent": () => {
      this.directory = path.join(directory, "absent-directory")
    },
    "not a directory": () => {
      this.directory = path.join(directory, "springfield.json")
    },
    "unreadable": async () => {
      this.restrictedPaths.push(directory)
      await fs.chmod(directory, 0o000)
      await assert.rejects(fs.readdir(directory), { code: "EACCES" })
    }
  }
  const setup = arrange[condition]
  assert.ok(setup, `Unknown directory condition: ${condition}`)
  await setup()
})

/** Rewrites the selected Springfield file with the given session-policy fields and its other fields unchanged. */
const withSpringfieldPolicy = async (file: string, policy: Readonly<Record<string, unknown>>) => {
  const springfield = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>
  await fs.writeFile(file, JSON.stringify({ ...springfield, ...policy }))
}

Given("the selected Springfield tenant file is {string}", async function(this: AppWorld, condition: string) {
  const selectedFile = path.join(this.directory, "springfield.json")
  const arrange: Record<string, () => Promise<void>> = {
    // Invalid warning leads (#156 FR-003, V-004): each fails the selected document as schema-invalid.
    "a warning lead above its idle timeout": () =>
      withSpringfieldPolicy(selectedFile, { idleTimeoutMinutes: 5, warningLeadMinutes: 6 }),
    "a warning lead equal to its idle timeout": () =>
      withSpringfieldPolicy(selectedFile, { idleTimeoutMinutes: 5, warningLeadMinutes: 5 }),
    "a warning lead of 1.5": () => withSpringfieldPolicy(selectedFile, { warningLeadMinutes: 1.5 }),
    "a warning lead of -1": () => withSpringfieldPolicy(selectedFile, { warningLeadMinutes: -1 }),
    "a warning lead of five, as text": () => withSpringfieldPolicy(selectedFile, { warningLeadMinutes: "five" }),
    "invalid JSON": () => fs.writeFile(selectedFile, "{invalid JSON"),
    "missing": () => fs.rm(selectedFile),
    "schema-invalid": () => fs.writeFile(selectedFile, JSON.stringify({ displayName: 42 })),
    "unreadable": async () => {
      this.restrictedPaths.push(selectedFile)
      await fs.chmod(selectedFile, 0o000)
      await assert.rejects(fs.readFile(selectedFile), { code: "EACCES" })
    }
  }
  const setup = arrange[condition]
  assert.ok(setup, `Unknown selected-file condition: ${condition}`)
  await setup()
  // Establish a usable directory and a distinct alternative tenant. A failed
  // selection must never substitute Shelbyville's usable configuration.
  await fs.readdir(this.directory)
  await fs.access(path.join(this.directory, "shelbyville.json"))
})
