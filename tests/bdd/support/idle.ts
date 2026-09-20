import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

import type {
  ClearForInactivityResult,
  RenewIdleActivityResult,
  SessionStore,
  SessionStoreCreateResult,
  SessionStoreReadResult,
  SessionStoreUpdateResult
} from "../../../packages/frontend/src/lib/session/store.ts"
import type { SessionRecord } from "../../../packages/frontend/src/lib/session/types.ts"
import type { TenantWorld } from "./world.ts"

import {
  confirmSessionAccess,
  hasConsumableInactivityLatch
} from "../../../packages/frontend/src/lib/session/confirm.ts"
import { signSessionCookie } from "../../../packages/frontend/src/lib/session/cookie.ts"
import { guardAuthenticatedAccess } from "../../../packages/frontend/src/lib/session/guard.ts"
import { computeIdleExpiresAt, endAuthenticatedForInactivity } from "../../../packages/frontend/src/lib/session/idle.ts"
import { inactivityConfirmedMessage } from "../../../packages/frontend/src/lib/session/inactivity-channel.ts"
import { sessionConfig } from "./session.ts"

/** Fixed UTC day so Gherkin clock times like `09:00:00` map to Unix seconds. */
const IDLE_DAY_BASE_SECONDS = Math.floor(Date.parse("2024-06-15T00:00:00.000Z") / 1000)

export interface IdleContractState {
  absoluteExpiresAt: number
  authAt: number
  authorizationCondition?: "evicted" | "missing" | "unavailable"
  browserCondition?: string
  /** Client timer must never flip this to authorize post-deadline access. */
  clientAuthorizedAfterDeadline: boolean
  /** Tenant idle duration that applies to *new* sessions after login-again. */
  currentTenantIdleDurationMinutes?: number
  durableRecords: Set<string>
  /** Prior sid retained as tombstone after login-again rotation. */
  expiredSessionId?: string
  idleDurationMinutes: number
  idpAcceptsExistingSignIn?: boolean
  independentRecord?: SessionRecord
  independentSessionId?: string
  interactionEnabled: boolean
  lastActivityAcceptedAt?: number
  lastProtectedInactivity?: boolean
  lastProtectedOutcome?: "allowed" | "denied"
  loginAgainCompleted?: boolean
  pendingBrowserActivityAt?: number
  protectedContentExposed: boolean
  record: SessionRecord
  recoveryModal?: IdleRecoveryModalState
  resumeCondition?: string
  sessionEndGeneration?: number
  sessionId: string
  store: MemoryIdleStore
  tabs?: {
    broadcastDeliveredToSecond: boolean
    first: IdleTabClientState
    second: IdleTabClientState
  }
  temporaryWork?: string
  temporaryWorkCleared: boolean
  tenantId: string
}

export type IdlePolicyProposalOutcome = "accepted" | "denied" | "rejected"

export interface IdlePolicyState {
  absoluteExpiresAt: number
  /** Tenant slug the representative may manage; undefined means no authority. */
  authorizedTenantId: string | undefined
  lastAuthDurationMinutes?: number
  lastAuthRefused: boolean
  lastProposalOutcome?: IdlePolicyProposalOutcome
  readonly stored: Map<string, IdlePolicyStoredValue>
}

export type IdlePolicyStoredValue =
  | { readonly kind: "invalid"; readonly raw: string }
  | { readonly kind: "omitted" }
  | { readonly kind: "valid"; readonly minutes: number }

/** Contract-level PathAble inactivity modal (no real DOM). */
export interface IdleRecoveryModalState {
  attributedToInactivity: boolean
  open: boolean
  primaryActionName: string
}

/** Per-tab client recovery surface for multi-tab contract scenarios. */
export interface IdleTabClientState {
  broadcastReceived: boolean
  clientAuthorizedAfterDeadline: boolean
  protectedContentExposed: boolean
  recoveryModal: IdleRecoveryModalState | undefined
  temporaryWorkExposed: boolean
}

export class MemoryIdleStore implements SessionStore {
  readonly records = new Map<string, SessionRecord>()

