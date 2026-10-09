import { Given, Then } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import path from "node:path"

import type { AppWorld } from "../support/world.ts"

import { writeTenants } from "../support/fixtures.ts"
import { responseJson } from "../support/response.ts"

Given("production tenant sites for Springfield and Shelbyville", async function(this: AppWorld) {
  await writeTenants(this)
})
Given("host resolution uses base hostname {string}", function(this: AppWorld, baseHostname: string) {
  this.baseHostname = baseHostname
})
Given("BASE_HOSTNAME is not configured", function(this: AppWorld) {
  this.baseHostname = undefined
})
Given("static development settings select Shelbyville", function(this: AppWorld) {
  this.staticAlias = "shelbyville"
})
Then("the selected configuration path is the {string} tenant file", function(this: AppWorld, alias: string) {
  const body = responseJson(this)
  assert.equal(body.configPath, path.join(this.directory, `${alias}.json`))
  assert.deepEqual(Object.keys(body).sort(), ["configPath", "resolutionMode"])
})
