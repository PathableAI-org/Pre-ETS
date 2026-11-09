import { Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { AppWorld } from "../support/world.ts"

import { responseJson } from "../support/response.ts"
import { multipartBody, serverActionId } from "../support/server-actions.ts"
import { FETCH_METADATA, type FetchMetadataKind, requestSite, requestSiteWith } from "../support/server.ts"

const isFetchMetadataKind = (kind: string): kind is FetchMetadataKind => Object.hasOwn(FETCH_METADATA, kind)

const issuedCookieNames = (world: AppWorld): string[] => {
  assert.ok(world.response, "expected an HTTP response")
  const headers = world.response.headers["set-cookie"]
  return headers === undefined ? [] : headers.split("\n").map((header) => header.split("=", 1)[0]?.trim() ?? "")
}

const assertNoApplicationSession = (cookie: string): void => {
  assert.match(cookie, /Path=\/auth\/callback/i)
  for (const header of cookie.split("\n")) {
    assert.doesNotMatch(header, /(?:^|;\s*)(?:pathable-)?session=/i)
  }
}

When("a visitor requests the document at {string}", async function(this: AppWorld, host: string) {
  await requestSite(this, host)
})
When("a visitor requests {string} at {string}", async function(this: AppWorld, path: string, host: string) {
  await requestSite(this, host, true, path)
})
When(
  "a visitor sends {string} to {string} at {string} as a(n) {string} request",
  async function(this: AppWorld, method: string, path: string, host: string, kind: string) {
    assert.ok(isFetchMetadataKind(kind), `Unknown request kind ${kind}`)
    await requestSiteWith(this, { headers: FETCH_METADATA[kind], host, method, path })
  }
)
/**
 * React's client encodes `runReferenceOperation(initialReferenceActionState, new FormData())` with
 * `encodeReply([{ _tag: "Ready" }, new FormData()])` as one multipart field `0`; `$K1` refers to the empty form.
 */
const referenceActionArguments = { "0": JSON.stringify([{ _tag: "Ready" }, "$K1"]) }

When("a visitor invokes the protected reference action at {string}", async function(this: AppWorld, host: string) {
  const action = await serverActionId("runReferenceOperation")
  const { body, contentType } = await multipartBody(referenceActionArguments)
  await requestSiteWith(this, {
    body,
    headers: {
      ...FETCH_METADATA.application,
      Accept: "text/x-component",
      "content-type": contentType,
      "next-action": action,
      Origin: `https://${host}`,
      "sec-fetch-site": "same-origin"
    },
    host,
    method: "POST",
    path: "/"
  })
})
Then("the response status is {int}", function(this: AppWorld, status: number) {
  assert.equal(this.response?.status, status)
})
Then("the response is not an authentication, authorization, or server failure", function(this: AppWorld) {
  const status = this.response?.status
  assert.ok(status !== undefined && status < 500 && ![401, 403].includes(status), `unexpected status ${String(status)}`)
})
Then("the earlier callback status is {int}", function(this: AppWorld, status: number) {
  assert.equal(this.earlierResponse?.status, status)
})
Then("the earlier callback issues no cookie", function(this: AppWorld) {
  assert.equal(this.earlierResponse?.headers["set-cookie"], undefined)
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

Then("the response contains no fallback tenant", function(this: AppWorld) {
  assert.ok(this.response)
  assert.doesNotMatch(this.response.body, /Welcome to the Pre-ETS workspace|Springfield|Shelbyville/)
  assert.doesNotMatch(this.response.body, /"displayName"\s*:/)
})

Then("the response is not cacheable", function(this: AppWorld) {
  assert.match(this.response?.headers["cache-control"] ?? "", /(?:^|[,\s])no-store(?:$|[,\s])/)
})
Then("the response issues no application or correlation cookie", function(this: AppWorld) {
  const issued = issuedCookieNames(this)
  assert.ok(!issued.includes("pathable-session"), "issued the application session cookie")
  assert.ok(!issued.includes("oidc-correlation"), "issued the correlation cookie")
})
Then("the response issues no reference-operation receipt", function(this: AppWorld) {
  assert.ok(!issuedCookieNames(this).includes("preets-ref-effect"), "issued the reference-operation receipt")
})
Then("the response issues one recoverable correlation cookie and no application session", function(this: AppWorld) {
  const cookie = this.response?.headers["set-cookie"] ?? ""
  assert.match(cookie, /(?:^|\n)oidc-correlation=[A-Za-z0-9_-]{43};/)
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  assertNoApplicationSession(cookie)
  assert.doesNotMatch(cookie, /(?:^|;\s*)Domain=/i)
})
Then("the response delegates to the same-origin login", function(this: AppWorld) {
  assert.equal(this.response?.status, 307)
  const destination = new URL(this.response.headers.location ?? "", "http://logical-application")
  assert.equal(destination.origin, "http://logical-application")
  assert.equal(destination.pathname, "/auth/login")
  assert.equal(destination.search, "")
})
Then("the response does not delegate to login", function(this: AppWorld) {
  const location = this.response?.headers.location
  if (location === undefined) return
  assert.notEqual(new URL(location, "http://logical-application").pathname, "/auth/login")
})
Then("the response contains no protected application content", function(this: AppWorld) {
  assert.ok(this.response)
  assert.doesNotMatch(this.response.body, /Welcome to the Pre-ETS workspace|Reference session/)
})
Then("the response body is empty", function(this: AppWorld) {
  assert.equal(this.response?.body, "")
})
Then("the response clears recoverable correlation and issues no application session", function(this: AppWorld) {
  const cookie = this.response?.headers["set-cookie"] ?? ""
  assert.match(cookie, /(?:^|\n)oidc-correlation=;/)
  assert.match(cookie, /Max-Age=0/i)
  assertNoApplicationSession(cookie)
})
Then("the response does not re-emit controlled provider callback data", function(this: AppWorld) {
  assert.ok(this.response)
  const output = `${this.response.body}\n${Object.values(this.response.headers).join("\n")}`
  assert.doesNotMatch(output, /access_denied|controlled-private-value/i)
})
