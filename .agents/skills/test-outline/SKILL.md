---
name: test-outline
description: Create or extend module test outlines from a feature description or specification, encoding expected public behavior as pending scenarios without implementing tests. Works independently of Spec Kit.
---

# Test outline

Capture the expectations a module's consumers should be able to rely on in readable
`describe` groups and bodyless `it.todo` declarations. These are pending expectations,
not evidence that the behavior works. Stop after outlining; do not implement tests or
production code.

## Ground the request

Accept a natural-language feature description or a specification path, optionally
accompanied by module names or test paths. For example:

- `$test-outline Add the configuration behavior described in docs/example-spec.md`
- `$test-outline Outline the new expiration rule for SessionStore in its existing tests`

Read applicable repository and workspace guidance, including
[Testing as evidence](../../../docs/engineering/testing/README.md). Inspect relevant
contracts, public interfaces, callers, and existing tests, including their assertions
and parameterized cases. Follow workspace-specific guidance when the target requires it.
Use [config.test.ts](../../../packages/frontend/tests/lib/config.test.ts) as an example
of organizing public capabilities and conditions, not as a template for test bodies.

Infer affected modules from that evidence when the caller has not named them. Ask
targeted questions where ownership or intended behavior remains ambiguous; do not
invent requirements or public interfaces. A supplied spec or plan is ordinary input:
no Spec Kit state, commands, or prior workflow stages are required.

## Choose expectations and placement

Focus on the requested feature. Existing tests inform what is already known; this is
not a whole-module coverage exercise. Do not promote incidental implementation behavior
into a requirement.

For each candidate expectation, identify the consumer, relevant conditions, observable
outcome, and public boundary responsible for it. Choose the boundary that can establish
the claim meaningfully. Do not substitute private helper calls or implementation
mechanics for public behavior, or repeat the same claim at several layers without a
distinct reason.

Treat a directory with an `index.ts` (or `index.tsx`) entry point as one module.
The entry point defines its public interface; sibling files are internal implementation
files, not separate module boundaries. Read them to understand behavior, but express
expectations through the public exports rather than targeting internal file APIs.
Follow re-exports to understand the public contract. If a requested capability is not
exported by the entry point, report that mismatch rather than silently treating an
internal API as public or adding a production export.

Extend an existing owning test file, including one whose location predates current
conventions. For new files, mirror the public module path within the owning workspace.
For directory modules, replace the directory's `/index.ts` or `/index.tsx` with `.test.ts`:

- `src/a/b/module.ts` → `tests/a/b/module.test.ts`
- `src/a/b/component.tsx` → `tests/a/b/component.test.ts`
- `src/lib/tenant/index.ts` → `tests/lib/tenant.test.ts`
- `src/a/b/module/index.tsx` → `tests/a/b/module.test.ts`

Do not create `tests/lib/tenant/index.test.ts` or `tests/lib/tenant/service.test.ts`
for the public tenant module merely because its implementation uses those source files.

Do not move existing tests unless the caller explicitly requests it. If a requested destination conflicts with the owning suite
or a new module has no established source location, resolve the ambiguity with the
caller before writing the affected outline.

## Write the outline

Use module → public capability → condition → observable outcome where useful. Omit
nesting levels that add no meaning. The full title formed by the enclosing `describe`
groups and the test name must communicate the expectation without a body. Name concrete
outcomes rather than “works,” “handles errors,” or “has a feature.” Include meaningful
success, failure, and boundary scenarios when supported by the requirement; impose no
scenario quotas and invent no speculative edge cases.

For a new file, import `describe` and `it` directly from `vitest`. For example, given a
requirement that configuration defaults to development when `NODE_ENV` is absent:

```typescript
import { describe, it } from "vitest"

describe("ServerConfig", () => {
  describe(".env", () => {
    describe("when NODE_ENV is absent", () => {
      it.todo("defaults to development")
    })
  })
})
```

For an existing file, preserve imports exactly. Reuse its existing bindings, including
aliases and adapters such as `@effect/vitest` or fast-check connectors. Do not add,
replace, reorder, or normalize imports. Check the installed runner or adapter declarations
for TODO support; do not assume every wrapper exposes the same API. If existing bindings
cannot express the outline, report the incompatibility and ask for direction rather
than changing imports. If dependencies are unavailable, report that compatibility could
not be verified instead of claiming it was checked.

New test declarations must be bodyless TODOs. Never add empty callbacks, assertions,
fixtures, hooks, mocks, production imports, implementation stubs, or test bodies. Suite
callbacks contain only the new groups and TODOs, alongside any preserved existing code.

## Preserve existing knowledge

- Preserve all existing tests, bodies, helpers, imports, and meaningful organization.
  Insert new groups or TODOs into the appropriate existing context without rewriting
  surrounding tests or converting implemented tests to TODOs.
- Compare meaning, not just titles, before adding an expectation. Existing assertions,
  parameterized cases, and TODOs may already express it. If so, add nothing for that
  expectation. Repeating the same request should make no further changes.
- When an explicit new requirement supersedes an existing test, retain the old test,
  add the new pending expectation if absent, and report both locations and the contract
  change. Do not rename, disable, delete, or weaken the old test to hide the conflict.
- If the intended contract is unclear or sources disagree without an explicit change,
  ask for clarification before adding that expectation.

## Verify and report

Review the diff to confirm that additions are feature-relevant, existing code and imports
are preserved, new paths mirror public module paths (collapsing directory entry points),
and no duplicate claims or implemented
tests were introduced. Use the owning workspace's applicable checks to validate syntax
and test discovery when available. Do not change dependencies, runner configuration,
or checks to accommodate an outline; report limitations or failures. A discovered TODO
does not verify application behavior.

Summarize changed files, added expectations, relevant existing coverage, and any unresolved
questions or conflicts with file locations. Distinguish pending expectations from executed
evidence. Do not create a separate traceability artifact, run Spec Kit integration, or
commit automatically.
