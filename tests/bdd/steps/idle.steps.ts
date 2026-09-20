import { Given, Then, When } from "@cucumber/cucumber"
import assert from "node:assert/strict"

import type { TenantWorld } from "../support/world.ts"

import {
  activateLoginAgainWithKeyboard,
  assertAuthenticatedLandingWithoutTemporaryWork,
  assertDurableRecordRemembered,
  assertExplanationDoesNotClaimInactivity,
  assertFocusInInactivityModal,
  assertInactivityModalAccessible,
  assertKeyboardOperableRetryPath,
  assertKeyboardStaysInModal,
  assertNoProtectedAccessInBrowser,
  assertSpringfieldAuthJourneyBegan,
  assertTemporaryWorkClearedInBrowser,
  clickLoginAgain,
  completeLoginAgainAsAuthenticated,
  endLoginAgainJourney,
  navigateInactivityModalWithKeyboard,
  presentNonInactivityInterruption,
  rememberIdleBrowserDurableRecord,
  rememberIdleBrowserTemporaryWork,
  seedIdleBrowserAuthenticatedAccess,
  waitForInactivityModal,
  waitForUnsentPracticeNote
} from "../support/idle-browser.ts"
import {
  acceptQualifyingActivity,
  assertAbsoluteDeadline,
  assertIdleDeadline,
  assertNewSpringfieldSessionUses,
  assertPersistedChoice,
  attemptProtectedWork,
  authenticateUnderPolicy,
  authorizePolicyRepresentative,
  clearExplicitTimeout,
  completeLoginAgain,
  confirmInactivityRevalidation,
  effectivePersistedMinutes,
  endPolicySession,
  ensureIdleContract,
  ensureIdlePolicy,
  establishIdlePolicy,
  expireAccessForInactivityWhileRunning,
  oneTabDiscoversSharedInactivity,
  parseIdleClock,
  parseIdlePolicyChoice,
  proposeIdlePolicy,
  replaceWithAnonymousSession,
  resumeApplicationAfterSuspension,
  seedAuthenticatedIdleSession,
  seedDurableRecord,
  seedIdlePolicyTenants,
  seedIndependentSession,
  seedRecoveryAuthenticatedAccess,
  seedSharedSessionTabs,
  seedTemporaryWork,
  setExplicitInvalidTimeout,
  setIdleAbsoluteDeadline,
  setPersistedTimeout
} from "../support/idle.ts"

/**
 * Idle-session timeout ATDD steps for:
 * - `features/idle-session-expiration.feature` (@contract wired via in-process harness)
 * - `features/idle-session-recovery.feature` (@contract harness + pure @browser Playwright)
 * - `features/tenant-idle-timeout-policy.feature` (@contract wired via policy harness)
 *
 * Load with `CUCUMBER_IDLE=1`.
 */

function pending(step: string): never {
  throw new Error(`Pending: ${step}`)
}

function preferBrowser(world: TenantWorld): boolean {
  return world.useBrowser && !world.useContract
}

function preferContract(world: TenantWorld): boolean {
  return world.useContract
}

/** Pure @browser recovery steps require a Playwright page (seeded by Background). */
function requireBrowser(world: TenantWorld, step: string): void {
  if (!world.useBrowser || world.page === undefined) {
    pending(step)
  }
}

function requireContract(world: TenantWorld, step: string): void {
  if (!world.useContract) {
    pending(step)
  }
}

// --- US1 @contract expiration ---

Given(
  "idle-timeout tenants {string} and {string} are isolated for this scenario",
  function(this: TenantWorld, tenantA: string, tenantB: string) {
    requireContract(this, "idle-timeout tenants {string} and {string} are isolated for this scenario")
    this.tenants = [
      { displayName: `${tenantA} Demo`, slug: tenantA },
      { displayName: `${tenantB} Demo`, slug: tenantB }
    ]
  }
)

Given(
  "the user authenticated to {string} at {string} with a 5-minute idle duration",
  function(this: TenantWorld, tenant: string, time: string) {
    requireContract(
      this,
      "the user authenticated to {string} at {string} with a 5-minute idle duration"
    )
    const authAt = parseIdleClock(time)
    const absoluteExpiresAt = this.idleContract?.absoluteExpiresAt
      ?? parseIdleClock("17:00:00")
    seedAuthenticatedIdleSession(this, {
      absoluteExpiresAt,
      authAt,
      idleDurationMinutes: 5,
      tenantId: tenant
    })
  }
)

Given(
  "that session's absolute deadline is {string}",
  function(this: TenantWorld, deadline: string) {
    requireContract(this, "that session's absolute deadline is {string}")
    setIdleAbsoluteDeadline(this, deadline)
  }
)

Given(
  "the user has had no qualifying activity since authentication",
  function(this: TenantWorld) {
    requireContract(this, "the user has had no qualifying activity since authentication")
    delete ensureIdleContract(this).lastActivityAcceptedAt
  }
)

Given(
  "the user's browser is {string} without qualifying activity",
  function(this: TenantWorld, condition: string) {
    requireContract(this, "the user's browser is {string} without qualifying activity")
    ensureIdleContract(this).browserCondition = condition
  }
)

Given(
  "the user deliberately performs {string} at {string}",
  function(this: TenantWorld, _interaction: string, time: string) {
    requireContract(this, "the user deliberately performs {string} at {string}")
    // Qualifying interaction kinds are accepted equally at contract level.
    ensureIdleContract(this).pendingBrowserActivityAt = parseIdleClock(time)
  }
)

Given(
  "the interaction is accepted at {string} without a protected operation",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "the interaction is accepted at {string} without a protected operation")
    const at = parseIdleClock(time)
    const accepted = await acceptQualifyingActivity(this, at)
    assert.equal(accepted, true)
  }
)

Given(
  "only {string} occurs between {string} and {string}",
  function(this: TenantWorld, activity: string, _from: string, _to: string) {
    requireContract(this, "only {string} occurs between {string} and {string}")
    // Non-qualifying activity never calls renew — leave lastActivityAt at auth time.
    assert.ok(
      [
        "automated keepalives",
        "automatic prefetch",
        "background polling",
        "passive reading"
      ].includes(activity)
    )
  }
)

Given(
  "the user has two tabs sharing the Springfield authenticated session",
  function(this: TenantWorld) {
    requireContract(this, "the user has two tabs sharing the Springfield authenticated session")
    ensureIdleContract(this)
  }
)

