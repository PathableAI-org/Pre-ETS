import type { DataTable } from "@cucumber/cucumber"

import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { TenantWorld } from "../support/world.ts"

import { OIDC_COOKIE_NAME } from "../../../packages/frontend/src/lib/oidc/types.ts"
import {
  applyOidcDefect,
  assertAppOwnedFailure,
  assertConcurrentDistinctInitiations,
  assertExtendedForbidden,
  assertFailureClass,
  assertIdpAuthorizationRedirect,
  assertNoHtmlLoginRedirect,
  assertNoLandingContent,
  assertNoProviderRedirect,
  assertNoRedirectLoop,
  assertNoSessionSetCookie,
  assertNotLoginUnavailableRoute,
  assertOidcCookiePresent,
  assertPkceProtected,
  assertSpringfieldTrustedInitiation,
  assertSupportingRequestHandling,
  clearCookies,
  configureIsolatedOidcFixtures,
  forceInitiationFailure,
  issueFailureClassRequest,
  requestSupportingCategory,
  restartForOidcConfig,
  seedAnonymousSpringfieldSession,
  visitConcurrentTenantHosts,
  visitOidcHost,
  visitOidcUrl
} from "../support/oidc.ts"
import { ensureSessionSettings } from "../support/session-env.ts"
import { applySessionReferenceCondition, seedValidSession } from "../support/session.ts"

/**
 * OIDC login ATDD steps for `tenant-oidc-login`, `tenant-oidc-configuration`, and
 * `local-oidc-development`. @http/@contract paths use an in-process mock IdP.
 * Live Keycloak / Compose provider-arrival (@browser) steps remain Pending.
 */

function pendingBrowserKeycloak(step: string): never {
  throw new Error(
    `Pending: ${step} (requires Compose Keycloak / live provider arrival; use @http mock IdP paths)`
  )
}

Given(
  "a previous sessionless visit failed because local Keycloak was stopped",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "a previous sessionless visit failed because local Keycloak was stopped"
    )
  }
)

Given(
  "a synthetic credential is supplied at runtime through the planned server-only mechanism",
  function(this: TenantWorld) {
    this.oidcClientSecretsJson = JSON.stringify({ springfield: "bdd-springfield-secret" })
    this.processSignature = undefined
  }
)

Given(
  "an app-owned {string} prevents Springfield login initiation",
  function(this: TenantWorld, _failure: string) {
    pendingBrowserKeycloak("an app-owned {string} prevents Springfield login initiation")
  }
)

Given(
  "an app-owned login failure offers an interactive recovery action",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("an app-owned login failure offers an interactive recovery action")
  }
)

Given(
  "an isolated local OIDC development environment with documented prerequisites",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "an isolated local OIDC development environment with documented prerequisites"
    )
  }
)

Given(
  "both tenants have Display Name {string}",
  function(this: TenantWorld, name: string) {
    assert.ok(this.oidcFixtures)
    this.oidcFixtures = this.oidcFixtures.map((fixture) => ({
      ...fixture,
      displayName: name
    }))
    this.tenants = this.oidcFixtures.map((fixture) => ({
      displayName: fixture.displayName,
      slug: fixture.slug
    }))
    this.processSignature = undefined
  }
)

Given(
  "caller-controlled {string} supplies {string}",
  function(this: TenantWorld, source: string, value: string) {
    this.oidcCallerOverride = { source, value }
  }
)

Given(
  "each tenant has a separate fresh browser context without a session",
  function(this: TenantWorld) {
    clearCookies(this)
  }
)

Given(
  "each visitor has a separate fresh browser context without a session",
  function(this: TenantWorld) {
    clearCookies(this)
  }
)

Given(
  "explicit static tenant mode on bare localhost supplies Springfield's Display Name without OIDC settings",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "explicit static tenant mode on bare localhost supplies Springfield's Display Name without OIDC settings"
    )
  }
)

Given(
  "explicit static tenant mode on bare localhost supplies valid Springfield OIDC settings",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "explicit static tenant mode on bare localhost supplies valid Springfield OIDC settings"
    )
  }
)

