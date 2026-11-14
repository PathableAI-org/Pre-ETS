import type { BrowserTracingConfig, BrowserTracingDocument } from "@pathableai/pre-ets-frontend-services"

import { createElement, Fragment, type ReactNode } from "react"

import type { Fact, FactScope } from "./browser-tracing/facts.ts"
import type { CausedRequest, SdkStartup } from "./browser-tracing/sdk.ts"

/** The one server-to-browser contract: the four configuration values, as JSON in this meta element's `content`. */
const CONFIG_META_NAME = "preets-browser-tracing"

/**
 * Renders the document's `<meta name="traceparent">` and the browser configuration, or nothing when browser tracing
 * is off. Server-safe; React hoists both elements into `<head>`. Written without JSX so the facade keeps the module
 * name the browser entry imports.
 */
export function BrowserTracingMeta({ document }: { readonly document: BrowserTracingDocument | undefined }): ReactNode {
  if (document === undefined) return null
  const { endpoint, serviceInstanceId, serviceName, serviceVersion } = document.config
  return createElement(
    Fragment,
    null,
    document.traceparent === undefined
      ? null
      : createElement("meta", { content: document.traceparent, name: "traceparent" }),
    createElement("meta", {
      content: JSON.stringify({ endpoint, serviceInstanceId, serviceName, serviceVersion }),
      name: CONFIG_META_NAME
    })
  )
}

const isText = (value: unknown) => typeof value === "string" && value.length > 0

/** One check per configuration value; the collector endpoint must be an absolute `http:` or `https:` URL. */
const CONFIG_CHECKS: Readonly<Record<keyof BrowserTracingConfig, (value: unknown) => boolean>> = {
  endpoint: (value) =>
    typeof value === "string" && URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol),
  serviceInstanceId: (value) => value === undefined || isText(value),
  serviceName: isText,
  serviceVersion: isText
}

const isConfig = (value: object): value is BrowserTracingConfig =>
  Object.entries(CONFIG_CHECKS).every(([key, check]) => check(Reflect.get(value, key)))

export type FocusTarget =
  | "expiration_log_in"
  | "logout_control"
  | "participant_goal"
  | "recovery_heading"
  | "signed_out_heading"
  | "warning_continue"

/** Where the user activated Log in (#157 T-005). */
export type LoginEntry = "action_recovery" | "expiration_modal"

/** Cross-tab message kinds: the coordination message `type` with `_` for `-`. */
export type TabMessageKind =
  | "communicated"
  | "logged_out"
  | "logout_failed"
  | "logout_started"
  | "pending"
  | "renewed"
  | "session_current"
  | "window_query"

/** Runs `task` synchronously with the record's span as the active context. A plain call when nothing was recorded. */
export interface TraceScope {
  readonly run: <A>(task: () => A) => A
}

/**
 * Why the coordinator changed state, where it says (#157 T-002, T-003; #156 T-002). `continue`: this tab's Continue
 * renewed. `renewal`: another answer this tab received showed a renewal. `threshold`: the tab confirmed at its local
 * warning threshold.
 */
export type TransitionCause = "action_denied" | "continue" | "deadline" | "peer" | "renewal" | "resume" | "threshold"

/** The held deadline and the tab's server-time estimate at a transition, both on the server clock (#157 T-003). */
export interface TransitionTiming {
  readonly deadlineMs: number
  readonly serverTimeMs: number
  /** The held warning lead. Set on threshold facts and on transitions into and out of `warning_shown` (#156 T-002). */
  readonly warningLeadMinutes?: number | undefined
}

/** UI states of the session coordinator, derived from its `(view, concealed)` (telemetry contract closed sets). */
export type UiState =
  | "content_concealed"
  | "content_shown"
  | "expired"
  | "logging_out"
  | "logging_out_concealed"
  | "logout_failed"
  | "recovery_expired"
  | "recovery_unavailable"
  | "signed_out"
  | "warning_shown"

