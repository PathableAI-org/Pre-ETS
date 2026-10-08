import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"
import path from "node:path"

import type { AppWorld } from "../support/world.ts"

import { writeTenants } from "../support/fixtures.ts"
import { requestSite } from "../support/server.ts"

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
  assert.ok(this.response, "expected an HTTP response")
  const parsed: unknown = JSON.parse(this.response.body)
  assert.equal(typeof parsed, "object")
  assert.notEqual(parsed, null)
  assert.equal((parsed as Record<string, unknown>)[field], expected)
})
Then("the selected configuration path is the {string} tenant file", function(this: AppWorld, alias: string) {
  assert.ok(this.response, "expected an HTTP response")
  const parsed: unknown = JSON.parse(this.response.body)
  assert.equal(typeof parsed, "object")
  assert.notEqual(parsed, null)
  assert.equal((parsed as Record<string, unknown>).configPath, path.join(this.directory, `${alias}.json`))
})
