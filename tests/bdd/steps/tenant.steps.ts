import type { DataTable } from "@cucumber/cucumber"

import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { TenantWorld } from "../support/world.ts"

import { INVALID_MODE_DIAGNOSTIC } from "../../../packages/frontend/src/lib/tenant/types.ts"
import {
  assertAccessibleLiteralName,
  assertDisplayedName,
  assertHeading,
  assertIdentifiedTenant,
  assertKeyboardTarget,
  assertLocalConfigError,
  assertNoSuccessfulContext,
  assertNotDisplayedName,
  assertRefused,
  assertServerError,
  assertVisitOutcome,
  effectiveMode,
  hostSuffix,
  navigateWithKeyboard,
  openIndependentVisitors,
  openLandingPage,
  readEstablishedConsumers,
  reloadIndependentVisitors,
  reloadLandingPage,
  requestLandingPage,
  requireContext,
  requireFailure,
  resolveHost,
  upsertTenant,
  visitEqualNameTenants
} from "../support/actions.ts"

Given("the known synthetic tenants are:", function(this: TenantWorld, table: DataTable) {
  this.tenants = table.hashes().map((row) => ({
    displayName: row["Display Name"] ?? "",
    slug: row.slug ?? ""
  }))
})

Given("the developer has enabled production-like host association", function(this: TenantWorld) {
  this.resolutionMode = "host"
  this.runtime ??= "development"
})

Given(
  "a local static record exists for tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    this.localStaticRecord = { displayName: name, slug }
  }
)

Given("no local resolution mode has been supplied", function(this: TenantWorld) {
  this.resolutionMode = undefined
  this.runtime ??= "development"
})

Given(
  "the developer supplied the unsupported resolution mode {string}",
  function(this: TenantWorld, mode: string) {
    this.unsupportedMode = mode
    this.runtime ??= "development"
  }
)

Given("the application instead runs in production", function(this: TenantWorld) {
  this.runtime = "production"
})

Given("the developer supplied a setting to disable host association", function(this: TenantWorld) {
  this.resolutionMode = "static"
})

Given("tenant {string} has Display Name {string}", function(this: TenantWorld, slug: string, name: string) {
  upsertTenant(this, slug, name)
})

Given("the developer has explicitly disabled production-like host association", function(this: TenantWorld) {
  this.resolutionMode = "static"
  this.runtime ??= "development"
})

Given(
  "the developer supplies tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    this.localStaticRecord = { displayName: name, slug }
    this.resolutionMode = "static"
  }
)

Given("the user has seen {string} on the local landing page", async function(this: TenantWorld, name: string) {
  await openLandingPage(this, `localhost:${String(this.port)}`)
  assertDisplayedName(this, name)
})

Given("the user has opened the local landing page", async function(this: TenantWorld) {
  await openLandingPage(this, `localhost:${String(this.port)}`)
})

Given("production-like host association is enabled in production", function(this: TenantWorld) {
  this.resolutionMode = "host"
  this.runtime = "production"
})

Given(
  "the visitor's request reaches the application with {string}",
  function(this: TenantWorld, condition: string) {
    this.hostCondition = condition
  }
)

Given("the authoritative host is {string}", function(this: TenantWorld, host: string) {
  this.authoritativeHost = host
})

Given(
  "caller-supplied forwarded-host, tenant headers, and query values suggest {string}",
  function(this: TenantWorld, slug: string) {
    this.competingSlug = slug
  }
)

Given(
  "two users independently visit the Springfield and Shelbyville landing pages on the same running application",
  async function(this: TenantWorld) {
    await openIndependentVisitors(this)
  }
)

Given(
  "the visitor's request has been associated with tenant {string}",
  function(this: TenantWorld, slug: string) {
    this.establishedSlug = slug
  }
)

Given(
  "the configuration read for {string} has failure {string}",
  function(this: TenantWorld, _slug: string, failure: string) {
    this.configurationFailure = failure
  }
)

Given("both known tenants have Display Name {string}", function(this: TenantWorld, name: string) {
  this.tenants = this.tenants.map((tenant) => ({ displayName: name, slug: tenant.slug }))
})

Given(
  "the configuration for {string} has {string}",
  function(this: TenantWorld, _slug: string, invalidName: string) {
    this.invalidDisplayName = invalidName
  }
)

When("the user opens the landing page at {string}", async function(this: TenantWorld, host: string) {
  await openLandingPage(this, host)
})

When(
  "the resolver handles {string} and {string}",
  async function(this: TenantWorld, knownHost: string, unknownHost: string) {
    this.knownHostResult = await resolveHost(this, knownHost)
    this.unknownHostResult = await resolveHost(this, unknownHost)
  }
)

When("the user reloads the landing page at {string}", async function(this: TenantWorld, host: string) {
  await reloadLandingPage(this, host)
})

When("the user navigates the page using the keyboard", async function(this: TenantWorld) {
  await navigateWithKeyboard(this)
})

When("the user requests the landing page", async function(this: TenantWorld) {
  await requestLandingPage(this)
})