  clearForInactivity(
    sessionId: string,
    nowSeconds: number,
    expectedTenantId: string
  ): Promise<ClearForInactivityResult> {
    const record = this.records.get(sessionId)
    if (record === undefined) {
      return Promise.resolve({ kind: "denied" })
    }
    if (record.tenantId !== expectedTenantId) {
      return Promise.resolve({ kind: "denied" })
    }
    if (record.userId === undefined) {
      if (
        record.accessEndedCause === "inactivity"
        && record.sessionEndGeneration !== undefined
      ) {
        return Promise.resolve({ kind: "already_cleared", record })
      }
      return Promise.resolve({ kind: "denied" })
    }

    if (
      record.idleExpiresAt === undefined
      || nowSeconds < record.idleExpiresAt
      || record.idleExpiresAt > record.expiresAt
    ) {
      return Promise.resolve({ kind: "denied" })
    }

    const cleared = endAuthenticatedForInactivity(record)
    this.records.set(sessionId, cleared)
    return Promise.resolve({ kind: "cleared", record: cleared })
  }

  create(id: string, record: SessionRecord): Promise<SessionStoreCreateResult> {
    if (this.records.has(id)) {
      return Promise.resolve({ kind: "collision" })
    }
    this.records.set(id, record)
    return Promise.resolve({ kind: "created" })
  }

  read(id: string): Promise<SessionStoreReadResult> {
    const record = this.records.get(id)
    if (record === undefined) {
      return Promise.resolve({ kind: "missing" })
    }
    return Promise.resolve({ kind: "record", legacyAuthenticated: false, record })
  }

  renewIdleActivity(
    sessionId: string,
    nowSeconds: number,
    expectedTenantId: string
  ): Promise<RenewIdleActivityResult> {
    const record = this.records.get(sessionId)
    const planned = planBddIdleRenewal(record, nowSeconds, expectedTenantId)
    if (planned.kind !== "renew") {
      return Promise.resolve(planned)
    }
    this.records.set(sessionId, planned.record)
    return Promise.resolve({ kind: "renewed", record: planned.record })
  }

  update(id: string, record: SessionRecord): Promise<SessionStoreUpdateResult> {
    if (!this.records.has(id)) {
      return Promise.resolve({ kind: "missing" })
    }
    this.records.set(id, record)
    return Promise.resolve({ kind: "updated" })
  }
}

export async function acceptQualifyingActivity(
  world: TenantWorld,
  atSeconds: number,
  options: { readonly sessionId?: string; readonly tenantId?: string } = {}
): Promise<boolean> {
  const state = ensureIdleContract(world)
  world.fixedNowSeconds = atSeconds
  const sessionId = options.sessionId ?? state.sessionId
  const tenantId = options.tenantId ?? state.tenantId
  const result = await state.store.renewIdleActivity(sessionId, atSeconds, tenantId)
  const accepted = result.kind === "renewed" || result.kind === "coalesced"
  if (accepted && "record" in result) {
    if (sessionId === state.sessionId) {
      state.record = result.record
      state.lastActivityAcceptedAt = atSeconds
    } else if (sessionId === state.independentSessionId) {
      state.independentRecord = result.record
    }
  }
  return accepted
}

export function assertAbsoluteDeadline(world: TenantWorld, expectedClock: string): void {
  const state = ensureIdleContract(world)
  assert.equal(state.record.expiresAt, parseIdleClock(expectedClock))
}

export function assertIdleDeadline(world: TenantWorld, expectedClock: string): void {
  const state = ensureIdleContract(world)
  assert.equal(state.record.idleExpiresAt, parseIdleClock(expectedClock))
}

export async function attemptProtectedWork(
  world: TenantWorld,
  atSeconds: number,
  options: { readonly sessionId?: string; readonly tenantId?: string } = {}
): Promise<"allowed" | "denied"> {
  const state = ensureIdleContract(world)
  world.fixedNowSeconds = atSeconds

  if (state.authorizationCondition === "unavailable") {
    state.lastProtectedOutcome = "denied"
    state.lastProtectedInactivity = false
    return "denied"
  }

  if (
    state.authorizationCondition === "missing"
    || state.authorizationCondition === "evicted"
  ) {
    state.store.records.delete(options.sessionId ?? state.sessionId)
  }

  const sessionId = options.sessionId ?? state.sessionId
  const tenantId = options.tenantId ?? state.tenantId
  const result = await guardAuthenticatedAccess(
    { sessionId, tenantId },
    {
      nowSeconds: () => atSeconds,
      store: state.store
    }
  )

  if (result.kind === "allow") {
    state.lastProtectedOutcome = "allowed"
    state.lastProtectedInactivity = false
    state.record = result.record
    return "allowed"
  }

  state.lastProtectedOutcome = "denied"
  state.lastProtectedInactivity = result.inactivity
  const updated = state.store.records.get(sessionId)
  if (updated !== undefined) {
    state.record = updated
  }
  return "denied"
}