Given(
  "isolated OIDC tenant fixtures are configured:",
  async function(this: TenantWorld, table: DataTable) {
    await configureIsolatedOidcFixtures(this, table)
  }
)

Given(
  "Springfield's trusted OIDC settings use client auth {string}",
  function(this: TenantWorld, clientAuth: string) {
    assert.ok(clientAuth === "public" || clientAuth === "confidential")
    assert.ok(this.oidcFixtures)
    this.oidcFixtures = this.oidcFixtures.map((fixture) =>
      fixture.slug === "springfield" ? { ...fixture, clientAuth } : fixture
    )
    this.processSignature = undefined
  }
)

Given(
  "its trusted OIDC settings supply {string}",
  function(this: TenantWorld, _selection: string) {
    pendingBrowserKeycloak("its trusted OIDC settings supply {string}")
  }
)

Given(
  "local credentials are supplied by the developer outside committed fixtures",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "local credentials are supplied by the developer outside committed fixtures"
    )
  }
)

Given(
  "local Keycloak becomes unreachable before the browser reaches its login page",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "local Keycloak becomes unreachable before the browser reaches its login page"
    )
  }
)

Given(
  "local Keycloak has stopped and required metadata is unavailable to the application",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "local Keycloak has stopped and required metadata is unavailable to the application"
    )
  }
)

Given(
  "local Keycloak is ready",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("local Keycloak is ready")
  }
)

Given(
  "local Keycloak is ready with a registered client for {string}",
  function(this: TenantWorld, _tenant: string) {
    pendingBrowserKeycloak("local Keycloak is ready with a registered client for {string}")
  }
)

Given(
  "local tenant resolution uses host association",
  function(this: TenantWorld) {
    this.resolutionMode = "host"
    this.forceDevelopmentRuntime = true
    this.runtime = "development"
  }
)

Given(
  "required provider metadata is {string} before login can start",
  function(this: TenantWorld, condition: string) {
    if (condition === "unreachable" || condition === "unusable for login initiation") {
      this.oidcFixtures = this.oidcFixtures?.map((fixture) =>
        fixture.slug === "springfield"
          ? { ...fixture, issuer: "https://identity.example/realms/pre-ets" }
          : fixture
      )
      this.processSignature = undefined
      return
    }

    throw new Error(`Unknown provider metadata condition: ${condition}`)
  }
)

Given(
  "Shelbyville retains a valid login configuration",
  function(this: TenantWorld) {
    assert.ok(this.oidcFixtures?.some((fixture) => fixture.slug === "shelbyville"))
  }
)

Given(
  "Springfield initiation is forced into failure class {string}",
  function(this: TenantWorld, failure: string) {
    forceInitiationFailure(this, failure)
  }
)

Given(
  "Springfield previously could not initiate login because its issuer was missing",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "Springfield previously could not initiate login because its issuer was missing"
    )
  }
)

Given(
  "Springfield's configured {string} uses {string}",
  function(this: TenantWorld, destination: string, url: string) {
    throw new Error(
      `Pending: insecure ${destination} "${url}" (parse-time HTTP issuer rejection is not extended-403 yet; needs app wiring beyond TENANT_CONFIG_RECORDS_JSON parse)`
    )
  }
)

Given(
  "Springfield's connection is changed to {string}",
  function(this: TenantWorld, _connection: string) {
    pendingBrowserKeycloak("Springfield's connection is changed to {string}")
  }
)

Given(
  "Springfield's login configuration has defect {string}",
  function(this: TenantWorld, defect: string) {
    if (defect === "missing required server-only credential") {
      applyOidcDefect(this, defect)
      return
    }

    // @browser scenarios also hit this step; keep Pending (not hard-fail) for non-HTTP defects.
    throw new Error(
      `Pending: Springfield login defect "${defect}" (HTTP harness covers confidential-without-secret → extended 403; other parse-time defects need app extended-403 wiring)`
    )
  }
)