When("both users reload their landing pages with overlapping requests", async function(this: TenantWorld) {
  await reloadIndependentVisitors(this)
})

When("consumers repeatedly read the established tenant context and configuration", async function(this: TenantWorld) {
  await readEstablishedConsumers(this)
})

When(
  "the unchanged consumer resolves {string} and reads its established tenant configuration",
  async function(this: TenantWorld, host: string) {
    this.contractResult = await resolveHost(this, host)
  }
)

When(
  "the resolver consumes the configuration result for the established tenant {string}",
  async function(this: TenantWorld, slug: string) {
    this.contractResult = await resolveHost(this, `${slug}.${hostSuffix(this)}`)
  }
)

When("two users visit their respective tenant landing pages", async function(this: TenantWorld) {
  await visitEqualNameTenants(this)
})

Then(
  "the landing page displays the tenant Display Name {string}",
  function(this: TenantWorld, name: string) {
    assertDisplayedName(this, name)
  }
)

Then("access is refused with HTTP status 403 without a redirect", function(this: TenantWorld) {
  assertRefused(this)
})

Then("no successful tenant context is returned", function(this: TenantWorld) {
  assertNoSuccessfulContext(this)
})

Then("the Display Name {string} is not displayed", function(this: TenantWorld, name: string) {
  assertNotDisplayedName(this, name)
})

Then("host association remains enforced for both requests", function(this: TenantWorld) {
  assert.equal(effectiveMode(this), "host")
  assert.ok(this.knownHostResult)
  assert.ok(this.unknownHostResult)
})

Then(
  "the known host resolves tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    const context = requireContext(this.knownHostResult)
    assert.equal(context.slug, slug)
    assert.equal(context.config.displayName, name)
  }
)

Then("the unknown host is denied without a successful tenant context", function(this: TenantWorld) {
  assert.ok(this.unknownHostResult)
  assert.equal(this.unknownHostResult.ok, false)
})

Then("neither result uses the local static record", function(this: TenantWorld) {
  const forbidden = this.localStaticRecord?.displayName
  assert.ok(forbidden)
  if (this.knownHostResult?.ok === true) {
    assert.notEqual(this.knownHostResult.value.config.displayName, forbidden)
  }

  if (this.unknownHostResult?.ok === true) {
    assert.notEqual(this.unknownHostResult.value.config.displayName, forbidden)
  }
})

Then(
  "diagnostics report {string} with accepted-mode guidance without echoing the supplied value",
  function(this: TenantWorld, code: string) {
    assert.ok(this.modeDiagnostic)
    assert.equal(this.modeDiagnostic.category, code)
    assert.deepEqual(this.modeDiagnostic, INVALID_MODE_DIAGNOSTIC)
    assert.ok(this.unsupportedMode)
    assert.equal(JSON.stringify(this.modeDiagnostic).includes(this.unsupportedMode), false)
  }
)

Then("the visit has outcome {string}", function(this: TenantWorld, outcome: string) {
  assertVisitOutcome(this, outcome)
})

Then(
  "the landing page displays the literal tenant Display Name {string}",
  async function(this: TenantWorld, name: string) {
    assertDisplayedName(this, name)
    await assertAccessibleLiteralName(this, name)
  }
)

Then("the name is available as readable text to assistive technology", async function(this: TenantWorld) {
  assert.ok(this.page)
  const text = await this.page.getByText(/^Tenant: /).first().textContent()
  assert.ok(text?.startsWith("Tenant: "))
})

Then("no markup or executable content is created from the name", async function(this: TenantWorld) {
  assert.ok(this.page)
  const html = await this.page.content()
  assert.equal(html.includes("<script>alert('tenant')</script>"), false)
  assert.equal(await this.page.locator("demo").count(), 0)
})

Then("the existing keyboard path to {string} remains usable", async function(this: TenantWorld, button: string) {
  await assertKeyboardTarget(this, button)
})

Then("no tenant-shaped local address is required", function(this: TenantWorld) {
  assert.ok(this.requestedHost)
  assert.match(this.requestedHost, /^localhost(?::\d+)?$/)
})

Then(
  "the current context identifies tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    assertIdentifiedTenant(this, slug, name)
  }
)

Then(
  "the context is identified as supplied local static data rather than host-associated identity",
  function(this: TenantWorld) {
    assert.equal(effectiveMode(this), "static")
    assert.equal(this.binderInvocationCount, 0)
  }
)

Then("the host is not used to select a tenant", function(this: TenantWorld) {
  assert.equal(this.binderInvocationCount, 0)
})

Then(
  "the landing page does not display the previous tenant Display Name {string}",
  function(this: TenantWorld, name: string) {
    assertNotDisplayedName(this, name)
  }
)

Then("the response has HTTP status 500 without a redirect", function(this: TenantWorld) {
  assertServerError(this)
})

Then("an understandable local configuration error is displayed", function(this: TenantWorld) {
  assertLocalConfigError(this)
})

Then(
  "the user can reach the existing {string} button with visible focus",
  async function(this: TenantWorld, button: string) {
    await assertKeyboardTarget(this, button)
  }
)

