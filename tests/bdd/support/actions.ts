import type { Locator } from "playwright"

import assert from "node:assert/strict"

import type { ContractFailureReason, ContractResult, HttpExchange, TenantWorld } from "./world.ts"

import { bindHost } from "../../../packages/frontend/src/lib/tenant/host.ts"
import {
  createMismatchedTenantSource,
  createStaticTenantSource,
  createThrowingTenantSource,
  type TenantSource
} from "../../../packages/frontend/src/lib/tenant/source.ts"
import {
  LOCAL_CONFIG_ERROR,
  parseTenantRecord,
  selectTenantMode,
  type TenantConfig,
  type TenantRecord
} from "../../../packages/frontend/src/lib/tenant/types.ts"
import { invalidEnvShape, syntheticTenantConfig, syntheticTenantRecord } from "./fixtures.ts"
import { sendRawGet } from "./raw-http.ts"
import { ensureBrowser, ensureOwnedProcess, restartOwnedProcess } from "./server.ts"

const CACHE_CONTROL = "private, no-store"

export async function assertAccessibleLiteralName(world: TenantWorld, name: string): Promise<void> {
  assert.ok(world.page)
  const locator = world.page.getByText(`Tenant: ${name}`)
  assert.equal(await locator.textContent(), `Tenant: ${name}`)
  const html = await locator.innerHTML()
  assert.equal(html.includes("<script"), false)
  assert.equal(html.includes("<Demo"), false)
}

export function assertDisplayedName(world: TenantWorld, name: string): void {
  assert.ok(world.httpResponse)
  const body = decodeEntities(world.httpResponse.body)
  assert.match(body, new RegExp(`Tenant: ${escapeRegExp(name)}`))
  assertCacheControl(world.httpResponse)
}

export function assertForbiddenPage(response: HttpExchange): void {
  const body = decodeEntities(response.body)
  assertNoTenantRedirect(response)
  assert.doesNotMatch(body, /Tenant: /)
  assert.ok(
    response.status === 403 || response.status === 200,
    `expected 403 or forbidden HTML, received ${String(response.status)}`
  )
  if (response.status === 200) {
    assert.match(body, /Access denied\./)
  }
}

export async function assertHeading(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const heading = world.page.getByRole("heading", { level: 1 })
  assert.ok(((await heading.textContent()) ?? "").trim().length > 0)
}

export function assertIdentifiedTenant(world: TenantWorld, slug: string, name: string): void {
  const context = requireContext(world.contractResult)
  assert.equal(context.slug, slug)
  assert.equal(context.config.displayName, name)
}

/** Assert the inactivity-ended dialog exposes name, description, and Log in again. */
export async function assertInactivityModalSemantics(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const dialog = world.page.getByRole("dialog", {
    name: /session ended due to inactivity/i
  })
  assert.equal(await dialog.count(), 1)
  assert.ok(await world.page.getByText(/ended because of inactivity/i).count() >= 1)
  assert.equal(await world.page.getByRole("button", { name: "Log in again" }).count(), 1)
}

export async function assertKeyboardTarget(world: TenantWorld, buttonName: string): Promise<void> {
  assert.ok(world.page)
  const button = world.page.getByRole("button", { name: buttonName })
  assert.equal(await button.count(), 1)
  if (!(await isFocused(button))) {
    await navigateWithKeyboard(world)
  }

  assert.ok(await isFocused(button))
}

export function assertLocalConfigError(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  const body = decodeEntities(world.httpResponse.body)
  assert.match(body, /valid/i)
  assert.match(body, /TENANT_LOCAL_CONFIG_JSON/)
  assert.match(body, /restart/i)
  assert.match(body, new RegExp(escapeRegExp(LOCAL_CONFIG_ERROR)))
}

export function assertNoSuccessfulContext(world: TenantWorld): void {
  if (world.contractResult !== undefined) {
    assert.equal(world.contractResult.ok, false)
    return
  }

  assert.ok(world.httpResponse)
  assert.doesNotMatch(decodeEntities(world.httpResponse.body), /Tenant: /)
}