/**
 * Login-again rotates a new authenticated sid under the current tenant duration.
 * Does not restore cleared temporary work; leaves the old key as a tombstone.
 */
export function completeLoginAgain(
  world: TenantWorld,
  options: { readonly requirePrimaryAction?: string } = {}
): void {
  const state = ensureIdleContract(world)
  if (options.requirePrimaryAction !== undefined) {
    assert.equal(state.recoveryModal?.primaryActionName, options.requirePrimaryAction)
  }
  assert.ok(state.recoveryModal?.open === true, "inactivity modal must be open")
  assert.equal(state.temporaryWorkCleared, true)

  const minutes = state.currentTenantIdleDurationMinutes ?? state.idleDurationMinutes
  const now = world.fixedNowSeconds ?? state.authAt
  const oldSessionId = state.sessionId
  state.expiredSessionId = oldSessionId

  const newSessionId = fixedSessionId(2)
  const record: SessionRecord = {
    expiresAt: state.absoluteExpiresAt,
    idleDurationMinutes: minutes,
    idleExpiresAt: computeIdleExpiresAt(now, minutes),
    lastActivityAt: now,
    tenantId: state.tenantId,
    userId: "user-1",
    userName: "Demo User"
  }
  state.store.records.set(newSessionId, record)
  state.sessionId = newSessionId
  state.record = record
  state.idleDurationMinutes = minutes
  state.authAt = now
  state.loginAgainCompleted = true
  delete state.recoveryModal
  state.protectedContentExposed = true
  state.interactionEnabled = true
  delete state.temporaryWork
  state.temporaryWorkCleared = true
  delete state.sessionEndGeneration
  world.sessionId = newSessionId
}

/**
 * Client confirm/read after server clearance: clear temp UI, open inactivity modal,
 * consume cause while retaining latch.
 */
export async function confirmInactivityRevalidation(world: TenantWorld): Promise<void> {
  const state = ensureIdleContract(world)
  if (state.record.userId !== undefined) {
    await expireAccessForInactivityWhileRunning(world)
  }
  assert.ok(
    state.record.sessionEndGeneration !== undefined
      || state.sessionEndGeneration !== undefined
  )
  await consumeInactivityCauseKeepLatch(world)
  applyInactivityRecoveryToClient(state)
}

/** Consume string cause while retaining sessionEndGeneration latch (confirm semantics). */
export async function consumeInactivityCauseKeepLatch(world: TenantWorld): Promise<void> {
  const state = ensureIdleContract(world)
  const record = state.store.records.get(state.sessionId)
  assert.ok(record !== undefined)
  assert.ok(record.sessionEndGeneration !== undefined)
  const latchOnly: SessionRecord = {
    expiresAt: record.expiresAt,
    sessionEndGeneration: record.sessionEndGeneration,
    tenantId: record.tenantId
  }
  await state.store.update(state.sessionId, latchOnly)
  state.record = latchOnly
  assert.ok(latchOnly.sessionEndGeneration !== undefined)
  state.sessionEndGeneration = latchOnly.sessionEndGeneration
}

export function ensureIdleContract(world: TenantWorld): IdleContractState {
  assert.ok(world.idleContract !== undefined, "idle contract state is required")
  return world.idleContract
}

/**
 * Server-side inactivity clearance while the app is still mounted.
 * Protected UI remains until client revalidation (or resume).
 */
export async function expireAccessForInactivityWhileRunning(
  world: TenantWorld
): Promise<void> {
  const state = ensureIdleContract(world)
  const idleExpiresAt = state.record.idleExpiresAt
  assert.ok(idleExpiresAt !== undefined, "authenticated idle deadline is required")
  const outcome = await attemptProtectedWork(world, idleExpiresAt)
  assert.equal(outcome, "denied")
  assert.equal(state.lastProtectedInactivity, true)
  assert.ok(state.record.sessionEndGeneration !== undefined)
  state.sessionEndGeneration = state.record.sessionEndGeneration
  state.clientAuthorizedAfterDeadline = false
}

/**
 * First tab confirms via server; second tab recovers via BroadcastChannel when
 * delivered, otherwise via the retained server latch (missed-channel path).
 */