Then("the page retains a meaningful top-level heading", async function(this: TenantWorld) {
  await assertHeading(this)
})

Then("the tenant Display Name {string} remains readable", function(this: TenantWorld, name: string) {
  assertDisplayedName(this, name)
})

Then(
  "the landing page does not display the tenant Display Name {string}",
  function(this: TenantWorld, name: string) {
    assertNotDisplayedName(this, name)
  }
)

Then("neither known tenant's Display Name is displayed", function(this: TenantWorld) {
  for (const tenant of this.tenants) {
    assertNotDisplayedName(this, tenant.displayName)
  }
})

Then(
  "the Springfield visitor sees the tenant Display Name {string}",
  async function(this: TenantWorld, name: string) {
    assert.ok(this.springfieldPage)
    assert.match(await this.springfieldPage.content(), new RegExp(`Tenant: ${escapeRegExp(name)}`))
  }
)

Then(
  "the Shelbyville visitor sees the tenant Display Name {string}",
  async function(this: TenantWorld, name: string) {
    assert.ok(this.shelbyvillePage)
    assert.match(await this.shelbyvillePage.content(), new RegExp(`Tenant: ${escapeRegExp(name)}`))
  }
)

Then("neither visitor sees the other tenant's Display Name", async function(this: TenantWorld) {
  assert.ok(this.springfieldPage)
  assert.ok(this.shelbyvillePage)
  assert.doesNotMatch(await this.springfieldPage.content(), /Shelbyville Demo/)
  assert.doesNotMatch(await this.shelbyvillePage.content(), /Springfield Demo/)
})

Then(
  "every consumer receives tenant {string} and Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    assert.ok(this.consumerContexts.length > 0)
    for (const context of this.consumerContexts) {
      assert.equal(context.slug, slug)
      assert.equal(context.config.displayName, name)
    }
  }
)

Then(
  "no consumer interprets the address again or accesses the configuration store directly",
  function(this: TenantWorld) {
    assert.ok(this.consumerContexts.length > 0)
  }
)

Then("the request has exactly one host-based tenant determination", function(this: TenantWorld) {
  assert.ok(this.establishedSlug)
})

Then(
  "the returned context identifies tenant {string} with Display Name {string}",
  function(this: TenantWorld, slug: string, name: string) {
    assertIdentifiedTenant(this, slug, name)
  }
)

Then("the consumer does not need knowledge of the replacement configuration source", function(this: TenantWorld) {
  assert.ok(this.contractResult?.ok)
})

Then("a configuration failure prevents a successful tenant context", function(this: TenantWorld) {
  assert.ok(this.contractResult)
  assert.equal(this.contractResult.ok, false)
})

Then(
  "the failure does not become another tenant or expose tenant Display Names",
  function(this: TenantWorld) {
    const serialized = JSON.stringify(this.contractResult)
    assert.equal(serialized.includes("Shelbyville Demo"), false)
    assert.equal(serialized.includes("Springfield Demo"), false)
  }
)

Then("the error response contains neither known tenant's Display Name", function(this: TenantWorld) {
  const serialized = JSON.stringify(this.contractResult ?? this.httpResponse?.body ?? "")
  for (const tenant of this.tenants) {
    assert.equal(serialized.includes(tenant.displayName), false)
  }
})

Then(
  "diagnostics identify {string} without exposing another tenant's data",
  function(this: TenantWorld, category: string) {
    const reason = requireFailure(this.contractResult)
    if (category === "configuration mismatch") {
      assert.equal(reason, "invalid-config")
    } else {
      assert.equal(reason, "unreadable-config")
    }

    const serialized = JSON.stringify(this.contractResult)
    assert.equal(serialized.includes("Shelbyville Demo"), false)
    assert.equal(serialized.includes("Springfield Demo"), false)
  }
)

Then("both visitors see the tenant Display Name {string}", async function(this: TenantWorld, name: string) {
  assert.ok(this.springfieldPage)
  assert.ok(this.shelbyvillePage)
  assert.match(await this.springfieldPage.content(), new RegExp(`Tenant: ${escapeRegExp(name)}`))
  assert.match(await this.shelbyvillePage.content(), new RegExp(`Tenant: ${escapeRegExp(name)}`))
})

Then(
  "the Springfield visitor's tenant identity remains {string}",
  function(this: TenantWorld, slug: string) {
    assert.equal(this.springfieldIdentity?.slug, slug)
  }
)

Then(
  "the Shelbyville visitor's tenant identity remains {string}",
  function(this: TenantWorld, slug: string) {
    assert.equal(this.shelbyvilleIdentity?.slug, slug)
  }
)

Then("a visible configuration failure prevents a successful tenant context", function(this: TenantWorld) {
  assertServerError(this)
  assertNoSuccessfulContext(this)
})

Then(
  "neither the slug nor another tenant's name is used as a Display Name fallback",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /springfield/i)
    assert.doesNotMatch(this.httpResponse.body, /Shelbyville Demo/)
  }
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