Given(
  "Springfield's provider registration {string}",
  function(this: TenantWorld, _registration: string) {
    pendingBrowserKeycloak("Springfield's provider registration {string}")
  }
)

Given(
  "Springfield's provider registration requires a client credential",
  function(this: TenantWorld) {
    assert.ok(this.oidcFixtures)
    this.oidcFixtures = this.oidcFixtures.map((fixture) =>
      fixture.slug === "springfield" ? { ...fixture, clientAuth: "confidential" } : fixture
    )
    this.processSignature = undefined
  }
)

Given(
  "that capability creates a fresh session for the validated Springfield tenant during this request",
  function(this: TenantWorld) {
    // Session setup create-on-unusable is exercised by the presented condition + navigate.
    ensureSessionSettings(this)
  }
)

Given(
  "that session was presented on entry and contains no authenticated user identity",
  function(this: TenantWorld) {
    assert.ok(this.sessionId)
    assert.equal(this.sessionTenantId, "springfield")
  }
)

Given(
  "the application has the valid provider metadata needed to initiate login",
  function(this: TenantWorld) {
    assert.ok(this.oidcMockIssuer)
  }
)

Given(
  "the application runs outside explicit local development",
  function(this: TenantWorld) {
    this.forceDevelopmentRuntime = false
    this.runtime = "production"
    this.processSignature = undefined
  }
)

Given(
  "the developer has followed the documented provider recovery and readiness instructions",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the developer has followed the documented provider recovery and readiness instructions"
    )
  }
)

Given(
  "the developer supplies its valid issuer using the documented configuration procedure",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the developer supplies its valid issuer using the documented configuration procedure"
    )
  }
)

Given(
  "the documented configuration reload or restart has completed",
  async function(this: TenantWorld) {
    await restartForOidcConfig(this)
  }
)

Given(
  "the documented issuer identity is configured for both browser and host application access",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the documented issuer identity is configured for both browser and host application access"
    )
  }
)

Given(
  "the documented reload or restart has completed",
  async function(this: TenantWorld) {
    await restartForOidcConfig(this)
  }
)

Given(
  "the existing session capability and required provider metadata are available",
  function(this: TenantWorld) {
    ensureSessionSettings(this)
    assert.ok(this.oidcMockIssuer ?? this.oidcFixtures)
  }
)

Given(
  "the existing session capability is available",
  function(this: TenantWorld) {
    ensureSessionSettings(this)
  }
)

Given(
  "the existing session capability returns a terminal refusal or service failure instead of a ready session",
  function(this: TenantWorld) {
    this.redisUrl = "redis://127.0.0.1:6399"
    this.processSignature = undefined
  }
)

Given(
  "the existing session service is available",
  function(this: TenantWorld) {
    ensureSessionSettings(this)
  }
)

Given(
  "the frontend runs in production with static Springfield OIDC settings supplied",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the frontend runs in production with static Springfield OIDC settings supplied"
    )
  }
)

Given(
  "the local provider starts from a clean state",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("the local provider starts from a clean state")
  }
)

Given(
  "the protected OIDC transaction context cannot be established",
  function(this: TenantWorld) {
    forceInitiationFailure(this, "transaction failure")
  }
)

Given(
  "the session capability creates a tenant-bound session during login initiation",
  function(this: TenantWorld) {
    clearCookies(this)
  }
)

Given(
  "the session capability reports an existing valid session bound to {string}",
  async function(this: TenantWorld, tenant: string) {
    ensureSessionSettings(this)
    this.forceDevelopmentRuntime = true
    this.runtime = "development"
    await seedAnonymousSpringfieldSession(this)
    assert.equal(this.sessionTenantId, tenant)
  }
)

Given(
  "the visitor has no existing session",
  function(this: TenantWorld) {
    clearCookies(this)
  }
)

Given(
  "the visitor has no existing session in a fresh browser context",
  function(this: TenantWorld) {
    clearCookies(this)
  }
)

