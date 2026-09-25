# Property-based testing with fast-check

Use this guide to turn a general rule into a test that searches for counterexamples. Start with
[Testing as evidence](README.md) to decide which expectation deserves protection and where it belongs.
The examples use existing frontend session helpers; they are documentation, not an installed property-test suite.

## State the property before generating data

An example says what should happen for a selected case. A property states a relationship that should hold for every
input in a defined domain, under explicit preconditions. For example: for every authenticated session with a valid
idle policy, recording qualifying activity preserves its absolute expiry.

A property test combines three things:

- **An arbitrary:** fast-check's description of how to generate inputs and shrink them toward simpler inputs.
- **A predicate or assertion:** the observable rule those inputs must satisfy.
- **A runner:** `fc.assert` generates cases, checks the property, and reports a failure if it finds one.

A failing input is a counterexample. Shrinking searches for a simpler input that still fails; it does not guarantee
the globally smallest counterexample. A passing finite run supports the property over the cases explored. It does
not prove the universal statement or compensate for a generator that excludes important states.

## Find laws in the contract

Begin with a consumer, the conditions they rely on, and a violation that matters. Then consider these patterns:

| Pattern           | Question to ask                                                   | Condition to define                                                   |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Preservation      | What must remain unchanged through this operation?                | Which fields or semantic facts are protected?                         |
| Round trip        | Does decoding an encoded value recover its meaning?               | What counts as equivalent, including generated IDs and normalization? |
| Idempotence       | Should applying an operation twice have the same meaning as once? | Is repeating the operation actually intended to be harmless?          |
| Relationships     | How should output change when input changes in a known way?       | Which other inputs and assumptions remain fixed?                      |
| State transitions | Which transitions are permitted or forbidden?                     | What state and history make the transition valid?                     |

These are prompts, not laws to impose on every function. Inactivity termination increments a generation latch;
assuming the entire result is idempotent would contradict that contract. A round trip can also pass when encoder
and decoder share the same mistake. Add independent contract examples when interoperability matters.

Prefer interfaces that make important rules accessible: explicit inputs and outputs, supplied time rather than a
hidden wall clock, controlled dependencies, and small operations that can be exercised independently. Keep effects
at appropriate boundaries without forcing all implementations to be pure. Fresh state and resource cleanup matter
just as much when testing an effectful operation.

Follow [Effect guidance](../effect-guidance.md) and the owning workspace's instructions for Effect examples. This
guide does not introduce `@effect/vitest` or another runner. Frontend session logic stays in the frontend; backend
domain rules and durable storage stay in the backend, as described in [domain persistence](../../domain-persistence.md).

## Run a property in the frontend suite

The frontend workspace declares `fast-check` and `@fast-check/vitest` as direct development dependencies. Import
property tests from the Vitest connector so timeouts and lifecycle hooks stay aligned with the runner. Do not import
fast-check through Effect, a package-manager store path, or an accidental hoist.

```ts
import { fc, test } from "@fast-check/vitest"
import { expect } from "vitest"

test.prop([fc.string(), fc.string()])("concatenation keeps both parts in order", (left, right) => {
  const text = left + right

  expect(text.startsWith(left)).toBe(true)
  expect(text.endsWith(right)).toBe(true)
})
```

Vitest globals stay off, so import `expect` from `vitest`. The connector's `test` and `it` replace Vitest's own for
tests that use `.prop`; ordinary examples can keep importing `it` from `vitest`. The existing configuration already
discovers `tests/unit/**/*.test.ts` in a Node environment. A connector smoke check lives in
`packages/frontend/tests/unit/fast-check-vitest.test.ts`. Run it with:

```sh
pnpm --filter @pathableai/pre-ets-frontend test:unit -- tests/unit/fast-check-vitest.test.ts
```

The session walkthrough below is an illustration of properties, not an installed suite. When you adopt one of those
claims, put it in `packages/frontend/tests/unit/` and run it through the same connector.

## Walkthrough: session invariants

The [session contract](../../session-state.md) distinguishes absolute expiry from the renewable idle deadline.
The [helpers](../../../packages/frontend/src/lib/session/idle.ts) expose three useful claims:

1. Qualifying activity preserves absolute expiry, tenant identity, and the configured idle duration.
2. Ending authentication for inactivity removes authentication/idle fields and preserves tenant identity and absolute expiry.
3. If idle and absolute deadlines coincide, classification is `idle` at and after that instant.

Construct a valid authenticated record rather than generating unrelated timestamps and discarding most combinations.
Here, all generated records have positive integer Unix seconds, a 5–30 minute policy, and synthetic identities.
The bounded time range leaves ample room for arithmetic. The small identity set is adequate for these preservation
claims; it does not exercise all tenant-slug or identity validation rules.

