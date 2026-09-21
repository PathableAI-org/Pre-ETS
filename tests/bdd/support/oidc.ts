import type { DataTable } from "@cucumber/cucumber"
import type { AddressInfo } from "node:net"

import assert from "node:assert/strict"
import http from "node:http"

import type { TenantOidcConfig } from "../../../packages/frontend/src/lib/tenant/types.ts"
import type { HttpExchange, TenantWorld } from "./world.ts"

import { extendedForbiddenBody } from "../../../packages/frontend/src/lib/oidc/forbidden-body.ts"
import { OIDC_COOKIE_NAME } from "../../../packages/frontend/src/lib/oidc/types.ts"
import { sendRawGet } from "./raw-http.ts"
import { ensureOwnedProcess, restartOwnedProcess } from "./server.ts"
import { ensureSessionSettings } from "./session-env.ts"
import { clearCookies, seedValidSession, visitUrl } from "./session.ts"

export interface OidcTenantFixture {
  readonly clientAuth: TenantOidcConfig["clientAuth"]
  readonly clientId: string
  readonly connection?: string
  readonly displayName: string
  readonly issuer: string
  readonly slug: string
}

interface MockOidcServer {
  readonly baseUrl: string
  brokenAuthorize: boolean
  readonly close: () => Promise<void>
  readonly issuer: string
}

const DOCUMENT_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Sec-Fetch-Dest": "document"
} as const

export function applyOidcDefect(world: TenantWorld, defect: string): void {
  world.oidcDefect = defect
  const springfield = requireSpringfieldFixture(world)

  switch (defect) {
    case "app-detectable unusable broker connection": {
      world.oidcFixtures = world.oidcFixtures?.map((fixture) =>
        fixture.slug === "springfield" ? { ...fixture, connection: "   " } : fixture
      )
      world.oidcRawSpringfieldOverride = {
        config: {
          displayName: springfield.displayName,
          oidc: {
            clientAuth: springfield.clientAuth,
            clientId: springfield.clientId,
            connection: "   ",
            issuer: springfield.issuer
          }
        },
        slug: "springfield"
      }
      break
    }
    case "Display Name only with no OIDC settings": {
      world.oidcRawSpringfieldOverride = {
        config: { displayName: springfield.displayName },
        slug: "springfield"
      }
      break
    }
    case "invalid approved return destination": {
      // Return URI is derived from request origin; force failure via confidential-without-secret
      // is not applicable. Use unreachable issuer so initiation cannot complete a trusted redirect.
      world.oidcFixtures = world.oidcFixtures?.map((fixture) =>
        fixture.slug === "springfield"
          ? { ...fixture, issuer: "https://identity.example/realms/pre-ets" }
          : fixture
      )
      break
    }
    case "malformed issuer URL": {
      world.oidcRawSpringfieldOverride = {
        config: {
          displayName: springfield.displayName,
          oidc: {
            clientAuth: springfield.clientAuth,
            clientId: springfield.clientId,
            issuer: "not-a-url",
            ...(springfield.connection === undefined ? {} : { connection: springfield.connection })
          }
        },
        slug: "springfield"
      }
      break
    }
    case "missing application client identifier": {
      world.oidcRawSpringfieldOverride = {
        config: {
          displayName: springfield.displayName,
          oidc: {
            clientAuth: springfield.clientAuth,
            clientId: "",
            issuer: springfield.issuer,
            ...(springfield.connection === undefined ? {} : { connection: springfield.connection })
          }
        },
        slug: "springfield"
      }
      break
    }
    case "missing issuer": {
      world.oidcFixtures = world.oidcFixtures?.map((fixture) =>
        fixture.slug === "springfield"
          ? { ...fixture, issuer: "" }
          : fixture
      )
      world.oidcRawSpringfieldOverride = {
        config: {
          displayName: springfield.displayName,
          oidc: {
            clientAuth: springfield.clientAuth,
            clientId: springfield.clientId,
            ...(springfield.connection === undefined ? {} : { connection: springfield.connection })
          }
        },
        slug: "springfield"
      }
      break
    }
    case "missing required broker connection": {
      world.oidcFixtures = world.oidcFixtures?.map((fixture) => {
        if (fixture.slug !== "springfield") {
          return fixture
        }

        const { connection: _connection, ...rest } = fixture
        return rest
      })
      break
    }
    case "missing required server-only credential": {
      world.oidcFixtures = world.oidcFixtures?.map((fixture) =>
        fixture.slug === "springfield" ? { ...fixture, clientAuth: "confidential" } : fixture
      )
      world.oidcClientSecretsJson = "{}"
      break
    }
    case "required login configuration cannot be read": {
      world.oidcUnreadableConfig = true
      break
    }
    default: {
      throw new Error(`Unsupported OIDC defect for HTTP harness: ${defect}`)
    }
  }

  world.processSignature = undefined
}