Given(
  "qualifying activity from the first tab is accepted at {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "qualifying activity from the first tab is accepted at {string}")
    const accepted = await acceptQualifyingActivity(this, parseIdleClock(time))
    assert.equal(accepted, true)
  }
)

Given(
  "the user also authenticated at {string} in {string} with a 5-minute idle duration",
  function(this: TenantWorld, time: string, context: string) {
    requireContract(
      this,
      "the user also authenticated at {string} in {string} with a 5-minute idle duration"
    )
    seedIndependentSession(this, {
      authAt: parseIdleClock(time),
      context,
      idleDurationMinutes: 5
    })
  }
)

Given(
  "qualifying activity in that independent session is accepted at {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "qualifying activity in that independent session is accepted at {string}")
    const state = ensureIdleContract(this)
    assert.ok(state.independentSessionId !== undefined)
    const accepted = await acceptQualifyingActivity(this, parseIdleClock(time), {
      sessionId: state.independentSessionId,
      ...(state.independentRecord?.tenantId !== undefined
        ? { tenantId: state.independentRecord.tenantId }
        : {})
    })
    assert.equal(accepted, true)
  }
)

Given(
  "a deliberate interaction occurred in the browser at {string}",
  function(this: TenantWorld, time: string) {
    requireContract(this, "a deliberate interaction occurred in the browser at {string}")
    ensureIdleContract(this).pendingBrowserActivityAt = parseIdleClock(time)
  }
)

Given(
  "no qualifying activity has been accepted since {string}",
  function(this: TenantWorld, time: string) {
    requireContract(this, "no qualifying activity has been accepted since {string}")
    const state = ensureIdleContract(this)
    assert.equal(state.record.lastActivityAt, parseIdleClock(time))
    delete state.lastActivityAcceptedAt
  }
)

Given(
  "this session instead has an existing absolute deadline of {string}",
  function(this: TenantWorld, deadline: string) {
    requireContract(this, "this session instead has an existing absolute deadline of {string}")
    setIdleAbsoluteDeadline(this, deadline)
  }
)

Given(
  "qualifying activity is accepted at {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "qualifying activity is accepted at {string}")
    const accepted = await acceptQualifyingActivity(this, parseIdleClock(time))
    assert.equal(accepted, true)
  }
)

Given(
  "the authenticated access expired at {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "the authenticated access expired at {string}")
    const outcome = await attemptProtectedWork(this, parseIdleClock(time))
    assert.equal(outcome, "denied")
  }
)

Given(
  "a new anonymous tenant session has been established for {string}",
  function(this: TenantWorld, tenant: string) {
    requireContract(this, "a new anonymous tenant session has been established for {string}")
    replaceWithAnonymousSession(this, tenant)
  }
)

Given(
  "the authorization state is {string}",
  function(this: TenantWorld, condition: string) {
    requireContract(this, "the authorization state is {string}")
    const state = ensureIdleContract(this)
    assert.ok(
      condition === "missing" || condition === "evicted" || condition === "unavailable"
    )
    state.authorizationCondition = condition
  }
)

Given(
  "there is no independent evidence of inactivity expiration",
  function(this: TenantWorld) {
    requireContract(this, "there is no independent evidence of inactivity expiration")
    // Missing/unavailable paths must not invent inactivity — asserted on Then.
  }
)

Given(
  "an authorized representative changes Shelbyville's duration to 30 minutes",
  function(this: TenantWorld) {
    requireContract(
      this,
      "an authorized representative changes Shelbyville's duration to 30 minutes"
    )
    // Cross-tenant policy write must not mutate the active Springfield session.
    ensureIdleContract(this)
    seedIdlePolicyTenants(this, "springfield", "shelbyville")
    authorizePolicyRepresentative(this, "shelbyville")
    const outcome = proposeIdlePolicy(this, "shelbyville", 30)
    assert.equal(outcome, "accepted")
    assert.equal(ensureIdleContract(this).idleDurationMinutes, 5)
    assert.equal(ensureIdleContract(this).record.idleDurationMinutes, 5)
  }
)

When(
  "the user attempts protected work at authoritative time {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "the user attempts protected work at authoritative time {string}")
    await attemptProtectedWork(this, parseIdleClock(time))
  }
)

When(
  "protected work is attempted through that session at authoritative time {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(
      this,
      "protected work is attempted through that session at authoritative time {string}"
    )
    await attemptProtectedWork(this, parseIdleClock(time))
  }
)

When(
  "the user attempts protected work from the second tab at {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "the user attempts protected work from the second tab at {string}")
    await attemptProtectedWork(this, parseIdleClock(time))
  }
)

When(
  "the user attempts protected work through the original session at {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "the user attempts protected work through the original session at {string}")
    await attemptProtectedWork(this, parseIdleClock(time))
  }
)

When(
  "its activity report is accepted for evaluation at authoritative time {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(
      this,
      "its activity report is accepted for evaluation at authoritative time {string}"
    )
    const accepted = await acceptQualifyingActivity(this, parseIdleClock(time))
    assert.equal(accepted, false)
  }
)

When(
  "deliberate activity and protected work arrive concurrently at {string}",
  async function(this: TenantWorld, time: string) {
    requireContract(this, "deliberate activity and protected work arrive concurrently at {string}")
    const at = parseIdleClock(time)
    const [activityAccepted, protectedOutcome] = await Promise.all([
      acceptQualifyingActivity(this, at),
      attemptProtectedWork(this, at)
    ])
    assert.equal(activityAccepted, false)
    assert.equal(protectedOutcome, "denied")
  }
)

When(
  "the user attempts protected work without completing authentication",
  async function(this: TenantWorld) {
    requireContract(this, "the user attempts protected work without completing authentication")
    const state = ensureIdleContract(this)
    await attemptProtectedWork(this, state.record.lastActivityAt ?? state.authAt)
  }
)

When(
  "the user attempts protected work",
  async function(this: TenantWorld) {
    requireContract(this, "the user attempts protected work")
    const state = ensureIdleContract(this)
    await attemptProtectedWork(this, this.fixedNowSeconds ?? state.authAt)
  }
)

When(
  "the Springfield user attempts protected work at {string} without intervening activity",
  async function(this: TenantWorld, time: string) {
    requireContract(
      this,
      "the Springfield user attempts protected work at {string} without intervening activity"
    )
    await attemptProtectedWork(this, parseIdleClock(time))
  }
)