export async function oneTabDiscoversSharedInactivity(world: TenantWorld): Promise<void> {
  const state = ensureIdleContract(world)
  assert.ok(state.tabs !== undefined, "shared tabs are required")
  await expireAccessForInactivityWhileRunning(world)
  await consumeInactivityCauseKeepLatch(world)

  const generation = state.sessionEndGeneration ?? state.record.sessionEndGeneration
  assert.ok(generation !== undefined)
  const broadcast = inactivityConfirmedMessage(state.sessionId, generation)

  applyInactivityRecoveryToTab(state.tabs.first)
  applyInactivityRecoveryToClient(state)

  // Contract models missed BroadcastChannel: second tab uses latch, not the channel.
  state.tabs.broadcastDeliveredToSecond = false
  assert.equal(broadcast.sessionId, state.sessionId)
  assert.equal(state.record.sessionEndGeneration, generation)
  assert.equal(state.record.accessEndedCause, undefined)

  await recoverSecondTabViaRetainedLatch(world)
}

export function parseIdleClock(time: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time)
  assert.ok(match !== null, `expected HH:MM:SS clock time, got ${time}`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  assert.ok(
    hours <= 23 && minutes <= 59 && seconds <= 59,
    `invalid clock time ${time}`
  )
  return IDLE_DAY_BASE_SECONDS + hours * 3600 + minutes * 60 + seconds
}

/** Pure BDD idle renewal planner (keeps MemoryIdleStore.renewIdleActivity thin). */
export function planBddIdleRenewal(
  record: SessionRecord | undefined,
  nowSeconds: number,
  expectedTenantId: string
):
  | Extract<RenewIdleActivityResult, { kind: "coalesced" | "denied" }>
  | { readonly kind: "renew"; readonly record: SessionRecord }
{
  if (record?.tenantId !== expectedTenantId) {
    return { kind: "denied" }
  }
  if (!isBddIdleAuthenticated(record)) {
    return { kind: "denied" }
  }
  if (nowSeconds >= record.idleExpiresAt || nowSeconds >= record.expiresAt) {
    return { kind: "denied" }
  }

  const next: SessionRecord = {
    ...record,
    idleExpiresAt: computeIdleExpiresAt(nowSeconds, record.idleDurationMinutes),
    lastActivityAt: nowSeconds
  }
  if (next.idleExpiresAt === record.idleExpiresAt) {
    return { kind: "coalesced", record }
  }
  return { kind: "renew", record: next }
}

export function replaceWithAnonymousSession(world: TenantWorld, tenantId: string): void {
  const state = ensureIdleContract(world)
  const sessionId = fixedSessionId(9)
  const record: SessionRecord = {
    expiresAt: state.absoluteExpiresAt,
    tenantId
  }
  state.store.records.set(sessionId, record)
  state.sessionId = sessionId
  state.record = record
  state.tenantId = tenantId
  world.sessionId = sessionId
}

export async function resumeApplicationAfterSuspension(world: TenantWorld): Promise<void> {
  const state = ensureIdleContract(world)
  assert.ok(state.resumeCondition !== undefined)
  await confirmInactivityRevalidation(world)
  assert.equal(state.protectedContentExposed, false)
  assert.equal(state.temporaryWorkCleared, true)
}

export function seedAuthenticatedIdleSession(
  world: TenantWorld,
  input: {
    readonly absoluteExpiresAt: number
    readonly authAt: number
    readonly idleDurationMinutes: number
    readonly tenantId: string
  }
): IdleContractState {
  const sessionId = fixedSessionId(1)
  const record: SessionRecord = {
    expiresAt: input.absoluteExpiresAt,
    idleDurationMinutes: input.idleDurationMinutes,
    idleExpiresAt: computeIdleExpiresAt(input.authAt, input.idleDurationMinutes),
    lastActivityAt: input.authAt,
    tenantId: input.tenantId,
    userId: "user-1",
    userName: "Demo User"
  }
  const store = new MemoryIdleStore()
  store.records.set(sessionId, record)
  const state: IdleContractState = {
    absoluteExpiresAt: input.absoluteExpiresAt,
    authAt: input.authAt,
    clientAuthorizedAfterDeadline: false,
    durableRecords: new Set(),
    idleDurationMinutes: input.idleDurationMinutes,
    interactionEnabled: true,
    protectedContentExposed: true,
    record,
    sessionId,
    store,
    temporaryWorkCleared: false,
    tenantId: input.tenantId
  }
  world.idleContract = state
  world.sessionId = sessionId
  world.sessionTenantId = input.tenantId
  world.fixedNowSeconds = input.authAt
  return state
}