```ts
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { SessionRecord } from "../../src/lib/session/types.ts"

import {
  classifyAccessEnd,
  endAuthenticatedForInactivity,
  stampQualifyingActivity
} from "../../src/lib/session/idle.ts"

const authenticatedSessionArb = fc.record({
  idleDurationMinutes: fc.integer({ min: 5, max: 30 }),
  lastActivityAt: fc.integer({ min: 1_600_000_000, max: 2_000_000_000 }),
  tenantId: fc.constantFrom("springfield", "shelbyville"),
  userId: fc.constantFrom("synthetic-user-1", "synthetic-user-2")
}).map((input) => ({
  ...input,
  expiresAt: input.lastActivityAt + 86_400,
  idleExpiresAt: input.lastActivityAt + input.idleDurationMinutes * 60,
  userName: "Synthetic User"
} satisfies SessionRecord))

describe("session properties", () => {
  it("qualifying activity preserves absolute expiry, tenant, and idle policy", () => {
    fc.assert(fc.property(
      authenticatedSessionArb,
      fc.integer({ min: 1, max: 299 }),
      (record, elapsed) => {
        // Strictly before even the shortest supported idle timeout.
        const now = record.lastActivityAt + elapsed
        const renewed = stampQualifyingActivity(record, now)

        expect(renewed.expiresAt).toBe(record.expiresAt)
        expect(renewed.tenantId).toBe(record.tenantId)
        expect(renewed.idleDurationMinutes).toBe(record.idleDurationMinutes)
      }
    ))
  })

  it("inactivity removes authentication and idle fields while preserving tenant and absolute expiry", () => {
    fc.assert(fc.property(authenticatedSessionArb, (record) => {
      const ended = endAuthenticatedForInactivity(record)

      expect(ended.expiresAt).toBe(record.expiresAt)
      expect(ended.tenantId).toBe(record.tenantId)
      expect(ended.accessEndedCause).toBe("inactivity")
      expect(ended).not.toHaveProperty("userId")
      expect(ended).not.toHaveProperty("userName")
      expect(ended).not.toHaveProperty("idleDurationMinutes")
      expect(ended).not.toHaveProperty("idleExpiresAt")
      expect(ended).not.toHaveProperty("lastActivityAt")
    }))
  })

  it("equal deadlines classify as idle at and after expiry", () => {
    fc.assert(fc.property(
      authenticatedSessionArb,
      fc.integer({ min: 1, max: 86_400 }),
      (record, later) => {
        const equalDeadlines = { ...record, expiresAt: record.idleExpiresAt }
        const deadline = equalDeadlines.expiresAt

        expect(classifyAccessEnd(deadline - 1, equalDeadlines)).toBe("still-valid")
        expect(classifyAccessEnd(deadline, equalDeadlines)).toBe("idle")
        expect(classifyAccessEnd(deadline + later, equalDeadlines)).toBe("idle")
      }
    ))
  })
})
```

The generator's deadline calculation constructs domain-valid inputs; the assertions do not call the production
calculation to obtain their expected answers. Equality is deliberately constructed and tested every run rather
than left to the chance that two independently generated timestamps coincide.

These are focused claims. The first property would still pass if activity never refreshed the idle deadline;
that requires distinct renewal evidence. The second does not cover generation-latch advancement. The third does
not cover missing records, legacy authenticated records, or unequal deadlines. Existing
[session helper examples](../../../packages/frontend/tests/unit/session-idle.test.ts) cover additional cases;
retain useful examples rather than automatically replacing them with these properties.

### Put stronger claims at the responsible boundary

`stampQualifyingActivity` transforms a supplied record. It does not check whether a session is still authorized,
verify a cookie, or atomically update Redis. Calling it on an expired record is not a test of the system's prohibition
on reviving expired access.

For that claim, exercise [recordQualifyingActivity](../../../packages/frontend/src/lib/session/activity.ts) and the
store's `renewIdleActivity` contract at the relevant boundary. Generate states before, at, and after deadlines;
assert both the returned outcome and stored authentication state after activity. Test real adapter ordering when
concurrency matters. The existing [activity/store regression tests](../../../packages/frontend/tests/unit/session-activity-cas.test.ts)
provide concrete starting points. Passing pure helper properties cannot establish atomicity or persistence.

## Build generators that explore the right domain

Use `fc.integer` for bounded whole numbers, `fc.constantFrom` for meaningful alternatives, `fc.record` for structures,
and `fc.tuple` or `fc.array` for groups or sequences. `.map` derives related values from generated inputs; `.chain`
can construct an arbitrary whose constraints depend on an earlier value. Preserve useful shrinking when composing them.

Prefer constructing valid relationships to repeatedly filtering unrelated values. `.filter` rejects generated values;
`fc.pre(condition)` skips a case whose precondition is false. Both can be legitimate, but excessive rejection wastes
runs and can cause the run to fail because too many cases were skipped. A predicate that returns early for nearly
every input can instead appear to pass without checking the intended behavior.