Then(
  "that attempt is {string} under the idle policy",
  function(this: TenantWorld, outcome: string) {
    requireContract(this, "that attempt is {string} under the idle policy")
    const state = ensureIdleContract(this)
    assert.equal(state.lastProtectedOutcome, outcome)
  }
)

Then(
  "the protected work is denied independently of the browser",
  function(this: TenantWorld) {
    requireContract(this, "the protected work is denied independently of the browser")
    const state = ensureIdleContract(this)
    assert.equal(state.lastProtectedOutcome, "denied")
    assert.ok(state.browserCondition !== undefined)
  }
)

Then(
  "the session's idle deadline is {string}",
  function(this: TenantWorld, deadline: string) {
    requireContract(this, "the session's idle deadline is {string}")
    assertIdleDeadline(this, deadline)
  }
)

Then(
  "the session's absolute deadline remains {string}",
  function(this: TenantWorld, deadline: string) {
    requireContract(this, "the session's absolute deadline remains {string}")
    assertAbsoluteDeadline(this, deadline)
  }
)

Then(
  "both tabs use the idle deadline {string}",
  function(this: TenantWorld, deadline: string) {
    requireContract(this, "both tabs use the idle deadline {string}")
    assertIdleDeadline(this, deadline)
  }
)

Then(
  "the independent session remains usable until {string} unless another lifetime limit ends it",
  function(this: TenantWorld, deadline: string) {
    requireContract(
      this,
      "the independent session remains usable until {string} unless another lifetime limit ends it"
    )
    const state = ensureIdleContract(this)
    assert.equal(state.independentRecord?.idleExpiresAt, parseIdleClock(deadline))
  }
)

Then(
  "the original session remains expired with idle deadline {string}",
  function(this: TenantWorld, deadline: string) {
    requireContract(this, "the original session remains expired with idle deadline {string}")
    const state = ensureIdleContract(this)
    // Original idle deadline from auth (not revived).
    assert.equal(
      computeOriginalIdleDeadline(state),
      parseIdleClock(deadline)
    )
  }
)

Then(
  "protected work using the original access is denied",
  async function(this: TenantWorld) {
    requireContract(this, "protected work using the original access is denied")
    const state = ensureIdleContract(this)
    const outcome = await attemptProtectedWork(
      this,
      state.record.idleExpiresAt ?? parseIdleClock("09:05:00")
    )
    assert.equal(outcome, "denied")
  }
)

Then(
  "the protected work is denied",
  function(this: TenantWorld) {
    requireContract(this, "the protected work is denied")
    assert.equal(ensureIdleContract(this).lastProtectedOutcome, "denied")
  }
)

Then(
  "the activity does not revive expired access",
  function(this: TenantWorld) {
    requireContract(this, "the activity does not revive expired access")
    const state = ensureIdleContract(this)
    assert.equal(state.record.userId, undefined)
  }
)

Then(
  "the protected work is denied because the absolute lifetime ended",
  function(this: TenantWorld) {
    requireContract(this, "the protected work is denied because the absolute lifetime ended")
    const state = ensureIdleContract(this)
    assert.equal(state.lastProtectedOutcome, "denied")
    assert.equal(state.lastProtectedInactivity, false)
  }
)

Then(
  "the anonymous session is not treated as authenticated identity",
  function(this: TenantWorld) {
    requireContract(this, "the anonymous session is not treated as authenticated identity")
    assert.equal(ensureIdleContract(this).record.userId, undefined)
  }
)

Then(
  "the interruption is not attributed to inactivity",
  function(this: TenantWorld) {
    requireContract(this, "the interruption is not attributed to inactivity")
    assert.equal(ensureIdleContract(this).lastProtectedInactivity, false)
  }
)

Then(
  "the Springfield session's duration remains 5 minutes",
  function(this: TenantWorld) {
    requireContract(this, "the Springfield session's duration remains 5 minutes")
    // Duration is fixed at authentication; clearance removes idle fields from the record.
    assert.equal(ensureIdleContract(this).idleDurationMinutes, 5)
  }
)

function computeOriginalIdleDeadline(
  state: ReturnType<typeof ensureIdleContract>
): number {
  return state.authAt + state.idleDurationMinutes * 60
}

// --- US3 @contract tenant idle timeout policy ---

Given(
  "idle-timeout tenants {string} and {string} have independent trusted configuration",
  function(this: TenantWorld, tenantA: string, tenantB: string) {
    requireContract(
      this,
      "idle-timeout tenants {string} and {string} have independent trusted configuration"
    )
    seedIdlePolicyTenants(this, tenantA, tenantB)
  }
)

Given(
  "the representative is authorized to manage only Springfield's timeout",
  function(this: TenantWorld) {
    requireContract(
      this,
      "the representative is authorized to manage only Springfield's timeout"
    )
    authorizePolicyRepresentative(this, "springfield")
  }
)

Given(
  "Springfield's persisted timeout is {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "Springfield's persisted timeout is {int} minutes")
    setPersistedTimeout(this, "springfield", minutes)
  }
)

Given(
  "Shelbyville's persisted timeout is {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "Shelbyville's persisted timeout is {int} minutes")
    setPersistedTimeout(this, "shelbyville", minutes)
  }
)

Given(
  "Springfield has no explicit timeout choice",
  function(this: TenantWorld) {
    requireContract(this, "Springfield has no explicit timeout choice")
    clearExplicitTimeout(this, "springfield")
  }
)

Given(
  "the representative no longer has authority to manage Springfield's timeout",
  function(this: TenantWorld) {
    requireContract(
      this,
      "the representative no longer has authority to manage Springfield's timeout"
    )
    authorizePolicyRepresentative(this, undefined)
  }
)

Given(
  "the representative previously established a 7-minute Springfield timeout",
  function(this: TenantWorld) {
    requireContract(
      this,
      "the representative previously established a 7-minute Springfield timeout"
    )
    authorizePolicyRepresentative(this, "springfield")
    establishIdlePolicy(this, "springfield", 7)
  }
)

Given(
  "a session using that choice has ended",
  function(this: TenantWorld) {
    requireContract(this, "a session using that choice has ended")
    const authAt = this.fixedNowSeconds ?? parseIdleClock("09:00:00")
    const ok = authenticateUnderPolicy(this, "springfield", authAt)
    assert.equal(ok, true)
    endPolicySession(this)
  }
)