export function assertNotDisplayedName(world: TenantWorld, name: string): void {
  assert.ok(world.httpResponse)
  assert.doesNotMatch(decodeEntities(world.httpResponse.body), new RegExp(`Tenant: ${escapeRegExp(name)}`))
}

export function assertRefused(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assertCacheControl(world.httpResponse)
  assertForbiddenPage(world.httpResponse)
  if (world.prefetchResponse !== undefined) {
    assert.doesNotMatch(decodeEntities(world.prefetchResponse.body), /Tenant: /)
    if (isSamePathRscRedirect(world.prefetchResponse)) {
      return
    }

    assertNoTenantRedirect(world.prefetchResponse)
    assert.ok(
      world.prefetchResponse.status === 403 || world.prefetchResponse.status === 200,
      `expected 403 or forbidden prefetch, received ${String(world.prefetchResponse.status)}`
    )
  }
}

export function assertServerError(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assert.equal(world.httpResponse.status, 500)
  assertNoTenantRedirect(world.httpResponse)
  assertCacheControl(world.httpResponse)
}

export function assertVisitOutcome(world: TenantWorld, outcome: string): void {
  if (outcome.startsWith("displays tenant Display Name ")) {
    const name = outcome.slice("displays tenant Display Name ".length)
    assertDisplayedName(world, name)
    return
  }

  if (outcome === "HTTP 403 refusal without a redirect") {
    assertRefused(world)
    return
  }

  throw new Error(`Unknown visit outcome: ${outcome}`)
}

export function effectiveMode(world: TenantWorld): "host" | "static" {
  const selection = selectTenantMode(
    world.unsupportedMode ?? world.resolutionMode,
    world.runtime === "production"
  )
  if ("diagnostic" in selection) {
    world.modeDiagnostic = selection.diagnostic
  }

  return selection.mode
}

export function hostSuffix(world: TenantWorld): "localhost" | "pathable.com" {
  return world.runtime === "production" ? "pathable.com" : "localhost"
}

export function injectedSource(world: TenantWorld): TenantSource {
  if (world.configurationFailure === "the source cannot complete the read") {
    return createThrowingTenantSource()
  }

  if (world.configurationFailure === "the source returns a record for shelbyville") {
    const shelbyville = world.tenants.find((tenant) => tenant.slug === "shelbyville")
    assert.ok(shelbyville)
    return createMismatchedTenantSource(
      syntheticTenantRecord(shelbyville.slug, shelbyville.displayName)
    )
  }

  const records: unknown[] = recordsFromWorld(world)
  if (world.invalidDisplayName !== undefined) {
    const index = records.findIndex((record) => slugOf(record) === "springfield")
    assert.notEqual(index, -1)
    records[index] = invalidEnvShape(world.invalidDisplayName)
  }

  if (world.alternativeDisplayName !== undefined) {
    const index = records.findIndex((record) => slugOf(record) === "springfield")
    assert.notEqual(index, -1)
    records[index] = syntheticTenantRecord("springfield", world.alternativeDisplayName)
  }

  try {
    return createStaticTenantSource(records, { allowLoopbackHttp: true })
  } catch {
    return createThrowingTenantSource()
  }
}

export function localRecord(world: TenantWorld): TenantRecord | undefined {
  if (world.localStaticRecord === undefined) {
    return undefined
  }

  return parseTenantRecord(
    {
      config: syntheticTenantConfig(
        world.localStaticRecord.displayName,
        world.localStaticRecord.slug
      ),
      slug: world.localStaticRecord.slug
    },
    { allowLoopbackHttp: true }
  )
}