Review which cases the generator can reach. Deliberately exercise policy endpoints 5 and 30, deadline equality,
and just-before/just-after boundaries with explicit examples or dedicated properties. Do not rely on randomness
to guarantee any particular boundary occurs in one run. If a scenario requires different tenants, construct distinct
synthetic tenants rather than hoping random selection differs.

Test invalid input separately at the decoding boundary that owns rejection. Do not cast arbitrary objects into
`SessionRecord` and describe them as valid sessions, or use production validation to silently discard every case
that exposes a contract disagreement. Types describe shape; generators must also respect relationships between fields.

## Asynchronous properties and isolated state

Use `fc.asyncProperty` when the assertion must await work, and await `fc.assert` in the Vitest test. For a complete,
small example, this test exercises the existing asynchronous activity operation's missing-cookie rejection. Save it
as a separate `tests/unit/session-activity-properties.test.ts` file after the future dependency setup above.

```ts
import fc from "fast-check"
import { expect, it } from "vitest"

import { recordQualifyingActivity } from "../../src/lib/session/activity.ts"

it("missing cookies are denied before dependencies are accessed", async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom(undefined, ""), async (cookieValue) => {
    const unavailable = (): never => {
      throw new Error("Missing cookies must be rejected before dependency access")
    }
    const deps = {
      get config() {
        return unavailable()
      },
      get nowSeconds() {
        return unavailable()
      },
      get store() {
        return unavailable()
      }
    }

    const result = await recordQualifyingActivity({ cookieValue }, deps)

    expect(result).toEqual({ kind: "denied", reason: "missing-cookie" })
  }))
})
```

This intentionally tiny domain teaches the async API and a boundary claim; a table-driven example covering both
values would normally be simpler. It is not a reason to convert every example test into a property.

For properties that need a store or other mutable dependency, create fresh state inside the callback, including
shrinking attempts, and release resources in `finally`. Inject time and deterministic dependencies where supported.
Do not hide `Date.now()`, `Math.random()`, network timing, or shared state inside generators or assertions and expect
a fast-check seed to reproduce them. Keep real Redis tests isolated by owned key prefixes and follow existing cleanup
rules; never flush shared state. Effect test Layers follow the same isolation principle.

## Investigate and replay a failure

1. Read the shrunk counterexample and the actual assertion failure. Identify the consumer expectation it violates.
2. Check whether the implementation, stated property, generator, or external assumption is wrong. A surprising valid
   case may reveal a missing domain decision. Do not narrow the generator merely to remove a failure.
3. Replay with the reported `seed` and `path` in the second argument to `fc.assert`. Keep the same property,
   arbitrary ordering, code, and fast-check version while investigating.
4. Fix the responsible behavior or explicitly correct the contract. Keep a small explicit regression example when
   the counterexample captures a meaningful boundary, while retaining the general property if it still adds evidence.

For example, temporarily change an existing `fc.assert(property)` call to the following shape, substituting the
actual numbers and path from its failure report (these placeholder values do not describe a recorded failure):

```ts
fc.assert(property, { seed: 123456789, path: "0:1:0" })
```

`property` here means the existing `fc.property(...)` expression, not a new helper supplied by fast-check. For async
properties, keep the surrounding `await`. Preserve the failing input too: replay paths may change when generators
or library versions change. Remove temporary replay settings after diagnosis so later runs can explore other seeds.

Keep configuration local to the assertion. Choose `numRuns` or bounds for a specific risk and execution cost when
needed; more iterations do not repair a weak property or generator. There is no project-wide run-count target or
new global fast-check setup in this guide.

## Review the strength of the evidence

A property that only checks “does not throw” is useful only when totality is the actual contract. A test that derives
its expected answer by copying the implementation can reproduce the same defect. A state-machine model must express
allowed transitions independently, rather than delegate its decisions to the system under test.

Ask whether a plausible broken implementation would fail the property. For the examples above, extending absolute
expiry, retaining `userId` after termination, or preferring `absolute` for equal deadlines must fail. An identity
implementation of activity stamping would pass the preservation claim, so it also needs the separate renewal evidence
noted earlier. This reasoning is useful without adding a mutation-testing framework.

A useful property has a named rule, an explicit domain, an independent observation, reachable meaningful boundaries,
and a reproducible failure. Report its limitations alongside its result. Use integration, contract, and user-workflow
evidence for the uncertainties the property does not exercise.

## References

- [Property-based testing with Vitest](https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-vitest/)
- [fast-check arbitraries](https://fast-check.dev/docs/core-blocks/arbitraries/)
- [fast-check properties](https://fast-check.dev/docs/core-blocks/properties/)
- [fast-check configuration](https://fast-check.dev/docs/configuration/)
- [Designing for property-based testing discussion and wiki follow-up](https://chatgpt.com/share/6ab67b84-d8b8-83e9-b2b7-0120ad615fff)

The external pages provide broader background. Repository contracts, installed declarations, and the current owning
workspace's execution guidance determine how these ideas apply here.
