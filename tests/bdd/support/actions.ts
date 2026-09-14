import type { Locator } from "playwright"

import assert from "node:assert/strict"
import net from "node:net"

import type { HttpExchange, TenantWorld } from "./world.ts"

import { bindHost } from "../../../packages/frontend/src/tenant/host.ts"
import { selectTenantMode } from "../../../packages/frontend/src/tenant/mode.ts"
import {
  type CurrentTenantContext,
  parseTenantRecord,
  type TenantFailureReason,
  type TenantRecord,
  type TenantResult
} from "../../../packages/frontend/src/tenant/model.ts"
import { type HostBinder, readBoundTenant, resolveTenant } from "../../../packages/frontend/src/tenant/resolve.ts"
import {
  CACHE_CONTROL,
  LOCAL_CONFIG_ERROR,
  mapTenantFailureToResponse
} from "../../../packages/frontend/src/tenant/response.ts"
import {
  createMismatchedTenantSource,
  createStaticTenantSource,
  createUnavailableTenantSource
} from "../../../packages/frontend/src/tenant/source.ts"
import { invalidEnvShape } from "./fixtures.ts"
import { ensureBrowser, ensureOwnedProcess, restartOwnedProcess } from "./server.ts"

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
  const body = world.httpResponse.body.trim()
  assert.match(body, /valid/i)
  assert.match(body, /TENANT_LOCAL_CONFIG_JSON/)
  assert.match(body, /restart/i)
  assert.equal(body, LOCAL_CONFIG_ERROR)
}

export function assertNoSuccessfulContext(world: TenantWorld): void {
  if (world.contractResult !== undefined) {
    assert.equal(world.contractResult.ok, false)
    return
  }

  assert.ok(world.httpResponse)
  assert.notEqual(world.httpResponse.status, 200)
}

export function assertNotDisplayedName(world: TenantWorld, name: string): void {
  assert.ok(world.httpResponse)
  assert.doesNotMatch(decodeEntities(world.httpResponse.body), new RegExp(`Tenant: ${escapeRegExp(name)}`))
}

export function assertRefused(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assert.equal(world.httpResponse.status, 403)
  assert.equal(world.httpResponse.headers.location, undefined)
  assertCacheControl(world.httpResponse)
  if (world.prefetchResponse !== undefined) {
    assert.equal(world.prefetchResponse.status, 403)
    assertCacheControl(world.prefetchResponse)
  }
}

export function assertServerError(world: TenantWorld): void {
  assert.ok(world.httpResponse)
  assert.equal(world.httpResponse.status, 500)
  assert.equal(world.httpResponse.headers.location, undefined)
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
  const selection = selectTenantMode(world.unsupportedMode ?? world.resolutionMode, world.runtime ?? "development")
  if ("diagnostic" in selection) {
    world.modeDiagnostic = selection.diagnostic
  }

  return selection.mode
}

export function hostSuffix(world: TenantWorld): "localhost" | "pathable.com" {
  return world.runtime === "production" ? "pathable.com" : "localhost"
}

export function injectedSource(world: TenantWorld) {
  if (world.configurationFailure === "the source cannot complete the read") {
    return createUnavailableTenantSource()
  }

  if (world.configurationFailure === "the source returns a record for shelbyville") {
    const shelbyville = world.tenants.find((tenant) => tenant.slug === "shelbyville")
    assert.ok(shelbyville)
    return createMismatchedTenantSource({
      config: { displayName: shelbyville.displayName },
      slug: shelbyville.slug
    })
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
    records[index] = {
      config: { displayName: world.alternativeDisplayName },
      slug: "springfield"
    }
  }

  const source = createStaticTenantSource(records)
  if (!source.ok) {
    return {
      readTenantRecord(): Promise<TenantResult<TenantRecord>> {
        return Promise.resolve({ ok: false, reason: "invalid-config" })
      }
    }
  }

  return source.value
}