/** Facts kept while the SDK loads; later ones are only counted (T-011). */
const BUFFER_LIMIT = 256
/** Without registration by then, the facade turns off and drops the buffer (plan PL-1). */
const PENDING_LIMIT_MILLISECONDS = 10_000
/** How long an unclaimed cause, or an ambiguous slot, lasts (research D16). */
const CAUSE_LIFETIME_MILLISECONDS = 5_000
const FOCUS_ATTRIBUTE = "data-preets-focus"
const FOCUS_TARGETS: ReadonlySet<string> = new Set<FocusTarget>([
  "expiration_log_in",
  "logout_control",
  "participant_goal",
  "recovery_heading",
  "signed_out_heading",
  "warning_continue"
])
const NAVIGATION_TYPES: ReadonlySet<string> = new Set(["push", "replace", "traverse"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** `off` records nothing; `pending` buffers facts; `started` has the SDK's live recorder. */
let phase: "off" | "pending" | "started" = "off"
let recorder: ((fact: Fact) => FactScope) | undefined
let buffered: Fact[] = []
let dropped = 0
/** The focus target `moveFocus` is moving to, while it runs. */
let applicationFocus: FocusTarget | undefined

/** One pending cause per request kind; a second interaction before it is claimed makes the slot ambiguous (D16). */
type CauseSlot =
  | { readonly _tag: "ambiguous"; readonly expires: number }
  | { readonly _tag: "empty" }
  | { readonly _tag: "held"; readonly expires: number; readonly key: unknown; readonly scope: FactScope }

const EMPTY_SLOT: CauseSlot = { _tag: "empty" }
const causes: Record<CausedRequest["kind"], CauseSlot> = { action: EMPTY_SLOT, router: EMPTY_SLOT }

const CURRENT_SCOPE: TraceScope = { run: (task) => task() }

/**
 * Records a fact: a span once the SDK runs, a buffered fact while it loads, nothing when off. Answers the span's scope
 * only when a span was created. Never throws.
 */
const record = (fact: Omit<Fact, "startTime">): FactScope | undefined => {
  try {
    const timed = { ...fact, startTime: performance.now() }
    if (recorder !== undefined) return recorder(timed)
    if (phase !== "pending") return undefined
    if (buffered.length < BUFFER_LIMIT) buffered.push(timed)
    else dropped += 1
  } catch {
    // Telemetry never changes the page.
  }
  return undefined
}

const scopeOf = (scope: FactScope | undefined): TraceScope => scope === undefined ? CURRENT_SCOPE : { run: scope }

const slotLive = (slot: CauseSlot, now: number) => slot._tag !== "empty" && slot.expires > now

/** Holds `scope` as the cause for `kind`, or makes the slot ambiguous when another cause is still pending. */
const fillCause = (kind: CausedRequest["kind"], key: unknown, scope: FactScope | undefined) => {
  if (scope === undefined) return
  const now = Date.now()
  const expires = now + CAUSE_LIFETIME_MILLISECONDS
  causes[kind] = slotLive(causes[kind], now) ? { _tag: "ambiguous", expires } : { _tag: "held", expires, key, scope }
}

/** Claims an unexpired, unambiguous cause once; a router cause only for its destination path (D16). */
const claimCause = (request: CausedRequest): FactScope | undefined => {
  const slot = causes[request.kind]
  if (slot._tag !== "held" || slot.expires <= Date.now()) return undefined
  if (request.kind === "router" && slot.key !== request.path) return undefined
  causes[request.kind] = EMPTY_SLOT
  return slot.scope
}

const stopTracing = () => {
  phase = "off"
  buffered = []
  dropped = 0
}

/** Registers the SDK while still pending; it replays the buffer and answers the live recorder. */
const register = (
  startSdk: (config: BrowserTracingConfig, startup: SdkStartup) => (fact: Fact) => FactScope,
  config: BrowserTracingConfig
) => {
  if (phase !== "pending") return
  const startup: SdkStartup = { buffered, claimCause, dropped }
  buffered = []
  dropped = 0
  recorder = startSdk(config, startup)
  phase = "started"
}

const focusTargetOf = (target: EventTarget | null): string | undefined => {
  const value = target instanceof Element ? target.getAttribute(FOCUS_ATTRIBUTE) : null
  return value !== null && FOCUS_TARGETS.has(value) ? value : undefined
}

/** T-007: focus entering or leaving a marked target; `application` only while `moveFocus` runs. */
const recordFocus = (event: FocusEvent) => {
  const target = focusTargetOf(event.target)
  if (target === undefined) return
  record({
    attributes: {
      "preets.focus.cause": applicationFocus === undefined ? "user" : "application",
      "preets.focus.change": event.type === "focusin" ? "entered" : "left",
      "preets.focus.target": target,
      "preets.outcome": "moved"
    },
    name: "Focus.move",
    root: true
  })
}

/** T-009: every form submit, including `requestSubmit` replays; it becomes the pending Server Action cause. */
const recordSubmit = (event: SubmitEvent) => {
  const scope = record({
    attributes: { "preets.interaction.kind": "form_submit", "preets.outcome": "submitted" },
    name: "Interaction.submit",
    root: false
  })
  fillCause("action", event, scope)
}

/** Capture-phase listeners; `submit` on `window` runs before the coordinator's guard on `document`. */
const listen = () => {
  window.addEventListener("submit", recordSubmit, { capture: true })
  document.addEventListener("focusin", recordFocus, { capture: true })
  document.addEventListener("focusout", recordFocus, { capture: true })
}

/** Next's App Router hook, re-exported by `instrumentation-client.ts` (T-010; research D16). */
export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse"): void {
  try {
    const path = new URL(url, location.href).pathname
    const scope = record({
      attributes: {
        "preets.navigation.type": NAVIGATION_TYPES.has(navigationType) ? navigationType : undefined,
        "preets.outcome": "started",
        "url.path": path
      },
      name: "Router.transition",
      root: false
    })
    fillCause("router", path, scope)
  } catch {
    // Telemetry never changes the page.
  }
}

/**
 * Reads the rendered configuration synchronously. Without it, nothing is loaded and nothing is requested (FR-003).
 * With it, the facade buffers facts and installs the focus and submit listeners, then lazily imports and starts the
 * SDK, which replays the buffer. Never throws; a failure leaves the page untouched (FR-009).
 */
export function startBrowserTracing(): void {
  try {
    const config = readConfig()
    if (config === undefined) return
    phase = "pending"
    listen()
    setTimeout(() => {
      if (phase === "pending") stopTracing()
    }, PENDING_LIMIT_MILLISECONDS)
    import("./browser-tracing/sdk.ts").then((sdk) => {
      register(sdk.startSdk, config)
    }).catch(stopTracing)
  } catch {
    stopTracing()
  }
}

/**
 * T-004 (#157 T-002, T-003). `from` is `undefined` for the coordinator's first state, recorded as `mounted`. `cause`
 * and `timing` are set only where the contract defines them.
 */
export const recordUiTransition = (
  from: UiState | undefined,
  to: UiState,
  detail?: {
    readonly cause?: TransitionCause | undefined
    readonly timing?: TransitionTiming | undefined
  }
): TraceScope =>
  scopeOf(record({
    attributes: {
      "preets.outcome": "applied",
      "preets.session.deadline_ms": detail?.timing?.deadlineMs,
      "preets.session.server_time_ms": detail?.timing?.serverTimeMs,
      "preets.session.warning_lead_minutes": detail?.timing?.warningLeadMinutes,
      "preets.ui.cause": detail?.cause,
      "preets.ui.from_state": from ?? "mounted",
      "preets.ui.to_state": to
    },
    name: "TabCoordination.transition",
    root: false
  }))

/**
 * #156 T-001. The tab reached its local warning threshold, or resumed past it, and now confirms; the confirmation
 * request starts inside the answered scope.
 */
export const recordWarningThreshold = (cause: "resume" | "threshold", timing: TransitionTiming): TraceScope =>
  scopeOf(record({
    attributes: {
      "preets.outcome": "reached",
      "preets.session.deadline_ms": timing.deadlineMs,
      "preets.session.server_time_ms": timing.serverTimeMs,
      "preets.session.warning_lead_minutes": timing.warningLeadMinutes,
      "preets.ui.cause": cause
    },
    name: "TabCoordination.threshold",
    root: false
  }))

/** #156 T-003. Recorded synchronously when the user activates Continue; the request is sent inside its scope. */
export const recordContinueActivation = (): TraceScope =>
  scopeOf(record({ attributes: { "preets.outcome": "activated" }, name: "Interaction.continue", root: false }))

/** #157 T-005. A root fact recorded synchronously when the user activates Log in, before the navigation leaves. */
export const recordLoginActivation = (entry: LoginEntry): void => {
  record({
    attributes: { "preets.login.entry": entry, "preets.outcome": "activated" },
    name: "Interaction.login",
    root: true
  })
}

/** T-005. Answers the send's telemetry-only UUID to carry as `telemetryId`, or `undefined` when tracing is off. */
export const recordTabMessageSend = (kind: TabMessageKind): string | undefined => {
  if (phase === "off") return undefined
  try {
    const telemetryId = crypto.randomUUID()
    record({
      attributes: {
        "preets.outcome": "sent",
        "preets.tab.message.direction": "send",
        "preets.tab.message.id": telemetryId,
        "preets.tab.message.kind": kind
      },
      name: "TabChannel.send",
      root: false
    })
    return telemetryId
  } catch {
    return undefined
  }
}

/** T-006. Records the carried `telemetryId` only when it is a canonical UUID. */
export const recordTabMessageReceipt = (kind: TabMessageKind, telemetryId: unknown): TraceScope =>
  scopeOf(record({
    attributes: {
      "preets.outcome": "received",
      "preets.tab.message.direction": "receive",
      "preets.tab.message.id": typeof telemetryId === "string" && UUID.test(telemetryId) ? telemetryId : undefined,
      "preets.tab.message.kind": kind
    },
    name: "TabChannel.receive",
    root: false
  }))

/** Withdraws the Server Action cause of the cancelled `event` only; an ambiguous slot stays ambiguous (D16). */
export const withdrawSubmitCause = (event: SubmitEvent): void => {
  const slot = causes.action
  if (slot._tag === "held" && slot.key === event) causes.action = EMPTY_SLOT
}

/** Moves focus to `element`, so the focus record names the application as the cause. */
export const moveFocus = (element: HTMLElement | null, target: FocusTarget): void => {
  applicationFocus = target
  try {
    element?.focus()
  } finally {
    applicationFocus = undefined
  }
}

/** The attribute that identifies a focus target to the focus recorder. */
export const focusTargetProps = (target: FocusTarget): { readonly "data-preets-focus": FocusTarget } => ({
  [FOCUS_ATTRIBUTE]: target
})

/** The rendered configuration, or `undefined` when it is absent or not the four expected values. */
function readConfig(): BrowserTracingConfig | undefined {
  const content = document.querySelector(`meta[name="${CONFIG_META_NAME}"]`)?.getAttribute("content")
  if (content === null || content === undefined) return undefined
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null || !isConfig(parsed)) return undefined
  const { endpoint, serviceInstanceId, serviceName, serviceVersion } = parsed
  return { endpoint, serviceInstanceId, serviceName, serviceVersion }
}