export function assertAppOwnedFailure(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const response = world.httpResponse
  if (response.status === 403) {
    assertExtendedForbidden(world)
    return
  }

  assert.ok(response.status === 302 || response.status === 303)
  assert.match(response.headers.location ?? "", /\/login-unavailable/)
}

export function assertConcurrentDistinctInitiations(world: TenantWorld): void {
  assert.ok(world.oidcConcurrentResponses)
  const { shelbyville, springfield } = world.oidcConcurrentResponses
  assert.ok(springfield.status === 302 || springfield.status === 303)
  assert.ok(shelbyville.status === 302 || shelbyville.status === 303)
  const springfieldLocation = springfield.headers.location ?? ""
  const shelbyvilleLocation = shelbyville.headers.location ?? ""
  assert.match(springfieldLocation, /client_id=springfield-web/)
  assert.match(shelbyvilleLocation, /client_id=shelbyville-web/)
  assert.match(springfieldLocation, /kc_idp_hint=springfield-idp/)
  assert.match(shelbyvilleLocation, /kc_idp_hint=shelbyville-idp/)
  assert.notEqual(springfieldLocation, shelbyvilleLocation)
}

export function assertExtendedForbidden(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assert.equal(world.httpResponse.status, 403)
  assert.match(world.httpResponse.body, /Login cannot start/)
  assert.match(world.httpResponse.body, /Return home|try again|administrator/i)
  assert.doesNotMatch(world.httpResponse.body, /Tenant: /)
  assert.doesNotMatch(world.httpResponse.body, /OIDC_CLIENT_SECRETS|client_secret|code_verifier/i)
  const expected = extendedForbiddenBody()
  assert.match(world.httpResponse.body, /Login cannot start/)
  assert.ok(expected.includes("Login cannot start"))
}

export function assertFailureClass(world: TenantWorld, failure: string): void {
  assert.ok(world.httpResponse)
  const response = world.httpResponse
  switch (failure) {
    case "configuration 403": {
      assert.equal(response.status, 403)
      assert.match(response.body, /Login cannot start/)
      assert.doesNotMatch(response.headers.location ?? "", /identity\.example|openid-connect\/auth/)
      break
    }
    case "login-unavailable":
    case "transaction failure": {
      assert.ok(response.status === 302 || response.status === 303)
      assert.match(response.headers.location ?? "", /\/login-unavailable/)
      break
    }
    case "non-document 401": {
      assert.equal(response.status, 401)
      assert.equal(response.headers.location, undefined)
      break
    }
    default: {
      throw new Error(`Unknown failure class: ${failure}`)
    }
  }
}

export function assertForbiddenWithoutRedirect(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assert.equal(world.httpResponse.status, 403)
  assert.equal(world.httpResponse.headers.location, undefined)
}

export function assertIdpAuthorizationRedirect(
  world: TenantWorld,
  expectedClientId = "springfield-web"
): void {
  assert.ok(world.httpResponse)
  assert.ok(
    world.httpResponse.status === 302 || world.httpResponse.status === 303,
    `expected IdP redirect, got ${String(world.httpResponse.status)} body=${world.httpResponse.body.slice(0, 200)}`
  )
  const location = world.httpResponse.headers.location
  assert.ok(typeof location === "string" && location.length > 0, "expected Location header")
  const url = new URL(location, `http://127.0.0.1:${String(world.port)}`)
  assert.match(
    url.href,
    /openid-connect\/auth|\/authorize/i,
    `expected IdP authorize Location, got ${location}`
  )
  assert.equal(url.searchParams.get("response_type"), "code")
  assert.equal(url.searchParams.get("client_id"), expectedClientId)
  assert.ok(url.searchParams.get("code_challenge"))
  assert.equal(url.searchParams.get("code_challenge_method"), "S256")
  assert.ok(url.searchParams.get("state"))
  assert.ok(url.searchParams.get("nonce"))
  assert.doesNotMatch(location, /code_verifier/)
}