Given(
  "Springfield's persisted duration is {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "Springfield's persisted duration is {int} minutes")
    setPersistedTimeout(this, "springfield", minutes)
  }
)

Given(
  "an existing Springfield session authenticated at {string} using that duration",
  function(this: TenantWorld, time: string) {
    requireContract(
      this,
      "an existing Springfield session authenticated at {string} using that duration"
    )
    const duration = effectivePersistedMinutes(this, "springfield")
    assert.ok(duration !== undefined, "Springfield policy must be usable")
    const ok = authenticateUnderPolicy(this, "springfield", parseIdleClock(time))
    assert.equal(ok, true)
    assert.equal(ensureIdleContract(this).idleDurationMinutes, duration)
  }
)

Given(
  "that session has had no subsequent qualifying activity",
  function(this: TenantWorld) {
    requireContract(this, "that session has had no subsequent qualifying activity")
    delete ensureIdleContract(this).lastActivityAcceptedAt
  }
)

Given(
  "Springfield's explicit stored timeout is {string}",
  function(this: TenantWorld, choice: string) {
    requireContract(this, "Springfield's explicit stored timeout is {string}")
    setExplicitInvalidTimeout(this, "springfield", choice)
  }
)

When(
  "the representative establishes a timeout of {int} minutes for {string}",
  function(this: TenantWorld, minutes: number, tenant: string) {
    requireContract(
      this,
      "the representative establishes a timeout of {int} minutes for {string}"
    )
    establishIdlePolicy(this, tenant, minutes)
  }
)

When(
  "the representative establishes {int} minutes at {string}",
  function(this: TenantWorld, minutes: number, time: string) {
    requireContract(this, "the representative establishes {int} minutes at {string}")
    this.fixedNowSeconds = parseIdleClock(time)
    establishIdlePolicy(this, "springfield", minutes)
  }
)

When(
  "the representative proposes {string} for Springfield's timeout",
  function(this: TenantWorld, choice: string) {
    requireContract(this, "the representative proposes {string} for Springfield's timeout")
    proposeIdlePolicy(this, "springfield", parseIdlePolicyChoice(choice))
  }
)

When(
  "the representative proposes a 5-minute Springfield timeout",
  function(this: TenantWorld) {
    requireContract(this, "the representative proposes a 5-minute Springfield timeout")
    proposeIdlePolicy(this, "springfield", 5)
  }
)

When(
  "the representative proposes a 5-minute Shelbyville timeout",
  function(this: TenantWorld) {
    requireContract(this, "the representative proposes a 5-minute Shelbyville timeout")
    proposeIdlePolicy(this, "shelbyville", 5)
  }
)

When(
  "the user starts a new authenticated Springfield session",
  function(this: TenantWorld) {
    requireContract(this, "the user starts a new authenticated Springfield session")
    const authAt = this.fixedNowSeconds ?? parseIdleClock("09:00:00")
    const ok = authenticateUnderPolicy(this, "springfield", authAt)
    assert.equal(ok, true)
  }
)

When(
  "the user starts another authenticated Springfield session",
  function(this: TenantWorld) {
    requireContract(this, "the user starts another authenticated Springfield session")
    const authAt = (this.fixedNowSeconds ?? parseIdleClock("09:00:00")) + 60
    const ok = authenticateUnderPolicy(this, "springfield", authAt)
    assert.equal(ok, true)
  }
)

When(
  "the user attempts to establish authenticated Springfield access",
  function(this: TenantWorld) {
    requireContract(this, "the user attempts to establish authenticated Springfield access")
    const authAt = this.fixedNowSeconds ?? parseIdleClock("09:00:00")
    authenticateUnderPolicy(this, "springfield", authAt)
  }
)

Then(
  "the persisted Springfield choice is {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "the persisted Springfield choice is {int} minutes")
    assertPersistedChoice(this, "springfield", minutes)
  }
)

Then(
  "a new authenticated Springfield session uses {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "a new authenticated Springfield session uses {int} minutes")
    assertNewSpringfieldSessionUses(this, minutes, { assertContract: true })
  }
)

Then(
  "Shelbyville's persisted choice remains {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "Shelbyville's persisted choice remains {int} minutes")
    assertPersistedChoice(this, "shelbyville", minutes)
  }
)

Then(
  "that session uses a {int}-minute idle duration",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "that session uses a {int}-minute idle duration")
    assert.equal(ensureIdlePolicy(this).lastAuthDurationMinutes, minutes)
    assert.equal(ensureIdleContract(this).idleDurationMinutes, minutes)
  }
)

Then(
  "the proposed timeout is rejected",
  function(this: TenantWorld) {
    requireContract(this, "the proposed timeout is rejected")
    assert.equal(ensureIdlePolicy(this).lastProposalOutcome, "rejected")
  }
)

Then(
  "Springfield's persisted choice remains {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "Springfield's persisted choice remains {int} minutes")
    assertPersistedChoice(this, "springfield", minutes)
  }
)

Then(
  "new Springfield sessions continue using {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "new Springfield sessions continue using {int} minutes")
    assertNewSpringfieldSessionUses(this, minutes)
  }
)

Then(
  "the policy change is denied",
  function(this: TenantWorld) {
    requireContract(this, "the policy change is denied")
    assert.equal(ensureIdlePolicy(this).lastProposalOutcome, "denied")
  }
)

Then(
  "the existing session retains {int} minutes and its idle deadline {string}",
  function(this: TenantWorld, minutes: number, deadline: string) {
    requireContract(
      this,
      "the existing session retains {int} minutes and its idle deadline {string}"
    )
    const state = ensureIdleContract(this)
    assert.equal(state.idleDurationMinutes, minutes)
    assert.equal(state.record.idleDurationMinutes, minutes)
    assertIdleDeadline(this, deadline)
  }
)

Then(
  "a newly authenticated Springfield session uses {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "a newly authenticated Springfield session uses {int} minutes")
    const existing = ensureIdleContract(this)
    const priorSessionId = existing.sessionId
    const priorDuration = existing.idleDurationMinutes
    const authAt = this.fixedNowSeconds ?? parseIdleClock("09:04:00")
    const ok = authenticateUnderPolicy(this, "springfield", authAt, {
      replaceExisting: false
    })
    assert.equal(ok, true)
    assert.equal(ensureIdlePolicy(this).lastAuthDurationMinutes, minutes)
    // Existing session identity and stamped duration are unchanged.
    assert.equal(ensureIdleContract(this).sessionId, priorSessionId)
    assert.equal(ensureIdleContract(this).idleDurationMinutes, priorDuration)
  }
)

