import { Given, Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import type { AppWorld } from "../support/world.ts"

import { responseJson } from "../support/response.ts"

Given("production tenant sites for Springfield and Shelbyville", async function(this: AppWorld) {
  await fs.access(path.join(this.directory, "springfield.json"))
  await fs.access(path.join(this.directory, "shelbyville.json"))
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
Then(
  "the response JSON equals the independently parsed {string} tenant file",
  async function(this: AppWorld, alias: string) {
    const raw = await fs.readFile(path.join(this.directory, `${alias}.json`), "utf8")
    const expected: unknown = JSON.parse(raw)
    assert.deepEqual(responseJson(this), expected)
  }
)