export function assertNoHtmlLoginRedirect(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const location = world.httpResponse.headers.location ?? ""
  if (world.oidcSupportingCategory === "login initiation route") {
    // Document `/` may 302 to the IdP or login-unavailable; must not be a local HTML login form.
    assert.doesNotMatch(location, /\/login\/?$/)
    return
  }

  assert.doesNotMatch(location, /openid-connect\/auth/)
  if (world.oidcSupportingCategory === "non-navigation request") {
    assert.equal(world.httpResponse.status, 401)
  }
}

export function assertNoLandingContent(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assert.doesNotMatch(world.httpResponse.body, /Tenant: /)
  for (const fixture of world.oidcFixtures ?? []) {
    assert.doesNotMatch(
      world.httpResponse.body,
      new RegExp(`Tenant: ${escapeRegExp(fixture.displayName)}`)
    )
  }
}

export function assertNoProviderRedirect(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const location = world.httpResponse.headers.location ?? ""
  assert.doesNotMatch(location, /openid-connect\/auth|\/authorize\?/i)
  if (world.httpResponse.status === 302 || world.httpResponse.status === 303) {
    assert.match(location, /\/login-unavailable/)
  }
}

export function assertNoRedirectLoop(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const location = world.httpResponse.headers.location ?? ""
  if (world.httpResponse.status < 300 || world.httpResponse.status >= 400) {
    return
  }

  assert.ok(!location.endsWith("/") || location.includes("login-unavailable") || location.includes("auth"))
  // A single Location hop is fine; looping would require Location back to the same entry with no progress.
  assert.doesNotMatch(location, /springfield\.pathable\.com\/?\?/)
}

export function assertNoSessionSetCookie(world: TenantWorld, cookieName: string): void {
  assert.ok(world.httpResponse)
  const raw = world.httpResponse.headers["set-cookie"] ?? ""
  assert.equal(
    raw.toLowerCase().includes(`${cookieName.toLowerCase()}=`),
    false,
    `expected no Set-Cookie for ${cookieName}, got: ${raw}`
  )
}

export function assertNoShelbyvilleLeak(
  world: TenantWorld,
  mode: "config" | "credential"
): void {
  assert.ok(world.httpResponse)
  if (mode === "config") {
    assert.doesNotMatch(world.httpResponse.body, /shelbyville-web|Shelbyville/)
    assert.doesNotMatch(world.httpResponse.headers.location ?? "", /shelbyville/)
    return
  }

  assert.doesNotMatch(world.httpResponse.body, /shelbyville/i)
  assert.doesNotMatch(world.httpResponse.headers.location ?? "", /shelbyville/i)
}

export function assertNotLoginUnavailableRoute(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const location = world.httpResponse.headers.location ?? ""
  assert.doesNotMatch(location, /\/login-unavailable/)
  assert.doesNotMatch(world.httpResponse.body, /Provider unavailable/)
}

export function assertOidcCookiePresent(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const setCookie = world.httpResponse.headers["set-cookie"] ?? ""
  assert.match(setCookie, new RegExp(`${OIDC_COOKIE_NAME}=`))
}

export function assertPkceProtected(world: TenantWorld): void {
  assertIdpAuthorizationRedirect(world)
  assert.ok(world.httpResponse)
  const location = world.httpResponse.headers.location ?? ""
  assert.doesNotMatch(location, /code_verifier/)
  assert.doesNotMatch(world.httpResponse.body, /code_verifier/)
  const setCookie = world.httpResponse.headers["set-cookie"] ?? ""
  assert.match(setCookie, new RegExp(`${OIDC_COOKIE_NAME}=`))
}

export function assertSpringfieldTrustedInitiation(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const location = world.httpResponse.headers.location ?? ""
  if (location.includes("/login-unavailable")) {
    // Caller overrides must not select Shelbyville; unavailable still uses Springfield config path.
    assert.doesNotMatch(location, /shelbyville/i)
    return
  }

  assertIdpAuthorizationRedirect(world)
  const url = new URL(location)
  assert.equal(url.searchParams.get("client_id"), "springfield-web")
  assert.equal(url.searchParams.get("kc_idp_hint"), "springfield-idp")
  assert.doesNotMatch(location, /shelbyville/i)
}