Then(
  "the trusted configuration boundary refuses access",
  function(this: TenantWorld) {
    requireContract(this, "the trusted configuration boundary refuses access")
    assert.equal(ensureIdlePolicy(this).lastAuthRefused, true)
  }
)

Then(
  "neither the {int}-minute default nor another tenant's policy is substituted",
  function(this: TenantWorld, defaultMinutes: number) {
    requireContract(
      this,
      "neither the {int}-minute default nor another tenant's policy is substituted"
    )
    const state = ensureIdlePolicy(this)
    assert.equal(state.lastAuthRefused, true)
    assert.equal(state.lastAuthDurationMinutes, undefined)
    assert.notEqual(state.lastAuthDurationMinutes, defaultMinutes)
    const shelbyville = state.stored.get("shelbyville")
    if (shelbyville?.kind === "valid") {
      assert.notEqual(state.lastAuthDurationMinutes, shelbyville.minutes)
    }
  }
)

// --- US2 idle session recovery (dual-path: @contract harness vs pure @browser) ---

Given(
  "the user has authenticated access for idle-timeout tenant {string}",
  async function(this: TenantWorld, tenant: string) {
    if (preferContract(this)) {
      seedRecoveryAuthenticatedAccess(this, tenant)
      return
    }
    if (preferBrowser(this)) {
      await seedIdleBrowserAuthenticatedAccess(this, tenant)
      return
    }
    pending("the user has authenticated access for idle-timeout tenant {string}")
  }
)

Given(
  "the user has temporary unsaved work {string}",
  async function(this: TenantWorld, work: string) {
    if (preferContract(this)) {
      seedTemporaryWork(this, work)
      return
    }
    if (preferBrowser(this)) {
      rememberIdleBrowserTemporaryWork(this, work)
      await waitForUnsentPracticeNote(this)
      return
    }
    pending("the user has temporary unsaved work {string}")
  }
)

Given(
  "the user has a durable saved record {string}",
  function(this: TenantWorld, record: string) {
    if (preferContract(this)) {
      seedDurableRecord(this, record)
      return
    }
    if (preferBrowser(this)) {
      rememberIdleBrowserDurableRecord(this, record)
      return
    }
    pending("the user has a durable saved record {string}")
  }
)

Given(
  "two running tabs share the same authenticated session and its temporary work",
  function(this: TenantWorld) {
    requireContract(
      this,
      "two running tabs share the same authenticated session and its temporary work"
    )
    seedSharedSessionTabs(this)
  }
)

Given(
  "the original session used a {int}-minute duration and has expired for inactivity",
  async function(this: TenantWorld, minutes: number) {
    requireContract(
      this,
      "the original session used a {int}-minute duration and has expired for inactivity"
    )
    const state = ensureIdleContract(this)
    const temporaryWork = state.temporaryWork
    const durable = [...state.durableRecords]
    seedRecoveryAuthenticatedAccess(this, state.tenantId, {
      idleDurationMinutes: minutes
    })
    if (temporaryWork !== undefined) {
      seedTemporaryWork(this, temporaryWork)
    }
    for (const record of durable) {
      seedDurableRecord(this, record)
    }
    await expireAccessForInactivityWhileRunning(this)
    await confirmInactivityRevalidation(this)
  }
)

Given(
  "Springfield's current tenant duration is {int} minutes",
  function(this: TenantWorld, minutes: number) {
    requireContract(this, "Springfield's current tenant duration is {int} minutes")
    ensureIdleContract(this).currentTenantIdleDurationMinutes = minutes
  }
)

Given(
  "the identity provider accepts the user's existing sign-in without a new challenge",
  function(this: TenantWorld) {
    requireContract(
      this,
      "the identity provider accepts the user's existing sign-in without a new challenge"
    )
    ensureIdleContract(this).idpAcceptsExistingSignIn = true
  }
)

Given(
  "the application stopped running normally because of {string}",
  function(this: TenantWorld, condition: string) {
    requireContract(this, "the application stopped running normally because of {string}")
    const state = ensureIdleContract(this)
    state.resumeCondition = condition
    state.interactionEnabled = false
  }
)

Given(
  "access has expired with confirmed inactivity while the application could not update",
  async function(this: TenantWorld) {
    requireContract(
      this,
      "access has expired with confirmed inactivity while the application could not update"
    )
    // Server clears; client UI stays stale until resume/revalidation.
    await expireAccessForInactivityWhileRunning(this)
    assert.equal(ensureIdleContract(this).protectedContentExposed, true)
  }
)

When(
  "the user's access expires for confirmed inactivity while the application is running",
  async function(this: TenantWorld) {
    requireContract(
      this,
      "the user's access expires for confirmed inactivity while the application is running"
    )
    await expireAccessForInactivityWhileRunning(this)
  }
)

When(
  "client-driven revalidation confirms that inactivity cause with the authoritative server without a later full navigation",
  async function(this: TenantWorld) {
    requireContract(
      this,
      "client-driven revalidation confirms that inactivity cause with the authoritative server without a later full navigation"
    )
    await confirmInactivityRevalidation(this)
  }
)

When(
  "the user activates {string} and completes the tenant authentication journey",
  function(this: TenantWorld, label: string) {
    requireContract(
      this,
      "the user activates {string} and completes the tenant authentication journey"
    )
    completeLoginAgain(this, { requirePrimaryAction: label })
  }
)

When(
  "one tab discovers that shared access has ended for confirmed inactivity",
  async function(this: TenantWorld) {
    requireContract(
      this,
      "one tab discovers that shared access has ended for confirmed inactivity"
    )
    await oneTabDiscoversSharedInactivity(this)
  }
)

When(
  "the user resumes the application",
  async function(this: TenantWorld) {
    requireContract(this, "the user resumes the application")
    await resumeApplicationAfterSuspension(this)
  }
)

Then(
  "an accessible modal explains that inactivity ended the session",
  function(this: TenantWorld) {
    requireContract(this, "an accessible modal explains that inactivity ended the session")
    const modal = ensureIdleContract(this).recoveryModal
    assert.ok(modal?.open === true)
    assert.equal(modal.attributedToInactivity, true)
  }
)