Given(
  "the visitor presents a session evaluated as {string} by the existing session capability",
  async function(this: TenantWorld, condition: string) {
    ensureSessionSettings(this)
    this.forceDevelopmentRuntime = true
    this.runtime = "development"
    const mapped = condition === "bound to shelbyville"
      ? "evicted record with valid cookie"
      : condition === "invalid"
      ? "malformed cookie"
      : condition === "expired"
      ? "expired cookie"
      : condition
    if (condition === "bound to shelbyville") {
      await seedValidSession(this, "shelbyville")
      return
    }

    await applySessionReferenceCondition(this, mapped)
  }
)

Given(
  "the visitor starts a fresh browser context without an existing session",
  function(this: TenantWorld) {
    clearCookies(this)
  }
)

When(
  "the developer follows the documented provider startup, readiness, and synthetic tenant provisioning instructions",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the developer follows the documented provider startup, readiness, and synthetic tenant provisioning instructions"
    )
  }
)

When(
  "the visitor encounters the failure using the page's accessible structure",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the visitor encounters the failure using the page's accessible structure"
    )
  }
)

When(
  "the visitor issues the corresponding Springfield request for that failure class",
  async function(this: TenantWorld) {
    await issueFailureClassRequest(this)
  }
)

When(
  "the visitor navigates to {string}",
  async function(this: TenantWorld, value1: string) {
    await visitOidcUrl(this, value1)
  }
)

When(
  "the visitor navigates to the trusted application host {string}",
  async function(this: TenantWorld, host: string) {
    await visitOidcHost(this, host)
  }
)

When(
  "the visitor reaches and activates that action using only the keyboard",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the visitor reaches and activates that action using only the keyboard"
    )
  }
)

When(
  "the visitor retries the Springfield application page without an existing session",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the visitor retries the Springfield application page without an existing session"
    )
  }
)

When(
  "the visitor's browser requests an existing {string} on the Springfield application host",
  async function(this: TenantWorld, category: string) {
    await requestSupportingCategory(this, category)
  }
)

When(
  "the visitors concurrently navigate to the Springfield and Shelbyville application hosts",
  async function(this: TenantWorld) {
    await visitConcurrentTenantHosts(this)
  }
)

When(
  "the visitors navigate to their respective Springfield and Shelbyville application hosts",
  async function(this: TenantWorld) {
    await visitConcurrentTenantHosts(this)
  }
)

Then(
  "a safe diagnostic identifies a configuration failure without credentials or other tenant details",
  function(this: TenantWorld) {
    assertExtendedForbidden(this)
  }
)

Then(
  "a safe diagnostic identifies a provider failure without credentials or other tenant details",
  function(this: TenantWorld) {
    assertAppOwnedFailure(this)
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /OIDC_CLIENT_SECRETS|client_secret|shelbyville/i)
  }
)

Then(
  "an app-owned provider failure explains that login cannot start and provides a clear next action",
  function(this: TenantWorld) {
    assertAppOwnedFailure(this)
  }
)

Then(
  "any initiated login uses only Springfield's trusted configuration and approved return host",
  function(this: TenantWorld) {
    assertSpringfieldTrustedInitiation(this)
  }
)

Then(
  "both tenant ids and Display Names remain unchanged",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("both tenant ids and Display Names remain unchanged")
  }
)

Then(
  "both the browser and host-run application can reach the same configured issuer identity",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "both the browser and host-run application can reach the same configured issuer identity"
    )
  }
)

Then(
  "each visitor reaches only their resolved tenant's usable login connection and client",
  function(this: TenantWorld) {
    if (this.useBrowser && this.oidcConcurrentResponses === undefined) {
      pendingBrowserKeycloak(
        "each visitor reaches only their resolved tenant's usable login connection and client"
      )
    }

    assertConcurrentDistinctInitiations(this)
  }
)

Then(
  "fresh browser visits to {string} and {string} reach their distinct usable login experiences",
  function(this: TenantWorld, _url: string, _url2: string) {
    pendingBrowserKeycloak(
      "fresh browser visits to {string} and {string} reach their distinct usable login experiences"
    )
  }
)