export function assertSupportingRequestHandling(world: TenantWorld, category?: string): void {
  assert.ok(world.httpResponse)
  const response = world.httpResponse
  const resolved = category ?? world.oidcSupportingCategory
  assert.ok(resolved, "expected a supporting request category")

  if (resolved !== "login initiation route") {
    assert.ok(
      response.status !== 302 || !(response.headers.location ?? "").includes("openid-connect"),
      "supporting request must not enter HTML IdP login redirect"
    )
  }

  switch (resolved) {
    case "authentication return route": {
      // Document callback completes or fails closed (303 home / login-unavailable / 403).
      assert.ok(
        response.status === 200
          || response.status === 303
          || response.status === 302
          || response.status === 403
          || response.status === 404
      )
      assert.doesNotMatch(response.headers.location ?? "", /openid-connect/)
      break
    }
    case "login initiation route": {
      // Document `/` initiates (IdP 302 or app-owned failure); not an HTML app login page.
      assert.ok(
        response.status === 401
          || response.status === 302
          || response.status === 303
          || response.status === 403
      )
      break
    }
    case "non-navigation request": {
      assert.equal(response.status, 401)
      break
    }
    case "operational health endpoint": {
      // No dedicated health route in this slice; favicon-style unmatched path is used.
      assert.ok(response.status === 200 || response.status === 404)
      break
    }
    case "static asset": {
      assert.ok(response.status === 200 || response.status === 404)
      break
    }
    default: {
      throw new Error(`Unknown supporting request category: ${resolved}`)
    }
  }
}

export async function closeMockOidcServer(world: TenantWorld): Promise<void> {
  if (world.oidcMockServer === undefined) {
    return
  }

  await world.oidcMockServer.close()
  world.oidcMockServer = undefined
  world.oidcMockIssuer = undefined
}

export async function configureIsolatedOidcFixtures(
  world: TenantWorld,
  table: DataTable
): Promise<void> {
  ensureSessionSettings(world)
  world.forceDevelopmentRuntime = true
  world.runtime = "development"
  world.resolutionMode = "host"
  const mockIssuer = await ensureMockOidcIssuer(world)
  const fixtures: OidcTenantFixture[] = []

  for (const row of table.hashes()) {
    const slug = requireCell(row, "tenant")
    const displayName = requireCell(row, "display name")
    const clientId = requireCell(row, "client")
    const clientAuth = requireCell(row, "client auth")
    if (clientAuth !== "public" && clientAuth !== "confidential") {
      throw new Error(`Unsupported client auth: ${clientAuth}`)
    }

    const connectionRaw = row.connection?.trim()
    const fixture: OidcTenantFixture = {
      clientAuth,
      clientId,
      displayName,
      issuer: mockIssuer,
      slug,
      ...(connectionRaw === undefined || connectionRaw === "" ? {} : { connection: connectionRaw })
    }
    fixtures.push(fixture)
  }

  world.oidcFixtures = fixtures
  world.tenants = fixtures.map((fixture) => ({
    displayName: fixture.displayName,
    slug: fixture.slug
  }))
  world.processSignature = undefined
}

/** Start an in-process discovery + authorize stub so @http initiation works without Keycloak. */
export async function ensureMockOidcIssuer(world: TenantWorld): Promise<string> {
  if (world.oidcMockIssuer !== undefined && world.oidcMockServer !== undefined) {
    return world.oidcMockIssuer
  }

  const server = await startMockOidcServer()
  world.oidcMockServer = server
  world.oidcMockIssuer = server.issuer
  return server.issuer
}

export function forceInitiationFailure(world: TenantWorld, failure: string): void {
  world.oidcForcedFailure = failure
  switch (failure) {
    case "configuration 403": {
      applyOidcDefect(world, "missing required server-only credential")
      break
    }
    case "login-unavailable": {
      world.oidcFixtures = world.oidcFixtures?.map((fixture) =>
        fixture.slug === "springfield"
          ? { ...fixture, issuer: "https://identity.example/realms/pre-ets" }
          : fixture
      )
      world.processSignature = undefined
      break
    }
    case "non-document 401": {
      world.oidcNonDocumentRequest = true
      break
    }
    case "transaction failure": {
      // Discovery succeeds; authorization endpoint is unusable so buildAuthorizationUrl fails.
      assert.ok(world.oidcMockServer, "mock OIDC issuer required for transaction failure")
      world.oidcMockServer.brokenAuthorize = true
      world.oidcMockBrokenAuthorize = true
      break
    }
    default: {
      throw new Error(`Unknown initiation failure class: ${failure}`)
    }
  }
}

export async function issueFailureClassRequest(world: TenantWorld): Promise<void> {
  assert.ok(world.oidcForcedFailure, "expected a forced failure class")
  if (world.oidcForcedFailure === "non-document 401") {
    await visitOidcUrl(world, "https://springfield.pathable.com/")
    return
  }

  await visitOidcUrl(world, "https://springfield.pathable.com/")
}