export function seedDurableRecord(world: TenantWorld, record: string): void {
  ensureIdleContract(world).durableRecords.add(record)
}

export function seedIndependentSession(
  world: TenantWorld,
  input: {
    readonly authAt: number
    readonly context: string
    readonly idleDurationMinutes: number
  }
): void {
  const state = ensureIdleContract(world)
  const tenantId = input.context.includes("shelbyville") ? "shelbyville" : state.tenantId
  const sessionId = fixedSessionId(tenantId === "shelbyville" ? 7 : 8)
  const record: SessionRecord = {
    expiresAt: state.absoluteExpiresAt,
    idleDurationMinutes: input.idleDurationMinutes,
    idleExpiresAt: computeIdleExpiresAt(input.authAt, input.idleDurationMinutes),
    lastActivityAt: input.authAt,
    tenantId,
    userId: "user-independent",
    userName: "Independent User"
  }
  state.store.records.set(sessionId, record)
  state.independentSessionId = sessionId
  state.independentRecord = record
}

export function seedRecoveryAuthenticatedAccess(
  world: TenantWorld,
  tenantId: string,
  options: {
    readonly absoluteExpiresAt?: number
    readonly authAt?: number
    readonly idleDurationMinutes?: number
  } = {}
): IdleContractState {
  return seedAuthenticatedIdleSession(world, {
    absoluteExpiresAt: options.absoluteExpiresAt ?? parseIdleClock("17:00:00"),
    authAt: options.authAt ?? parseIdleClock("09:00:00"),
    idleDurationMinutes: options.idleDurationMinutes ?? 5,
    tenantId
  })
}

export function seedSharedSessionTabs(world: TenantWorld): void {
  const state = ensureIdleContract(world)
  const hasTemp = state.temporaryWork !== undefined && !state.temporaryWorkCleared
  state.tabs = {
    broadcastDeliveredToSecond: false,
    first: emptyTabClient(hasTemp),
    second: emptyTabClient(hasTemp)
  }
}

export function seedTemporaryWork(world: TenantWorld, work: string): void {
  const state = ensureIdleContract(world)
  state.temporaryWork = work
  state.temporaryWorkCleared = false
  state.protectedContentExposed = true
  if (state.tabs !== undefined) {
    state.tabs.first.temporaryWorkExposed = true
    state.tabs.first.protectedContentExposed = true
    state.tabs.second.temporaryWorkExposed = true
    state.tabs.second.protectedContentExposed = true
  }
}

function applyInactivityRecoveryToClient(state: IdleContractState): void {
  state.temporaryWorkCleared = true
  state.protectedContentExposed = false
  state.clientAuthorizedAfterDeadline = false
  state.interactionEnabled = true
  state.recoveryModal = inactivityModal()
  assert.ok(state.record.sessionEndGeneration !== undefined)
  state.sessionEndGeneration = state.record.sessionEndGeneration
}

function applyInactivityRecoveryToTab(tab: IdleTabClientState): void {
  tab.protectedContentExposed = false
  tab.temporaryWorkExposed = false
  tab.clientAuthorizedAfterDeadline = false
  tab.recoveryModal = inactivityModal()
}

function emptyTabClient(temporaryWorkExposed: boolean): IdleTabClientState {
  return {
    broadcastReceived: false,
    clientAuthorizedAfterDeadline: false,
    protectedContentExposed: true,
    recoveryModal: undefined,
    temporaryWorkExposed
  }
}

function fixedSessionId(seed: number): string {
  const bytes = new Uint8Array(32)
  bytes.fill(seed)
  const salt = randomBytes(4)
  bytes.set(salt, 0)
  bytes[4] = seed
  return Buffer.from(bytes).toString("base64url")
}

// --- US3 tenant idle timeout policy (in-process contract harness) ---

function inactivityModal(): IdleRecoveryModalState {
  return {
    attributedToInactivity: true,
    open: true,
    primaryActionName: "Log in again"
  }
}

function isBddIdleAuthenticated(
  record: SessionRecord
): record is SessionRecord & {
  readonly idleDurationMinutes: number
  readonly idleExpiresAt: number
  readonly lastActivityAt: number
  readonly userId: string
} {
  return record.userId !== undefined
    && record.idleDurationMinutes !== undefined
    && record.idleExpiresAt !== undefined
    && record.lastActivityAt !== undefined
}