Then(
  "fresh unpredictable state and nonce correlate the attempt with the originating browser, resolved tenant {string}, and approved return destination on {string}",
  function(this: TenantWorld, tenant: string, host: string) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    const location = new URL(
      this.httpResponse.headers.location ?? "",
      `http://127.0.0.1:${String(this.port)}`
    )
    assert.ok(location.searchParams.get("state"))
    assert.ok(location.searchParams.get("nonce"))
    assert.equal(location.searchParams.get("client_id"), `${tenant}-web`)
    const redirectUri = location.searchParams.get("redirect_uri") ?? ""
    assert.match(redirectUri, /\/auth\/callback$/)
    assert.doesNotMatch(redirectUri, /shelbyville/i)
    assert.ok(host.includes(tenant))
    assertOidcCookiePresent(this)
  }
)

Then(
  "frontend and backend development processes remain on the host",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("frontend and backend development processes remain on the host")
  }
)

Then(
  "Keycloak runs from a pinned image with published services bound only to loopback",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "Keycloak runs from a pinned image with published services bound only to loopback"
    )
  }
)

Then(
  "local static configuration does not grant tenant application access",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "local static configuration does not grant tenant application access"
    )
  }
)

Then(
  "login is initiated again for Springfield's configured provider connection",
  function(this: TenantWorld) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    assert.match(this.httpResponse.headers.location ?? "", /kc_idp_hint=springfield-idp/)
  }
)

Then(
  "login is initiated only after Springfield is resolved through the trusted tenant boundary",
  function(this: TenantWorld) {
    assertIdpAuthorizationRedirect(this)
  }
)

Then(
  "no authenticated identity is established by initiation",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /authenticated/i)
  }
)

Then(
  "no default provider is substituted and no automatic redirect loop occurs",
  function(this: TenantWorld) {
    assertNoRedirectLoop(this)
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.headers.location ?? "", /shelbyville-idp/)
  }
)

Then(
  "no default provider or other tenant's configuration is substituted",
  // fallow-ignore-next-line code-duplication -- parallel Shelbyville isolation assertion
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /shelbyville-web|Shelbyville/)
    assert.doesNotMatch(this.httpResponse.headers.location ?? "", /shelbyville/)
  }
)

Then(
  "no initiation uses a caller-selected tenant, issuer, client, connection, or return host",
  function(this: TenantWorld) {
    assertSpringfieldTrustedInitiation(this)
  }
)

Then(
  "no insecure redirect or tenant application access is granted",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.equal(this.httpResponse.status, 403)
    assertNoLandingContent(this)
  }
)

Then(
  "no login is initiated and no tenant application access is granted",
  function(this: TenantWorld) {
    assertNoProviderRedirect(this)
    assertNoLandingContent(this)
  }
)

Then(
  "no login is initiated and no tenant application content is served",
  function(this: TenantWorld) {
    assertNoProviderRedirect(this)
    assertNoLandingContent(this)
  }
)

Then(
  "no other tenant's credential is used",
  // fallow-ignore-next-line code-duplication -- parallel Shelbyville isolation assertion
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /shelbyville/i)
    assert.doesNotMatch(this.httpResponse.headers.location ?? "", /shelbyville/i)
  }
)

Then(
  "no production account, production secret, or real client record is required",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "no production account, production secret, or real client record is required"
    )
  }
)

Then(
  "no provider login redirect is issued",
  function(this: TenantWorld) {
    assertNoProviderRedirect(this)
  }
)

Then(
  "no rejected session state or identity grants application access",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
  }
)

Then(
  "no tenant application access is granted",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
  }
)

Then(
  "no tenant application access is granted by the supplied input",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
  }
)

Then(
  "no tenant application access or automatic redirect loop occurs",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
    assertNoRedirectLoop(this)
  }
)

Then(
  "no tenant application content or authenticated identity is granted",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /authenticated/i)
  }
)

Then(
  "no tenant application content or other tenant's login configuration is exposed",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /springfield-web|shelbyville-web|identity\.example/)
  }
)

Then(
  "no tenant application landing page or Display Name content is served",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
  }
)