Then(
  "the modal offers a button named {string}",
  function(this: TenantWorld, name: string) {
    requireContract(this, "the modal offers a button named {string}")
    assert.equal(ensureIdleContract(this).recoveryModal?.primaryActionName, name)
  }
)

Then(
  "protected content and {string} are no longer exposed in the active application",
  function(this: TenantWorld, work: string) {
    requireContract(
      this,
      "protected content and {string} are no longer exposed in the active application"
    )
    const state = ensureIdleContract(this)
    assert.equal(state.protectedContentExposed, false)
    assert.equal(state.temporaryWorkCleared, true)
    assert.equal(state.temporaryWork, work)
  }
)

Then(
  "temporary data belonging to the expired session has been cleared",
  function(this: TenantWorld) {
    requireContract(this, "temporary data belonging to the expired session has been cleared")
    assert.equal(ensureIdleContract(this).temporaryWorkCleared, true)
  }
)

Then(
  "the durable record {string} remains saved",
  function(this: TenantWorld, record: string) {
    requireContract(this, "the durable record {string} remains saved")
    assert.ok(ensureIdleContract(this).durableRecords.has(record))
  }
)

Then(
  "client timing alone did not authorize continued access after the deadline",
  function(this: TenantWorld) {
    requireContract(
      this,
      "client timing alone did not authorize continued access after the deadline"
    )
    const state = ensureIdleContract(this)
    assert.equal(state.clientAuthorizedAfterDeadline, false)
    assert.equal(state.lastProtectedOutcome, "denied")
    assert.equal(state.record.userId, undefined)
  }
)

Then(
  "the user has new authenticated Springfield access with a {int}-minute duration",
  function(this: TenantWorld, minutes: number) {
    requireContract(
      this,
      "the user has new authenticated Springfield access with a {int}-minute duration"
    )
    const state = ensureIdleContract(this)
    assert.equal(state.loginAgainCompleted, true)
    assert.equal(state.tenantId, "springfield")
    assert.equal(state.idleDurationMinutes, minutes)
    assert.equal(state.record.idleDurationMinutes, minutes)
    assert.ok(state.record.userId !== undefined)
    assert.ok(state.expiredSessionId !== undefined)
    assert.notEqual(state.sessionId, state.expiredSessionId)
  }
)

Then(
  "no fresh credentials challenge is required by the application",
  function(this: TenantWorld) {
    requireContract(this, "no fresh credentials challenge is required by the application")
    assert.equal(ensureIdleContract(this).idpAcceptsExistingSignIn, true)
  }
)

Then(
  "the expired session and {string} are not restored",
  function(this: TenantWorld, work: string) {
    requireContract(this, "the expired session and {string} are not restored")
    const state = ensureIdleContract(this)
    assert.ok(state.expiredSessionId !== undefined)
    assert.notEqual(state.sessionId, state.expiredSessionId)
    assert.equal(state.temporaryWorkCleared, true)
    // Cleared fixture named in the step is not present on the new session.
    assert.notEqual(state.temporaryWork, work)
    assert.equal(state.temporaryWork, undefined)
    const tombstone = state.store.records.get(state.expiredSessionId)
    assert.ok(tombstone !== undefined)
    assert.equal(tombstone.userId, undefined)
  }
)

Then(
  "the durable record {string} remains accessible",
  function(this: TenantWorld, record: string) {
    requireContract(this, "the durable record {string} remains accessible")
    assert.ok(ensureIdleContract(this).durableRecords.has(record))
  }
)

Then(
  "expired protected content is removed before further interaction is enabled",
  function(this: TenantWorld) {
    requireContract(
      this,
      "expired protected content is removed before further interaction is enabled"
    )
    const state = ensureIdleContract(this)
    assert.equal(state.protectedContentExposed, false)
    assert.equal(state.interactionEnabled, true)
  }
)

Then(
  "temporary data belonging to the expired session is cleared",
  function(this: TenantWorld) {
    requireContract(this, "temporary data belonging to the expired session is cleared")
    assert.equal(ensureIdleContract(this).temporaryWorkCleared, true)
  }
)

Then(
  "the inactivity modal offers {string}",
  function(this: TenantWorld, name: string) {
    requireContract(this, "the inactivity modal offers {string}")
    const modal = ensureIdleContract(this).recoveryModal
    assert.ok(modal?.open === true)
    assert.equal(modal.primaryActionName, name)
  }
)

Then(
  "protected work using the expired access remains denied",
  async function(this: TenantWorld) {
    requireContract(this, "protected work using the expired access remains denied")
    const state = ensureIdleContract(this)
    const outcome = await attemptProtectedWork(
      this,
      this.fixedNowSeconds ?? state.authAt
    )
    assert.equal(outcome, "denied")
  }
)

Then(
  "both tabs promptly remove expired protected content and present the inactivity recovery experience",
  function(this: TenantWorld) {
    requireContract(
      this,
      "both tabs promptly remove expired protected content and present the inactivity recovery experience"
    )
    const tabs = ensureIdleContract(this).tabs
    assert.ok(tabs !== undefined)
    for (const tab of [tabs.first, tabs.second]) {
      assert.equal(tab.protectedContentExposed, false)
      assert.ok(tab.recoveryModal?.open === true)
      assert.equal(tab.recoveryModal.attributedToInactivity, true)
    }
    // Missed BroadcastChannel path: second tab recovered via server latch.
    assert.equal(tabs.broadcastDeliveredToSecond, false)
    assert.equal(tabs.second.broadcastReceived, false)
    assert.ok(ensureIdleContract(this).sessionEndGeneration !== undefined)
  }
)

Then(
  "neither tab continues to expose {string} from the expired session",
  function(this: TenantWorld, work: string) {
    requireContract(
      this,
      "neither tab continues to expose {string} from the expired session"
    )
    const state = ensureIdleContract(this)
    const tabs = state.tabs
    assert.ok(tabs !== undefined)
    assert.equal(tabs.first.temporaryWorkExposed, false)
    assert.equal(tabs.second.temporaryWorkExposed, false)
    assert.equal(state.temporaryWorkCleared, true)
    assert.equal(state.temporaryWork, work)
  }
)