/**
 * Missed-BroadcastChannel path: second tab confirm/read against the retained latch
 * must yield ended-inactivity before the inactivity modal is applied.
 */
async function recoverSecondTabViaRetainedLatch(world: TenantWorld): Promise<void> {
  const state = ensureIdleContract(world)
  assert.ok(state.tabs !== undefined, "shared tabs are required")
  const now = world.fixedNowSeconds ?? state.authAt
  const record = state.store.records.get(state.sessionId)
  assert.ok(record !== undefined)
  assert.equal(hasConsumableInactivityLatch(record, now), true)

  const config = sessionConfig(world)
  const cookieValue = await signSessionCookie(
    { exp: record.expiresAt, sid: state.sessionId, tenant: state.tenantId },
    config
  )
  const result = await confirmSessionAccess(
    { cookieValue },
    {
      config,
      nowSeconds: () => now,
      store: state.store
    }
  )
  if (result.kind !== "ended-inactivity") {
    assert.fail(`expected ended-inactivity latch confirm, got ${result.kind}`)
  }
  assert.equal(result.sessionId, state.sessionId)
  assert.equal(result.sessionEndGeneration, state.sessionEndGeneration)
  state.record = state.store.records.get(state.sessionId) ?? state.record

  applyInactivityRecoveryToTab(state.tabs.second)
  state.tabs.second.broadcastReceived = false
}

const DEFAULT_POLICY_ABSOLUTE = parseIdleClock("17:00:00")

/**
 * Authenticate a new Springfield session under current policy and assert idle minutes.
 * When `assertContract` is true, also checks the seeded idle contract duration.
 */
export function assertNewSpringfieldSessionUses(
  world: TenantWorld,
  minutes: number,
  options: { readonly assertContract?: boolean } = {}
): void {
  const authAt = world.fixedNowSeconds ?? parseIdleClock("09:00:00")
  const ok = authenticateUnderPolicy(world, "springfield", authAt)
  assert.equal(ok, true)
  assert.equal(ensureIdlePolicy(world).lastAuthDurationMinutes, minutes)
  if (options.assertContract === true) {
    assert.equal(ensureIdleContract(world).idleDurationMinutes, minutes)
  }
}

export function assertPersistedChoice(
  world: TenantWorld,
  tenantId: string,
  minutes: number
): void {
  const state = ensureIdlePolicy(world)
  assert.ok(policySourceAvailable(state), "trusted configuration is unavailable")
  const stored = state.stored.get(tenantId)
  assert.ok(stored !== undefined, `unknown tenant ${tenantId}`)
  if (stored.kind !== "valid") {
    assert.fail(`expected valid persisted choice for ${tenantId}, got ${stored.kind}`)
  }
  assert.equal(stored.minutes, minutes)
}

/**
 * Attempt to start a new authenticated session under the current policy.
 * On success, stamps `idleDurationMinutes` from effective policy at auth time
 * and updates `idleContract` (or seeds a new one).
 */
export function authenticateUnderPolicy(
  world: TenantWorld,
  tenantId: string,
  authAt: number,
  options: { readonly replaceExisting?: boolean } = {}
): boolean {
  const state = ensureIdlePolicy(world)
  state.lastAuthRefused = false
  delete state.lastAuthDurationMinutes

  if (!policySourceAvailable(state)) {
    state.lastAuthRefused = true
    return false
  }

  const duration = effectivePersistedMinutes(world, tenantId)
  if (duration === undefined) {
    state.lastAuthRefused = true
    return false
  }

  state.lastAuthDurationMinutes = duration
  world.fixedNowSeconds = authAt

  const replaceExisting = options.replaceExisting ?? true
  if (replaceExisting || world.idleContract === undefined) {
    seedAuthenticatedIdleSession(world, {
      absoluteExpiresAt: state.absoluteExpiresAt,
      authAt,
      idleDurationMinutes: duration,
      tenantId
    })
  } else {
    // Preserve an existing session; record the probe duration only.
  }

  return true
}

export function authorizePolicyRepresentative(
  world: TenantWorld,
  tenantId: string | undefined
): void {
  ensureIdlePolicy(world).authorizedTenantId = tenantId
}

export function clearExplicitTimeout(world: TenantWorld, tenantId: string): void {
  ensureIdlePolicy(world).stored.set(tenantId, { kind: "omitted" })
}