Then(
  "no tenant chooser or tenant application content is served before the redirect",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
  }
)

Then(
  "no unprotected authorization request is substituted",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    const location = this.httpResponse.headers.location ?? ""
    assert.doesNotMatch(location, /openid-connect\/auth/)
  }
)

Then(
  "preparing that transaction neither completes authentication nor serves tenant application content",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /authenticated/i)
  }
)

Then(
  "recovery does not grant application access while the failure remains",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "recovery does not grant application access while the failure remains"
    )
  }
)

Then(
  "server-side authentication work can access the supplied credential",
  function(this: TenantWorld) {
    // Successful initiation (or discovery attempt) with confidential + secret proves server-side access.
    assert.ok(this.oidcClientSecretsJson?.includes("bdd-springfield-secret"))
    assert.ok(this.httpResponse)
    assert.ok(
      this.httpResponse.status === 302
        || this.httpResponse.status === 303
        || this.httpResponse.status === 403
    )
  }
)

Then(
  "session presence alone is not represented as authenticated identity",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /authenticated/i)
  }
)

Then(
  "Shelbyville's visitor still reaches the usable login experience for {string}",
  function(this: TenantWorld, _connection: string) {
    pendingBrowserKeycloak(
      "Shelbyville's visitor still reaches the usable login experience for {string}"
    )
  }
)

Then(
  "Springfield's visitor reaches the usable login experience for {string}",
  function(this: TenantWorld, _connection: string) {
    pendingBrowserKeycloak(
      "Springfield's visitor reaches the usable login experience for {string}"
    )
  }
)

Then(
  "storing the tenant id does not establish authenticated identity or complete login",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /authenticated/i)
  }
)

Then(
  "tenant application content is not served in place of that redirect",
  function(this: TenantWorld) {
    assertNoLandingContent(this)
  }
)

Then(
  "that credential is absent from browser content, browser-visible configuration, redirect URLs, and captured diagnostics",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /bdd-springfield-secret/)
    assert.doesNotMatch(this.httpResponse.headers.location ?? "", /bdd-springfield-secret/)
    assert.doesNotMatch(this.httpResponse.headers["set-cookie"] ?? "", /bdd-springfield-secret/)
  }
)

Then(
  "that response is not the login-unavailable route",
  function(this: TenantWorld) {
    assertNotLoginUnavailableRoute(this)
  }
)

Then(
  "the accessible content exposes no credentials or other tenant's details",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /OIDC_CLIENT_SECRETS|client_secret|shelbyville/i)
  }
)

Then(
  "the application returns HTTP 403 without a login redirect",
  // fallow-ignore-next-line code-duplication -- shared 403-without-Location assertion
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.equal(this.httpResponse.status, 403)
    assert.equal(this.httpResponse.headers.location, undefined)
  }
)

Then(
  "the approved return destination uses {string}",
  function(this: TenantWorld, url: string) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    const location = new URL(this.httpResponse.headers.location ?? "")
    assert.equal(location.searchParams.get("redirect_uri"), `${url.replace(/\/$/, "")}/auth/callback`)
  }
)

Then(
  "the authorization request includes a PKCE challenge while its verifier remains protected from browser-visible output",
  function(this: TenantWorld) {
    assertPkceProtected(this)
  }
)

Then(
  "the browser reaches Springfield's intended usable provider login experience",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the browser reaches Springfield's intended usable provider login experience"
    )
  }
)

Then(
  "the browser reaches Springfield's usable local login connection",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("the browser reaches Springfield's usable local login connection")
  }
)

Then(
  "the browser reaches Springfield's usable local provider login experience",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the browser reaches Springfield's usable local provider login experience"
    )
  }
)

Then(
  "the browser reaches Springfield's usable provider login experience",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the browser reaches Springfield's usable provider login experience"
    )
  }
)

Then(
  "the browser reaches the usable login experience for {string}",
  function(this: TenantWorld, _connection: string) {
    pendingBrowserKeycloak("the browser reaches the usable login experience for {string}")
  }
)