export function localRecord(world: TenantWorld): TenantRecord | undefined {
  if (world.localStaticRecord === undefined) {
    return undefined
  }

  const parsed = parseTenantRecord({
    config: { displayName: world.localStaticRecord.displayName },
    slug: world.localStaticRecord.slug
  })
  return parsed.ok ? parsed.value : undefined
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
  const source = injectedSource(world)
  const bound = await requireSuccessful(resolveHost(world, `${world.establishedSlug}.${hostSuffix(world)}`))
  const second = await requireSuccessful(readBoundTenant({
    origin: bound.origin,
    slug: bound.slug,
    source
  }))
  const third = await requireSuccessful(readBoundTenant({
    origin: bound.origin,
    slug: bound.slug,
    source
  }))
  world.consumerContexts = [bound, second, third]
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
    extraHeaders: competingHeaders(world),
    host,
    path: pathName,
    port: world.port
  })
  await capturePrefetch(world, host)
}

export function requireContext(
  result: TenantResult<CurrentTenantContext> | undefined
): CurrentTenantContext {
  if (!result?.ok) {
    throw new Error("Expected a successful tenant context")
  }

  return result.value
}

export function requireFailure(
  result: TenantResult<CurrentTenantContext> | undefined
): TenantFailureReason {
  if (result === undefined || result.ok) {
    throw new Error("Expected a tenant failure")
  }

  return result.reason
}

export async function resolveHost(world: TenantWorld, host: string): Promise<TenantResult<CurrentTenantContext>> {
  const mode = effectiveMode(world)
  const source = injectedSource(world)
  let binds = 0
  const countingBind: HostBinder = (rawHost, suffix) => {
    binds += 1
    return bindHost(rawHost, suffix)
  }
  const result = await resolveTenant({
    bindHost: countingBind,
    host,
    hostSuffix: hostSuffix(world),
    localRecord: localRecord(world),
    mode,
    source
  })
  world.binderInvocationCount = binds
  if (!result.ok) {
    world.resolutionFailure = result.reason
    world.mappedFailure = mapTenantFailureToResponse(result.reason, {
      mode,
      runtime: world.runtime ?? "development"
    })
  }

  return result
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

function decodeChunked(body: string): string {
  let decoded = ""
  let remaining = body
  while (remaining.length > 0) {
    const lineEnd = remaining.indexOf("\r\n")
    if (lineEnd === -1) {
      return body
    }

    const size = Number.parseInt(remaining.slice(0, lineEnd), 16)
    if (Number.isNaN(size)) {
      return body
    }

    if (size === 0) {
      break
    }

    const dataStart = lineEnd + 2
    decoded += remaining.slice(dataStart, dataStart + size)
    remaining = remaining.slice(dataStart + size + 2)
  }

  return decoded
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

function parseRawHttp(raw: string): HttpExchange {
  const separator = raw.indexOf("\r\n\r\n")
  const head = separator === -1 ? raw : raw.slice(0, separator)
  const lines = head.split("\r\n")
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d+)/.exec(lines[0] ?? "")
  const headers: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    const index = line.indexOf(":")
    if (index === -1) {
      continue
    }

    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
  }

  let body = separator === -1 ? "" : raw.slice(separator + 4)
  if ((headers["transfer-encoding"] ?? "").includes("chunked")) {
    body = decodeChunked(body)
  }

  return {
    body,
    headers,
    status: statusMatch === null ? 0 : Number(statusMatch[1])
  }
}

function recordsFromWorld(world: TenantWorld): TenantRecord[] {
  return world.tenants.map((tenant) => ({
    config: { displayName: tenant.displayName },
    slug: tenant.slug
  }))
}

async function requireSuccessful(
  resultPromise: Promise<TenantResult<CurrentTenantContext>>
): Promise<CurrentTenantContext> {
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
  const version = options.omitHostHeader === true ? "HTTP/1.0" : "HTTP/1.1"
  const headerLines = ["Connection: close", "Accept-Encoding: identity"]
  if (options.omitHostHeader !== true) {
    headerLines.push(`Host: ${options.host ?? ""}`)
  }

  for (const [name, value] of Object.entries(options.extraHeaders ?? {})) {
    headerLines.push(`${name}: ${value}`)
  }

  const payload = `GET ${options.path} ${version}\r\n${headerLines.join("\r\n")}\r\n\r\n`
  const raw = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(options.port, "127.0.0.1")
    const chunks: Buffer[] = []
    socket.on("connect", () => {
      socket.write(payload)
    })
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    socket.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    socket.on("error", reject)
    socket.setTimeout(10_000, () => {
      socket.destroy(new Error("HTTP request timed out"))
    })
  })

  return parseRawHttp(raw)
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