export function effectivePersistedMinutes(
  world: TenantWorld,
  tenantId: string
): number | undefined {
  const state = ensureIdlePolicy(world)
  if (!policySourceAvailable(state)) {
    return undefined
  }

  const stored = state.stored.get(tenantId)
  assert.ok(stored !== undefined, `unknown tenant ${tenantId}`)
  if (stored.kind === "omitted") {
    return 30
  }
  if (stored.kind === "valid") {
    return stored.minutes
  }
  return undefined
}

export function endPolicySession(world: TenantWorld): void {
  if (world.idleContract === undefined) {
    return
  }
  const idle = ensureIdleContract(world)
  const anonymous: SessionRecord = {
    expiresAt: idle.absoluteExpiresAt,
    tenantId: idle.tenantId
  }
  idle.store.records.set(idle.sessionId, anonymous)
  idle.record = anonymous
  world.sessionId = idle.sessionId
}

export function ensureIdlePolicy(world: TenantWorld): IdlePolicyState {
  assert.ok(world.idlePolicy !== undefined, "idle policy state is required")
  return world.idlePolicy
}

export function establishIdlePolicy(
  world: TenantWorld,
  tenantId: string,
  minutes: number
): void {
  const outcome = proposeIdlePolicy(world, tenantId, minutes)
  assert.equal(outcome, "accepted", `expected accepted policy change for ${tenantId}`)
}

/**
 * Parse a Gherkin policy proposal/storage string into a validated whole-minute
 * duration, or `"invalid"` when outside 5–30 / non-integer / disable / malformed.
 */
export function parseIdlePolicyChoice(choice: string): "invalid" | number {
  if (choice === "disable expiration" || choice === "malformed text") {
    return "invalid"
  }

  const match = /^(-?\d+(?:\.\d+)?)\s+minutes$/.exec(choice)
  if (match === null) {
    return "invalid"
  }

  const value = Number(match[1])
  if (!Number.isSafeInteger(value) || value < 5 || value > 30) {
    return "invalid"
  }

  return value
}

export function proposeIdlePolicy(
  world: TenantWorld,
  tenantId: string,
  choice: "invalid" | number
): IdlePolicyProposalOutcome {
  const state = ensureIdlePolicy(world)
  if (state.authorizedTenantId !== tenantId) {
    state.lastProposalOutcome = "denied"
    return "denied"
  }

  if (choice === "invalid") {
    state.lastProposalOutcome = "rejected"
    return "rejected"
  }

  state.stored.set(tenantId, { kind: "valid", minutes: choice })
  state.lastProposalOutcome = "accepted"
  return "accepted"
}

export function seedIdlePolicyTenants(
  world: TenantWorld,
  tenantA: string,
  tenantB: string
): IdlePolicyState {
  const state: IdlePolicyState = {
    absoluteExpiresAt: DEFAULT_POLICY_ABSOLUTE,
    authorizedTenantId: undefined,
    lastAuthRefused: false,
    stored: new Map([
      [tenantA, { kind: "omitted" }],
      [tenantB, { kind: "omitted" }]
    ])
  }
  world.idlePolicy = state
  world.tenants = [
    { displayName: `${tenantA} Demo`, slug: tenantA },
    { displayName: `${tenantB} Demo`, slug: tenantB }
  ]
  return state
}

export function setExplicitInvalidTimeout(
  world: TenantWorld,
  tenantId: string,
  choice: string
): void {
  ensureIdlePolicy(world).stored.set(tenantId, { kind: "invalid", raw: choice })
}

/** Stamp absolute `expiresAt` on the active idle contract session. */
export function setIdleAbsoluteDeadline(world: TenantWorld, deadline: string): void {
  const state = ensureIdleContract(world)
  const absoluteExpiresAt = parseIdleClock(deadline)
  state.absoluteExpiresAt = absoluteExpiresAt
  state.record = { ...state.record, expiresAt: absoluteExpiresAt }
  state.store.records.set(state.sessionId, state.record)
}

export function setPersistedTimeout(
  world: TenantWorld,
  tenantId: string,
  minutes: number
): void {
  ensureIdlePolicy(world).stored.set(tenantId, { kind: "valid", minutes })
}

function policySourceAvailable(state: IdlePolicyState): boolean {
  for (const value of state.stored.values()) {
    if (value.kind === "invalid") {
      return false
    }
  }
  return true
}