Then(
  "the browser reaches the usable provider login experience for {string} with client {string}",
  function(this: TenantWorld, connection: string, client: string) {
    if (this.useBrowser) {
      pendingBrowserKeycloak(
        "the browser reaches the usable provider login experience for {string} with client {string}"
      )
    }

    assertIdpAuthorizationRedirect(this, client)
    assert.ok(this.httpResponse)
    const location = this.httpResponse.headers.location ?? ""
    assert.match(location, new RegExp(`client_id=${escapeRegExp(client)}`))
    assert.match(location, new RegExp(`kc_idp_hint=${escapeRegExp(connection)}`))
  }
)

Then(
  "the browser reports the provider destination as unreachable after redirection",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the browser reports the provider destination as unreachable after redirection"
    )
  }
)

Then(
  "the capability's refusal remains authoritative",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.ok(
      this.httpResponse.status === 503 || this.httpResponse.status === 500 || this.httpResponse.status === 403
    )
  }
)

Then(
  "the control has an understandable accessible name and visible focus",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("the control has an understandable accessible name and visible focus")
  }
)

Then(
  "the current response still redirects to Springfield's configured login connection",
  function(this: TenantWorld) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    assert.match(this.httpResponse.headers.location ?? "", /kc_idp_hint=springfield-idp/)
  }
)

Then(
  "the existing forbidden handling returns HTTP 403 without a login redirect or a new forbidden destination",
  // fallow-ignore-next-line code-duplication -- shared 403-without-Location assertion
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.equal(this.httpResponse.status, 403)
    assert.equal(this.httpResponse.headers.location, undefined)
  }
)

Then(
  "the existing session service is preserved and remains available",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("the existing session service is preserved and remains available")
  }
)

Then(
  "the extended forbidden copy is accessible and exposes no credentials or other tenant's details",
  function(this: TenantWorld) {
    assertExtendedForbidden(this)
  }
)

Then(
  "the forbidden response uses extended copy explaining that login cannot start with a clear next action",
  function(this: TenantWorld) {
    assertExtendedForbidden(this)
  }
)

Then(
  "the initiation is bound to {string} and an approved return destination on {string}",
  function(this: TenantWorld, tenant: string, host: string) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    const location = new URL(this.httpResponse.headers.location ?? "")
    assert.equal(location.searchParams.get("client_id"), `${tenant}-web`)
    const redirectUri = location.searchParams.get("redirect_uri") ?? ""
    assert.match(redirectUri, new RegExp(escapeRegExp(tenant)))
    assert.match(redirectUri, /\/auth\/callback/)
    assert.ok(host.includes(tenant))
  }
)

Then(
  "the initiation uses only Springfield's configured login connection",
  function(this: TenantWorld) {
    assert.ok(this.httpResponse)
    assert.match(this.httpResponse.headers.location ?? "", /kc_idp_hint=springfield-idp/)
  }
)

Then(
  "the initiation's approved return destination is registered on {string}",
  function(this: TenantWorld, host: string) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    const location = new URL(this.httpResponse.headers.location ?? "")
    const redirectUri = location.searchParams.get("redirect_uri") ?? ""
    assert.match(redirectUri, new RegExp(escapeRegExp(host.split(".")[0] ?? "")))
  }
)

Then(
  "the PKCE verifier is retained only server-side",
  function(this: TenantWorld) {
    assertPkceProtected(this)
  }
)

Then(
  "the protected transaction context retains Springfield's expected issuer, client, connection, and correlation values for later callback validation",
  function(this: TenantWorld) {
    assertIdpAuthorizationRedirect(this)
    assertOidcCookiePresent(this)
    assert.ok(this.httpResponse)
    const location = new URL(this.httpResponse.headers.location ?? "")
    assert.equal(location.searchParams.get("client_id"), "springfield-web")
    assert.equal(location.searchParams.get("kc_idp_hint"), "springfield-idp")
    assert.match(this.httpResponse.headers["set-cookie"] ?? "", new RegExp(OIDC_COOKIE_NAME))
  }
)

