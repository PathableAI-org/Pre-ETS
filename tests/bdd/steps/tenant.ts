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
/**
 * Adds a scenario-owned `stale` tenant on the tracked provider's `stale-auth-time-web` client, whose ID tokens always
 * report an authentication time in 2001. It shares Springfield's configured issuer.
 */
Given("a Stale tenant whose provider always reports an old authentication time", async function(this: AppWorld) {
  assert.ok(this.ownedDirectory, "expected scenario-owned tenant sites")
  const springfield = JSON.parse(await fs.readFile(path.join(this.directory, "springfield.json"), "utf8")) as {
    oidc: { issuer: string }
  }
  await fs.writeFile(
    path.join(this.directory, "stale.json"),
    JSON.stringify({
      displayName: "Stale",
      oidc: { clientAuth: "public", clientId: "stale-auth-time-web", issuer: springfield.oidc.issuer }
    })
  )
  this.callbackOrigins = { ...this.callbackOrigins, stale: "http://stale.localhost:3000" }
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

Given("the selected Springfield tenant file is {string}", async function(this: AppWorld, condition: string) {
  const selectedFile = path.join(this.directory, "springfield.json")
  const arrange: Record<string, () => Promise<void>> = {
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