/** Tab until focus is on the named control inside the open inactivity modal. */
export async function navigateInactivityModalKeyboard(
  world: TenantWorld,
  buttonName: string
): Promise<void> {
  assert.ok(world.page)
  const button = world.page.getByRole("button", { name: buttonName })
  for (let index = 0; index < 12; index += 1) {
    if (await isFocused(button)) {
      return
    }
    await world.page.keyboard.press("Tab")
  }
  assert.ok(await isFocused(button), `keyboard navigation never reached ${buttonName}`)
}

export async function navigateWithKeyboard(world: TenantWorld): Promise<void> {
  assert.ok(world.page)
  const button = world.page.getByRole("button", { name: "Continue to Pre-ETS" })
  for (let index = 0; index < 20; index += 1) {
    if (await isFocused(button)) {
      return
    }

    await world.page.keyboard.press("Tab")
  }

  assert.ok(await isFocused(button), "keyboard navigation never reached Continue to Pre-ETS")
}

export async function openIndependentVisitors(world: TenantWorld): Promise<void> {
  const springfieldHost = visitorHost(world, "springfield")
  const shelbyvilleHost = visitorHost(world, "shelbyville")
  captureHostPort(world, springfieldHost)
  await ensureOwnedProcess(world)
  await ensureBrowser(world)
  assert.ok(world.browser)
  world.springfieldPage = await openNamedPage(world, springfieldHost)
  world.shelbyvillePage = await openNamedPage(world, shelbyvilleHost)
}

export async function openLandingPage(world: TenantWorld, host: string): Promise<void> {
  captureHostPort(world, host)

  if (world.useHttp || world.useBrowser) {
    await requestLandingPage(world, host)
  }

  if (world.useBrowser) {
    await openBrowserPage(world, host)
  }

  if (world.useContract) {
    world.contractResult = await resolveHost(world, host)
  }
}

export async function readEstablishedConsumers(world: TenantWorld): Promise<void> {
  assert.ok(world.establishedSlug)
  const host = `${world.establishedSlug}.${hostSuffix(world)}`
  const first = await requireSuccessful(resolveHost(world, host))
  const second = await requireSuccessful(resolveHost(world, host))
  const third = await requireSuccessful(resolveHost(world, host))
  world.consumerContexts = [first, second, third]
}

export async function reloadIndependentVisitors(world: TenantWorld): Promise<void> {
  assert.ok(world.springfieldPage)
  assert.ok(world.shelbyvillePage)
  await Promise.all([
    world.springfieldPage.reload({ waitUntil: "domcontentloaded" }),
    world.shelbyvillePage.reload({ waitUntil: "domcontentloaded" })
  ])
}

export async function reloadLandingPage(world: TenantWorld, host: string): Promise<void> {
  captureHostPort(world, host)
  if (world.useBrowser) {
    if (world.page === undefined || world.page.isClosed()) {
      await openBrowserPage(world, host)
    } else {
      await world.page.reload({ waitUntil: "domcontentloaded" })
    }
  }

  await requestLandingPage(world, host)
}

export async function requestLandingPage(
  world: TenantWorld,
  host = world.authoritativeHost ?? world.requestedHost
): Promise<void> {
  if (world.hostCondition !== undefined) {
    await ensureOwnedProcess(world)
    world.httpResponse = await sendHttpRequest({
      host: hostHeaderForCondition(world.hostCondition),
      omitHostHeader: world.hostCondition === "a missing host",
      path: "/",
      port: world.port
    })
    await capturePrefetch(world, hostHeaderForCondition(world.hostCondition), world.hostCondition === "a missing host")
    return
  }

  assert.ok(host)
  captureHostPort(world, host)
  await ensureOwnedProcess(world)
  const pathName = world.competingSlug === undefined ? "/" : `/?tenant=${world.competingSlug}`
  world.httpResponse = await sendHttpRequest({
    extraHeaders: {
      Accept: "text/html,application/xhtml+xml",
      "Sec-Fetch-Dest": "document",
      ...competingHeaders(world)
    },
    host,
    path: pathName,
    port: world.port
  })
  await capturePrefetch(world, host)
}