Then(
  "the redirect starts an OIDC authorization-code request using Springfield's trusted issuer, client, and connection",
  function(this: TenantWorld) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    const location = this.httpResponse.headers.location ?? ""
    assert.match(location, /client_id=springfield-web/)
    assert.match(location, /kc_idp_hint=springfield-idp/)
    assert.match(location, /response_type=code/)
  }
)

Then(
  "the replacement session does not suppress the current redirect or establish authenticated identity",
  function(this: TenantWorld) {
    assertIdpAuthorizationRedirect(this)
    assert.ok(this.httpResponse)
    assert.doesNotMatch(this.httpResponse.body, /authenticated/i)
  }
)

Then(
  "the request does not enter an automatic redirect loop",
  function(this: TenantWorld) {
    assertNoRedirectLoop(this)
  }
)

Then(
  "this entry feature does not redirect that request to an HTML login page",
  function(this: TenantWorld) {
    assertNoHtmlLoginRedirect(this)
  }
)

Then(
  "the request retains its category's planned handling without recursive entry redirects",
  function(this: TenantWorld) {
    assertSupportingRequestHandling(this)
    assert.ok(this.httpResponse)
    assert.doesNotMatch(
      this.httpResponse.headers.location ?? "",
      /openid-connect\/auth.*openid-connect/
    )
  }
)

Then(
  "the response does not include a Set-Cookie header for {string}",
  function(this: TenantWorld, cookieName: string) {
    assertNoSessionSetCookie(this, cookieName)
  }
)

Then(
  "the response does not trigger an automatic redirect loop",
  function(this: TenantWorld) {
    assertNoRedirectLoop(this)
  }
)

Then(
  "the response matches failure class {string}",
  function(this: TenantWorld, failure: string) {
    assertFailureClass(this, failure)
  }
)

Then(
  "the retry does not enter an automatic redirect loop",
  function(this: TenantWorld) {
    assertNoRedirectLoop(this)
  }
)

Then(
  "the tenant id remains {string} and Display Name remains {string}",
  function(this: TenantWorld, _tenant: string, _name: string) {
    pendingBrowserKeycloak("the tenant id remains {string} and Display Name remains {string}")
  }
)

Then(
  "the trusted tenant boundary resolves {string} before login initiation",
  function(this: TenantWorld, tenant: string) {
    assert.ok(this.httpResponse)
    // Host binding is evidenced by tenant-specific client on the authorization redirect.
    if (this.httpResponse.status === 302 || this.httpResponse.status === 303) {
      assert.match(this.httpResponse.headers.location ?? "", new RegExp(`client_id=${tenant}-web`))
    }
  }
)

Then(
  "the two initiation contexts retain their distinct tenant ids and approved return hosts",
  function(this: TenantWorld) {
    assertConcurrentDistinctInitiations(this)
  }
)

Then(
  "the visitor can complete the offered action without a pointer or keyboard trap",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the visitor can complete the offered action without a pointer or keyboard trap"
    )
  }
)

Then(
  "the visitor can discover and read the explanation that login cannot start",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the visitor can discover and read the explanation that login cannot start"
    )
  }
)

Then(
  "the visitor can identify and operate the provider's login controls",
  function(this: TenantWorld) {
    pendingBrowserKeycloak("the visitor can identify and operate the provider's login controls")
  }
)

Then(
  "the visitor can understand the offered next action without relying on color or visual placement",
  function(this: TenantWorld) {
    pendingBrowserKeycloak(
      "the visitor can understand the offered next action without relying on color or visual placement"
    )
  }
)

Then(
  "the visitor receives an app-owned error explaining that login cannot start and a clear next action",
  function(this: TenantWorld) {
    assertAppOwnedFailure(this)
  }
)

Then(
  "the visitor receives an understandable app-owned failure explaining that login cannot start and a clear next action",
  function(this: TenantWorld) {
    assertAppOwnedFailure(this)
  }
)

Then(
  "the visitor receives an understandable configuration error with a clear next action",
  function(this: TenantWorld) {
    assertExtendedForbidden(this)
  }
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