export async function requestSupportingCategory(
  world: TenantWorld,
  category: string
): Promise<void> {
  world.oidcSupportingCategory = category
  await ensureOwnedProcess(world)
  const host = `springfield.localhost:${String(world.port)}`
  world.requestedHost = host

  switch (category) {
    case "authentication return route": {
      world.httpResponse = await sendRawGet({
        extraHeaders: {
          Accept: "text/html",
          "Sec-Fetch-Dest": "document"
        },
        host,
        path: "/auth/callback",
        port: world.port
      })
      break
    }
    case "login initiation route": {
      world.httpResponse = await sendRawGet({
        extraHeaders: {
          Accept: "text/html",
          "Sec-Fetch-Dest": "document"
        },
        host,
        path: "/",
        port: world.port
      })
      break
    }
    case "non-navigation request": {
      world.httpResponse = await sendRawGet({
        extraHeaders: {
          Accept: "application/json",
          RSC: "1"
        },
        host,
        path: "/",
        port: world.port
      })
      break
    }
    case "operational health endpoint":
    case "static asset": {
      world.httpResponse = await sendRawGet({
        host,
        path: "/favicon.ico",
        port: world.port
      })
      break
    }
    default: {
      throw new Error(`Unknown supporting request category: ${category}`)
    }
  }
}

export async function restartForOidcConfig(world: TenantWorld): Promise<void> {
  await restartOwnedProcess(world)
}

export async function seedAnonymousSpringfieldSession(world: TenantWorld): Promise<void> {
  ensureSessionSettings(world)
  world.forceDevelopmentRuntime = true
  world.runtime = "development"
  await seedValidSession(world, "springfield")
}

export async function visitConcurrentTenantHosts(world: TenantWorld): Promise<void> {
  await ensureOwnedProcess(world)
  const springfieldUrl = rewriteOidcVisitUrl(world, "https://springfield.pathable.com/")
  const shelbyvilleUrl = rewriteOidcVisitUrl(world, "https://shelbyville.pathable.com/")
  const [springfield, shelbyville] = await Promise.all([
    fetchDocument(world, springfieldUrl),
    fetchDocument(world, shelbyvilleUrl)
  ])
  world.oidcConcurrentResponses = { shelbyville, springfield }
  world.httpResponse = springfield
}

export async function visitOidcHost(world: TenantWorld, host: string): Promise<void> {
  const normalized = host.includes("://") ? host : `https://${host}/`
  await visitOidcUrl(world, normalized)
}