export function requireContext(
  result: ContractResult | undefined
): { readonly config: TenantConfig; readonly slug: string } {
  if (!result?.ok) {
    throw new Error("Expected a successful tenant context")
  }

  return result.value
}

export function requireFailure(result: ContractResult | undefined): ContractFailureReason {
  if (result === undefined || result.ok) {
    throw new Error("Expected a tenant failure")
  }

  return result.reason
}

export async function resolveHost(world: TenantWorld, host: string): Promise<ContractResult> {
  const mode = effectiveMode(world)
  const source = injectedSource(world)
  if (mode === "static") {
    world.binderInvocationCount = 0
    const record = localRecord(world)
    if (record === undefined) {
      return failContract(world, "invalid-config")
    }

    return {
      ok: true,
      value: {
        config: record.config,
        slug: record.slug
      }
    }
  }

  world.binderInvocationCount = 1
  const slug = bindHost(host, hostSuffix(world))
  if (slug === undefined) {
    return failContract(world, "invalid-host")
  }

  try {
    const record = await source.readTenantRecord(slug)
    if (record === undefined) {
      return failContract(world, "unknown-tenant")
    }

    if (record.slug !== slug) {
      return failContract(world, "invalid-config")
    }

    return {
      ok: true,
      value: {
        config: record.config,
        slug
      }
    }
  } catch {
    return failContract(world, "unreadable-config")
  }
}

export async function restartWithUpdatedName(world: TenantWorld, displayName: string): Promise<void> {
  assert.ok(world.localStaticRecord)
  world.previousDisplayName = world.localStaticRecord.displayName
  world.localStaticRecord = { displayName, slug: world.localStaticRecord.slug }
  await restartOwnedProcess(world)
}

export function upsertTenant(world: TenantWorld, slug: string, displayName: string): void {
  const next = { displayName, slug }
  const index = world.tenants.findIndex((tenant) => tenant.slug === slug)
  if (index === -1) {
    world.tenants.push(next)
    return
  }

  world.tenants[index] = next
}

export async function visitEqualNameTenants(world: TenantWorld): Promise<void> {
  await openIndependentVisitors(world)
  world.springfieldIdentity = await requireSuccessful(resolveHost(world, visitorHost(world, "springfield")))
  world.shelbyvilleIdentity = await requireSuccessful(resolveHost(world, visitorHost(world, "shelbyville")))
}

function assertCacheControl(response: HttpExchange): void {
  const value = response.headers["cache-control"] ?? ""
  assert.equal(value.toLowerCase().includes("public"), false)
  assert.ok(
    value === CACHE_CONTROL || value === "no-cache, must-revalidate",
    `unexpected Cache-Control: ${value}`
  )
}

function assertNoTenantRedirect(response: HttpExchange): void {
  assert.ok(
    response.status < 300 || response.status >= 400,
    `unexpected redirect status ${String(response.status)}`
  )
  const location = response.headers.location
  if (location === undefined) {
    return
  }

  assert.match(location, /^\/(?:\?|$)/, `unexpected redirect target ${location}`)
}

function captureHostPort(world: TenantWorld, host: string): void {
  world.requestedHost = host
  const portMatch = /:(\d+)$/.exec(host)
  if (portMatch?.[1] !== undefined) {
    world.port = Number(portMatch[1])
  }
}

async function capturePrefetch(
  world: TenantWorld,
  host: string | undefined,
  omitHostHeader = false
): Promise<void> {
  world.prefetchResponse = await sendHttpRequest({
    extraHeaders: {
      "Next-Router-Prefetch": "1",
      RSC: "1"
    },
    host,
    omitHostHeader,
    path: "/",
    port: world.port
  })
}

