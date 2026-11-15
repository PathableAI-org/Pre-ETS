import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { AppWorld } from "../support/world.ts"

import { responseJson } from "../support/response.ts"
import { multipartBody, serverActionId } from "../support/server-actions.ts"
import {
  FETCH_METADATA,
  type FetchMetadataKind,
  type RecordedResponse,
  requestSite,
  requestSiteWith
} from "../support/server.ts"

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
 * React's client encodes `runReferenceOperation(initialReferenceActionState, formData)` with
 * `encodeReply([{ _tag: "Ready" }, formData])`: each form entry as a `_1_<name>` field, then field `0` with the
 * arguments, where `$K1` refers to the form (as a page's own submission was observed to send them). A page submits the
 * coordination tag it observed in the form's `coordinationTag` field; a visitor whose page observed none submits an
 * empty form.
 */
const referenceActionArguments = (coordinationTag: string | undefined) => {
  const fields: [name: string, value: string][] = []
  if (coordinationTag !== undefined) fields.push(["_1_coordinationTag", coordinationTag])
  fields.push(["0", JSON.stringify([{ _tag: "Ready" }, "$K1"])])
  return fields
}

/** Read as the page's session coordinator reads it: the session's own snapshot from `GET /session/status`. */
Given(
  "the visitor's page at {string} has observed its session's coordination tag",
  async function(this: AppWorld, host: string) {
    await requestSiteWith(this, { headers: FETCH_METADATA.application, host, method: "GET", path: "/session/status" })
    assert.equal(this.response?.status, 200)
    const { coordinationTag } = responseJson(this)
    assert.equal(typeof coordinationTag, "string")
    this.coordinationTag = String(coordinationTag)
  }
)

/** A script-driven invocation of the built Server Action `exportedName`, posted to the page at `path` as its form is. */
const invokeAction = async (world: AppWorld, exportedName: string, host: string, path: string) => {
  const action = await serverActionId(exportedName)
  const { body, contentType } = await multipartBody(referenceActionArguments(world.coordinationTag))
  await requestSiteWith(world, {
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
    path
  })
}

When("a visitor invokes the protected reference action at {string}", async function(this: AppWorld, host: string) {
  await invokeAction(this, "runReferenceOperation", host, "/")
})
/** `recordFixtureOperation` takes the same `(state, formData)` arguments, from the same `Ready` state. */
When(
  "a visitor invokes the protected fixture action on {string} at {string}",
  async function(this: AppWorld, path: string, host: string) {
    await invokeAction(this, "recordFixtureOperation", host, path)
  }
)
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
/** The fixture action reports a performed operation only with this message; it records nothing else. */
Then("the response reports no fixture operation", function(this: AppWorld) {
  assert.ok(this.response, "expected an HTTP response")
  assert.doesNotMatch(this.response.body, /The attendance note was accepted/)
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
Then("the response issues a reference-operation receipt", function(this: AppWorld) {
  assert.ok(issuedCookieNames(this).includes("preets-ref-effect"), "issued no reference-operation receipt")
})
Then("the response issues one recoverable correlation cookie and no application session", function(this: AppWorld) {
  const cookie = this.response?.headers["set-cookie"] ?? ""
  assert.match(cookie, /(?:^|\n)oidc-correlation=[A-Za-z0-9_-]{43};/)
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  assertNoApplicationSession(cookie)
  assert.doesNotMatch(cookie, /(?:^|;\s*)Domain=/i)
})
/** A 307 to the request origin's own `/auth/login`, without a query. */
export const assertSameOriginLogin = (response: RecordedResponse | undefined): void => {
  assert.equal(response?.status, 307)
  const destination = new URL(response.headers.location ?? "", "http://logical-application")
  assert.equal(destination.origin, "http://logical-application")
  assert.equal(destination.pathname, "/auth/login")
  assert.equal(destination.search, "")
}

/** The reference entry's heading marks protected application content. */
export const assertNoProtectedContent = (response: RecordedResponse | undefined): void => {
  assert.ok(response, "expected an HTTP response")
  assert.doesNotMatch(response.body, /Reference session/)
}

Then("the response delegates to the same-origin login", function(this: AppWorld) {
  assertSameOriginLogin(this.response)
})
Then("the response does not delegate to login", function(this: AppWorld) {
  const location = this.response?.headers.location
  if (location === undefined) return
  assert.notEqual(new URL(location, "http://logical-application").pathname, "/auth/login")
})
Then("the response contains no protected application content", function(this: AppWorld) {
  assertNoProtectedContent(this.response)
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
Then("the response shows the protected application", function(this: AppWorld) {
  assert.equal(this.response?.status, 200)
  assert.match(this.response.body, /Reference session/)
})