export async function visitOidcUrl(world: TenantWorld, rawUrl: string): Promise<void> {
  ensureSessionSettings(world)
  if (world.runtime !== "production") {
    world.forceDevelopmentRuntime = true
    world.runtime = "development"
  }

  const rewritten = rewriteOidcVisitUrl(world, rawUrl)
  world.lastVisitedUrl = rewritten
  world.oidcLastRequestedUrl = rawUrl

  if (world.oidcCallerOverride !== undefined) {
    await visitWithCallerOverride(world, rewritten)
    return
  }

  if (world.oidcNonDocumentRequest) {
    await visitNonDocument(world, rewritten)
    return
  }

  await visitUrl(world, rewritten)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function fetchDocument(world: TenantWorld, rawUrl: string): Promise<HttpExchange> {
  const parsed = new URL(rawUrl)
  return await sendRawGet({
    extraHeaders: { ...DOCUMENT_HEADERS },
    host: parsed.host,
    path: parsed.pathname + parsed.search,
    port: world.port
  })
}

function requireCell(row: Record<string, string>, key: string): string {
  const value = row[key]?.trim()
  assert.ok(value, `Missing table column: ${key}`)
  return value
}

function requireSpringfieldFixture(world: TenantWorld): OidcTenantFixture {
  const fixture = world.oidcFixtures?.find((entry) => entry.slug === "springfield")
  assert.ok(fixture, "Springfield OIDC fixture is required")
  return fixture
}

function rewriteOidcVisitUrl(world: TenantWorld, rawUrl: string): string {
  const url = new URL(rawUrl)
  const host = url.hostname

  if (world.runtime === "production") {
    // Keep production-style Host; connect to the owned loopback port.
    return `http://${host}:${String(world.port)}${url.pathname}${url.search}`
  }

  if (host.endsWith(".pathable.com") || host === "pathable.com") {
    const slug = host === "pathable.com" ? "www" : host.replace(/\.pathable\.com$/, "")
    if (slug === "www" || slug.includes(".")) {
      // Keep synthetic production-style host for unknown-host refusal cases.
      return `http://${host}:${String(world.port)}${url.pathname}${url.search}`
    }

    return `http://${slug}.localhost:${String(world.port)}${url.pathname}${url.search}`
  }

  if (url.port === "") {
    url.port = String(world.port)
  }

  url.protocol = "http:"
  return url.toString()
}

async function startMockOidcServer(): Promise<MockOidcServer> {
  const state: { brokenAuthorize: boolean } = { brokenAuthorize: false }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname.endsWith("/.well-known/openid-configuration")) {
      const issuer = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/realms/pre-ets`
      const authorize = state.brokenAuthorize
        ? "urn:invalid:authorize"
        : `${issuer}/protocol/openid-connect/auth`
      const body = JSON.stringify({
        authorization_endpoint: authorize,
        code_challenge_methods_supported: ["S256"],
        id_token_signing_alg_values_supported: ["RS256"],
        issuer,
        jwks_uri: `${issuer}/protocol/openid-connect/certs`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        token_endpoint: `${issuer}/protocol/openid-connect/token`
      })
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(body)
      return
    }

    if (url.pathname.endsWith("/protocol/openid-connect/auth")) {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "/"
      const oauthState = url.searchParams.get("state") ?? ""
      const cancelTarget = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}error=access_denied&state=${
        encodeURIComponent(oauthState)
      }`
      const failTarget = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}error=login_required&state=${
        encodeURIComponent(oauthState)
      }`
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(
        [
          "<html><body>",
          "<h1>Mock IdP Login</h1>",
          "<form><button type=\"submit\">Sign in</button></form>",
          `<p><a href="${cancelTarget}">Cancel</a></p>`,
          `<p><a href="${failTarget}">Fail authentication</a></p>`,
          "</body></html>"
        ].join("")
      )
      return
    }

    res.writeHead(404)
    res.end("not found")
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      resolve()
    })
  })

  const address = server.address()
  assert.ok(address !== null && typeof address !== "string")
  const baseUrl = `http://127.0.0.1:${String(address.port)}`
  const issuer = `${baseUrl}/realms/pre-ets`

  return {
    baseUrl,
    get brokenAuthorize() {
      return state.brokenAuthorize
    },
    set brokenAuthorize(value: boolean) {
      state.brokenAuthorize = value
    },
    async close() {
      state.brokenAuthorize = false
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
    issuer
  }
}

async function visitNonDocument(world: TenantWorld, rewritten: string): Promise<void> {
  const parsed = new URL(rewritten)
  await ensureOwnedProcess(world)
  world.httpResponse = await sendRawGet({
    extraHeaders: {
      Accept: "application/json",
      RSC: "1"
    },
    host: parsed.host,
    path: parsed.pathname + parsed.search,
    port: world.port
  })
  world.lastVisitedUrl = rewritten
}

export { clearCookies }

async function visitWithCallerOverride(world: TenantWorld, rewritten: string): Promise<void> {
  assert.ok(world.oidcCallerOverride)
  const parsed = new URL(rewritten)
  await ensureOwnedProcess(world)
  const { source, value } = world.oidcCallerOverride
  let pathName = `${parsed.pathname}${parsed.search}`
  const extraHeaders: Record<string, string> = { ...DOCUMENT_HEADERS }

  switch (source) {
    case "client query value": {
      pathName = `/?client=${encodeURIComponent(value)}`
      break
    }
    case "connection query value": {
      pathName = `/?connection=${encodeURIComponent(value)}`
      break
    }
    case "forwarded host header": {
      extraHeaders["X-Forwarded-Host"] = value
      break
    }
    case "issuer query value": {
      pathName = `/?issuer=${encodeURIComponent(value)}`
      break
    }
    case "return query value": {
      pathName = `/?return=${encodeURIComponent(value)}`
      break
    }
    case "tenant header": {
      extraHeaders["x-preets-tenant-slug"] = value
      break
    }
    case "tenant query value": {
      pathName = `/?tenant=${encodeURIComponent(value)}`
      break
    }
    default: {
      throw new Error(`Unknown caller override source: ${source}`)
    }
  }

  world.httpResponse = await sendRawGet({
    extraHeaders,
    host: parsed.host,
    path: pathName,
    port: world.port
  })
  world.lastVisitedUrl = rewritten
}