function competingHeaders(world: TenantWorld): Record<string, string> {
  if (world.competingSlug === undefined) {
    return {}
  }

  return {
    "X-Forwarded-Host": `${world.competingSlug}.pathable.com`,
    "x-preets-tenant-origin": "local-static",
    "x-preets-tenant-slug": world.competingSlug
  }
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function failContract(world: TenantWorld, reason: ContractFailureReason): ContractResult {
  world.resolutionFailure = reason
  return { ok: false, reason }
}

async function hasVisibleFocusTreatment(locator: Locator): Promise<boolean> {
  return await locator.evaluate((node: object) => {
    if (!("ownerDocument" in node)) {
      return false
    }

    const view = (node.ownerDocument as { defaultView?: unknown }).defaultView
    if (typeof view !== "object" || view === null || !("getComputedStyle" in view)) {
      return false
    }

    const computed = (view.getComputedStyle as (element: object) => {
      boxShadow: string
      outlineStyle: string
      outlineWidth: string
    }).call(view, node)
    const hasOutline = computed.outlineStyle !== "none" && computed.outlineWidth !== "0px"
    const hasShadow = computed.boxShadow !== "none" && computed.boxShadow !== ""
    return hasOutline || hasShadow
  })
}

function hostHeaderForCondition(condition: string): string | undefined {
  if (condition === "a missing host") {
    return undefined
  }

  if (condition === "a comma-separated pair of host values") {
    return "springfield.pathable.com,shelbyville.pathable.com"
  }

  return "-invalid-.pathable.com"
}

async function isFocused(locator: Locator): Promise<boolean> {
  return await matchesFocusVisible(locator) && await hasVisibleFocusTreatment(locator)
}

function isSamePathRscRedirect(response: HttpExchange): boolean {
  const location = response.headers.location
  return (response.status === 307 || response.status === 308) && location !== undefined
    && /^\/(?:\?_rsc=|$)/.test(location)
}

async function matchesFocusVisible(locator: Locator): Promise<boolean> {
  return await locator.evaluate((node: object) => {
    return "matches" in node && typeof node.matches === "function"
      && (node.matches as (selector: string) => boolean).call(node, ":focus-visible")
  })
}

async function openBrowserPage(world: TenantWorld, host: string) {
  await ensureBrowser(world)
  assert.ok(world.browser)
  if (world.browserContext !== undefined) {
    await world.browserContext.close().catch(() => undefined)
  }

  const context = await world.browser.newContext()
  world.browserContext = context
  world.page = await context.newPage()
  await world.page.goto(pageUrl(world, host), { waitUntil: "domcontentloaded" })
}

async function openNamedPage(world: TenantWorld, host: string) {
  assert.ok(world.browser)
  const context = await world.browser.newContext()
  const page = await context.newPage()
  await page.goto(pageUrl(world, host), { waitUntil: "domcontentloaded" })
  return page
}

function pageUrl(world: TenantWorld, host: string): string {
  return host.includes(":") ? `http://${host}/` : `http://${host}:${String(world.port)}/`
}

function recordsFromWorld(world: TenantWorld): TenantRecord[] {
  return world.tenants.map((tenant) => syntheticTenantRecord(tenant.slug, tenant.displayName))
}

async function requireSuccessful(
  resultPromise: Promise<ContractResult>
): Promise<{ readonly config: TenantConfig; readonly slug: string }> {
  const result = await resultPromise
  if (!result.ok) {
    throw new Error(`Expected a successful tenant context, received ${result.reason}`)
  }

  return result.value
}

async function sendHttpRequest(options: {
  extraHeaders?: Record<string, string>
  host: string | undefined
  omitHostHeader?: boolean
  path: string
  port: number
}): Promise<HttpExchange> {
  return await sendRawGet(options)
}

function slugOf(record: unknown): string | undefined {
  if (typeof record === "object" && record !== null && "slug" in record && typeof record.slug === "string") {
    return record.slug
  }

  return undefined
}

function visitorHost(world: TenantWorld, slug: string): string {
  if (world.runtime === "production") {
    return `${slug}.pathable.com`
  }

  return `${slug}.localhost:${String(world.port)}`
}