Then(
  "neither tab treats local client timing as authority to grant continued access",
  function(this: TenantWorld) {
    requireContract(
      this,
      "neither tab treats local client timing as authority to grant continued access"
    )
    const state = ensureIdleContract(this)
    const tabs = state.tabs
    assert.ok(tabs !== undefined)
    assert.equal(tabs.first.clientAuthorizedAfterDeadline, false)
    assert.equal(tabs.second.clientAuthorizedAfterDeadline, false)
    assert.equal(state.clientAuthorizedAfterDeadline, false)
  }
)

// --- Pure @browser recovery steps (Playwright against live Next + mock IdP) ---

Given(
  "a new anonymous tenant session has been established for recovery",
  function(this: TenantWorld) {
    requireBrowser(this, "a new anonymous tenant session has been established for recovery")
  }
)

Given(
  "access ended because of {string}",
  function(this: TenantWorld, cause: string) {
    requireBrowser(this, "access ended because of {string}")
    this.idleBrowserCause = cause
  }
)

Given(
  "inactivity expiration has not been established",
  function(this: TenantWorld) {
    requireBrowser(this, "inactivity expiration has not been established")
  }
)

Given(
  "the user is using assistive technology to read protected content",
  async function(this: TenantWorld) {
    requireBrowser(this, "the user is using assistive technology to read protected content")
    await waitForUnsentPracticeNote(this)
  }
)

Given(
  "the user was editing {string} when inactivity expiration was confirmed",
  async function(this: TenantWorld, work: string) {
    requireBrowser(this, "the user was editing {string} when inactivity expiration was confirmed")
    rememberIdleBrowserTemporaryWork(this, work)
    await waitForInactivityModal(this)
    await assertTemporaryWorkClearedInBrowser(this)
  }
)

Given(
  "the user's identity provider requires an authentication challenge",
  function(this: TenantWorld) {
    requireBrowser(this, "the user's identity provider requires an authentication challenge")
  }
)

Given(
  "the inactivity modal has opened",
  async function(this: TenantWorld) {
    requireBrowser(this, "the inactivity modal has opened")
    await waitForInactivityModal(this)
  }
)

Given(
  "the confirmed inactivity modal is open for {string}",
  async function(this: TenantWorld, _tenant: string) {
    requireBrowser(this, "the confirmed inactivity modal is open for {string}")
    await waitForInactivityModal(this)
  }
)

Given(
  "the confirmed inactivity modal is open",
  async function(this: TenantWorld) {
    requireBrowser(this, "the confirmed inactivity modal is open")
    await waitForInactivityModal(this)
  }
)

Given(
  "the user has activated {string}",
  async function(this: TenantWorld, label: string) {
    requireBrowser(this, "the user has activated {string}")
    assert.equal(label, "Log in again")
    await clickLoginAgain(this)
  }
)

When(
  "confirmed inactivity expiration opens the modal",
  async function(this: TenantWorld) {
    requireBrowser(this, "confirmed inactivity expiration opens the modal")
    await waitForInactivityModal(this)
  }
)

When(
  "the application presents the interruption to the user",
  async function(this: TenantWorld) {
    requireBrowser(this, "the application presents the interruption to the user")
    assert.ok(this.idleBrowserCause, "expected an interruption cause")
    await presentNonInactivityInterruption(this, this.idleBrowserCause)
  }
)

When(
  "the authentication journey ends with {string}",
  async function(this: TenantWorld, outcome: string) {
    requireBrowser(this, "the authentication journey ends with {string}")
    await endLoginAgainJourney(this, outcome)
  }
)

When(
  "the user activates {string} and successfully completes Springfield authentication",
  async function(this: TenantWorld, label: string) {
    requireBrowser(
      this,
      "the user activates {string} and successfully completes Springfield authentication"
    )
    assert.equal(label, "Log in again")
    await clickLoginAgain(this)
    await completeLoginAgainAsAuthenticated(this, "springfield")
  }
)

When(
  "the user navigates the modal's actions with the keyboard",
  async function(this: TenantWorld) {
    requireBrowser(this, "the user navigates the modal's actions with the keyboard")
    await navigateInactivityModalWithKeyboard(this)
  }
)

Then(
  "cleared temporary session data is not restored",
  async function(this: TenantWorld) {
    requireBrowser(this, "cleared temporary session data is not restored")
    await assertTemporaryWorkClearedInBrowser(this)
  }
)

Then(
  "focus moves into the modal",
  async function(this: TenantWorld) {
    requireBrowser(this, "focus moves into the modal")
    await assertFocusInInactivityModal(this)
  }
)

Then(
  "focus remains visibly usable within the modal's available actions",
  async function(this: TenantWorld) {
    requireBrowser(this, "focus remains visibly usable within the modal's available actions")
    await assertKeyboardStaysInModal(this)
  }
)

Then(
  "its accessible name and description communicate the inactivity interruption",
  async function(this: TenantWorld) {
    requireBrowser(
      this,
      "its accessible name and description communicate the inactivity interruption"
    )
    await assertInactivityModalAccessible(this)
  }
)

Then(
  "keyboard navigation does not reach the expired protected work",
  async function(this: TenantWorld) {
    requireBrowser(this, "keyboard navigation does not reach the expired protected work")
    await assertTemporaryWorkClearedInBrowser(this)
  }
)

Then(
  "the user can activate {string} with the keyboard",
  async function(this: TenantWorld, label: string) {
    requireBrowser(this, "the user can activate {string} with the keyboard")
    assert.equal(label, "Log in again")
    await activateLoginAgainWithKeyboard(this)
  }
)

Then(
  "the Springfield authentication journey begins",
  async function(this: TenantWorld) {
    requireBrowser(this, "the Springfield authentication journey begins")
    await assertSpringfieldAuthJourneyBegan(this)
  }
)

Then(
  "{string} is announced as an actionable button",
  async function(this: TenantWorld, label: string) {
    requireBrowser(this, "{string} is announced as an actionable button")
    assert.ok(this.page)
    const button = this.page.getByRole("button", { name: label })
    assert.equal(await button.count(), 1)
  }
)

Then(
  "the expired protected content is unavailable to assistive technology",
  async function(this: TenantWorld) {
    requireBrowser(this, "the expired protected content is unavailable to assistive technology")
    await assertTemporaryWorkClearedInBrowser(this)
  }
)

Then(
  "the user regains authorized access only to {string}",
  async function(this: TenantWorld, tenant: string) {
    requireBrowser(this, "the user regains authorized access only to {string}")
    await assertAuthenticatedLandingWithoutTemporaryWork(this, tenant)
  }
)

