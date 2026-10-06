import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { AppWorld } from "../support/world.ts"

import { writeTenants } from "../support/fixtures.ts"
import { requestSite } from "../support/server.ts"

Given("production tenant sites for Springfield and Shelbyville", async function(this: AppWorld) {
  await writeTenants(this)
})
Given("static development settings select Shelbyville", function(this: AppWorld) {
  this.staticAlias = "shelbyville"
})
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
