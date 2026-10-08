import { Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { AppWorld } from "../support/world.ts"

import { responseJson } from "../support/response.ts"
import { requestSite } from "../support/server.ts"

When("a visitor requests the document at {string}", async function(this: AppWorld, host: string) {
  await requestSite(this, host)
})
When("a visitor requests {string} at {string}", async function(this: AppWorld, path: string, host: string) {
  this.extraHeaders = { ...this.extraHeaders, "x-bdd-query": path }
  await requestSite(this, host)
})
Then("the response status is {int}", function(this: AppWorld, status: number) {
  assert.equal(this.response?.status, status)
})
Then("the response header {string} is {string}", function(this: AppWorld, name: string, value: string) {
  assert.equal(this.response?.headers[name.toLowerCase()], value)
})
Then("the response has no redirect", function(this: AppWorld) {
  assert.equal(this.response?.headers.location, undefined)
})
Then("the response JSON field {string} is {string}", function(this: AppWorld, field: string, expected: string) {
  assert.equal(responseJson(this)[field], expected)
})