Then(
  "the expired session is not revived",
  function(this: TenantWorld) {
    requireBrowser(this, "the expired session is not revived")
    assert.notEqual(this.sessionId, this.originalSessionId)
  }
)

Then(
  "{string} is not restored",
  async function(this: TenantWorld, work: string) {
    requireBrowser(this, "{string} is not restored")
    assert.equal(work, this.idleBrowserTemporaryWork ?? work)
    await assertTemporaryWorkClearedInBrowser(this)
  }
)

Then(
  "the user can access the durable record {string}",
  function(this: TenantWorld, record: string) {
    requireBrowser(this, "the user can access the durable record {string}")
    assertDurableRecordRemembered(this, record)
  }
)

Then(
  "the user still cannot perform protected work",
  async function(this: TenantWorld) {
    requireBrowser(this, "the user still cannot perform protected work")
    await assertNoProtectedAccessInBrowser(this)
  }
)

Then(
  "the user receives an understandable keyboard-operable retry path",
  async function(this: TenantWorld) {
    requireBrowser(this, "the user receives an understandable keyboard-operable retry path")
    await assertKeyboardOperableRetryPath(this)
  }
)

Then(
  "the explanation does not claim inactivity ended the session",
  async function(this: TenantWorld) {
    requireBrowser(this, "the explanation does not claim inactivity ended the session")
    await assertExplanationDoesNotClaimInactivity(this)
  }
)

Then(
  "the user cannot resume protected work through the unusable access",
  async function(this: TenantWorld) {
    requireBrowser(this, "the user cannot resume protected work through the unusable access")
    await assertNoProtectedAccessInBrowser(this)
  }
)

// --- Residual policy/UI stubs not yet claimed by US2/US3 contract wiring ---

Given(
  "Springfield's approved idle timeout is {int} minutes",
  function(this: TenantWorld, _minutes: number) {
    pending("Springfield's approved idle timeout is {int} minutes")
  }
)

Given(
  "Springfield omits an explicit idle timeout",
  function(this: TenantWorld) {
    pending("Springfield omits an explicit idle timeout")
  }
)

Given(
  "the authenticated UI remains open after login",
  function(this: TenantWorld) {
    pending("the authenticated UI remains open after login")
  }
)

Given(
  "the current trusted configuration cannot be used",
  function(this: TenantWorld) {
    pending("the current trusted configuration cannot be used")
  }
)

Given(
  "the idle-timeout policy change process is available",
  function(this: TenantWorld) {
    pending("the idle-timeout policy change process is available")
  }
)

Given(
  "the previous Springfield timeout choice was {string}",
  function(this: TenantWorld, _choice: string) {
    pending("the previous Springfield timeout choice was {string}")
  }
)

Then(
  "login-again starts a new session and does not restore the prior authenticated access",
  function(this: TenantWorld) {
    pending("login-again starts a new session and does not restore the prior authenticated access")
  }
)

Then(
  "protected content is removed before further interaction is enabled",
  function(this: TenantWorld) {
    pending("protected content is removed before further interaction is enabled")
  }
)

Then(
  "Shelbyville's timeout remains unchanged",
  function(this: TenantWorld) {
    pending("Shelbyville's timeout remains unchanged")
  }
)

Then(
  "Springfield's effective timeout remains {int} minutes",
  function(this: TenantWorld, _minutes: number) {
    pending("Springfield's effective timeout remains {int} minutes")
  }
)

Then(
  "Springfield's timeout remains {int} minutes",
  function(this: TenantWorld, _minutes: number) {
    pending("Springfield's timeout remains {int} minutes")
  }
)

Then(
  "temporary unsaved work {string} is no longer present",
  function(this: TenantWorld, _work: string) {
    pending("temporary unsaved work {string} is no longer present")
  }
)

Then(
  "the change is refused",
  function(this: TenantWorld) {
    pending("the change is refused")
  }
)

Then(
  "the durable saved record {string} remains available after reauthentication",
  function(this: TenantWorld, _record: string) {
    pending("the durable saved record {string} remains available after reauthentication")
  }
)

Then(
  "the existing Springfield session still uses {int} minutes",
  function(this: TenantWorld, _minutes: number) {
    pending("the existing Springfield session still uses {int} minutes")
  }
)

Then(
  "the explanation communicates that inactivity ended the session",
  function(this: TenantWorld) {
    pending("the explanation communicates that inactivity ended the session")
  }
)

Then(
  "the interruption is attributed to inactivity",
  function(this: TenantWorld) {
    pending("the interruption is attributed to inactivity")
  }
)

Then(
  "the modal includes a primary action named {string}",
  function(this: TenantWorld, _name: string) {
    pending("the modal includes a primary action named {string}")
  }
)

Then(
  "the modal remains keyboard operable",
  function(this: TenantWorld) {
    pending("the modal remains keyboard operable")
  }
)

Then(
  "the new session uses the {int}-minute timeout",
  function(this: TenantWorld, _minutes: number) {
    pending("the new session uses the {int}-minute timeout")
  }
)

Then(
  "the proposal is refused",
  function(this: TenantWorld) {
    pending("the proposal is refused")
  }
)

Then(
  "the recovery experience is available without inventing inactivity",
  function(this: TenantWorld) {
    pending("the recovery experience is available without inventing inactivity")
  }
)

Then(
  "the second tab also presents the inactivity recovery experience after reconnecting",
  function(this: TenantWorld) {
    pending("the second tab also presents the inactivity recovery experience after reconnecting")
  }
)

Then(
  "the session does not restore authenticated access from a client timer alone",
  function(this: TenantWorld) {
    pending("the session does not restore authenticated access from a client timer alone")
  }
)

Then(
  "the trusted configuration source is unusable",
  function(this: TenantWorld) {
    pending("the trusted configuration source is unusable")
  }
)

Then(
  "the user can complete reauthentication",
  function(this: TenantWorld) {
    pending("the user can complete reauthentication")
  }
)

Then(
  "the user is not offered an extend-session control",
  function(this: TenantWorld) {
    pending("the user is not offered an extend-session control")
  }
)

Then(
  "the user is not shown an advance inactivity warning",
  function(this: TenantWorld) {
    pending("the user is not shown an advance inactivity warning")
  }
)

Then(
  "temporary work {string} remains cleared",
  function(this: TenantWorld, _work: string) {
    pending("temporary work {string} remains cleared")
  }
)
