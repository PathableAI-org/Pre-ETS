# Durable requirements

A requirement is a durable, normative behavioral contract describing what the system is expected to do.
It describes desired behavior, independently of current implementation, evidence, or deployment.
An accepted requirement may be entirely unimplemented and unsupported by evidence.

## Authority and history

Git and pull requests govern approval: requirements proposed in a PR are proposals; requirements merged
into `main` are accepted. Change accepted contracts through subsequent PRs. Human PR review and merge
remain authoritative; agent and Copilot findings are advisory. Do not maintain approval, implementation,
or verification status fields, including `proposed`, `accepted`, `verified`, `partial`, or `unverified`.
Evidence relationships and execution results may eventually yield derived verification views without
manual requirement-file updates. No such tooling is introduced here.

Retire a requirement by moving it to `deprecated/`, preserving its ID and historical content. Record the
reason and replacement requirement IDs when applicable; replacements should link back to the retired ID.
Exclude deprecated files from ordinary active discovery, but include them for history, ID uniqueness,
supersession, and dependency review. Never reuse an ID. Agents may propose deprecation; only humans may
explicitly authorize permanent deletion of requirement files.

## Organization and discovery

Use one requirement per Markdown file, grouped into domain or capability directories:

```text
docs/requirements/
├── README.md
├── tenant/
│   └── PREETS-TENANT-003.md
├── session/
│   └── PREETS-SESSION-001.md
├── security/
│   └── PREETS-SECURITY-001.md
└── deprecated/
    └── tenant/
        └── PREETS-TENANT-001.md
```

The filesystem is the authoritative index. This guide does not maintain a synchronized requirement list.
Search the entire active tree before assuming the owning domain; exclude `templates/`, governance guides,
and `deprecated/` from active-contract discovery. Search active and deprecated contracts before allocating
IDs in the form `PREETS-AREA-NNN`. Preserve established uppercase area tokens and allocate sequentially
starting at `001`, after the area's highest allocated number. Templates allocate no IDs.
Use ID-only filenames. Preserve IDs across moves and refinements of the same contract.

Place an obligation in the domain that owns it. Cross-cutting obligations may belong in `security/`;
an end-to-end workflow may itself be a meaningful commitment. A coherent contract may include success,
unknown-input, and configuration-failure outcomes. Split only when obligations can reasonably be adopted,
revised, or retired independently. Multiple acceptance criteria, evidence types, components, or technical
boundaries alone do not justify splitting. A distinct obligation receives a new ID.

Optional frontmatter `dependencies` lists requirement IDs that are hard prerequisites, including across
domains. Related behavior, replacement links, and unresolved product questions are not automatically hard
dependencies. Check missing prerequisites, cycles, and dependencies on deprecated requirements. Cross-domain
implications and potential duplication require review, not automatic splitting or relocation.

## Requirement format

Use the [requirement template](templates/area.md), retained at its existing path for compatibility.
Minimal YAML frontmatter contains `id`, a list of `classifications`, and optional `dependencies`:

```yaml
---
id: PREETS-TENANT-003
classifications:
  - Functional
  - Security
dependencies:
  - PREETS-TENANT-004
---
```

This example illustrates syntax, not a decision to establish a dependency. Keep substantive content in Markdown:
a human-readable title, description of the expected contract, rationale, sources, acceptance criteria,
Observability, and Verification Plan. Optional open questions, owner, explicitly approved design constraints,
and design or historical replacement references may clarify the contract. Preserve approved design choices;
do not infer constraints from incidental code. Do not duplicate Git-derived information in metadata.
Acceptance criteria need no independent stable IDs; the requirement is the durable traceability unit.

Classifications describe the nature of the obligation and may include Functional, Security, Regulatory,
Contractual, and Product. Sources describe its origin and belong in the body, separately from classifications.
Every requirement explains why it exists and where its obligation comes from. Regulations, research, client
discovery, and internal decisions are legitimate attributable sources. Naming HIPAA, FERPA, or WIOA may suffice;
do not demand detailed CFR citations or legal interpretation documents. Distinguish direct regulatory duties
from product decisions informed by regulation and client practices that are not necessarily legal obligations.
Never invent legal authority, source approval, or attribution.

## Public-source attribution

Use relative links for repository sources and full URLs for external sources; identify the relevant section
or decision. Public artifacts and GitHub titles/bodies must never name a specific partner or client, including
names, abbreviations, identifying filenames, link labels, URLs, examples, and quotations. Use generic attribution
such as “source provider” or “client-supplied form,” preserving non-identifying titles, sections, dates, limitations,
and decision boundaries. Keep identifying references outside the public repository and describe the access
limitation. Do not invent sanitized URLs or claim a reviewed source was unavailable. If a source cannot be
accessed, preserve its attribution and explain the limitation; supplied material can still support a draft.
Keep credentials and sensitive client data out of requirements.

## Observability

Every requirement has a dedicated Observability section. Describe externally meaningful obligations about what
operators must detect, distinguish, measure, or diagnose. These are binding acceptance obligations, even outside
the Acceptance criteria section. For example, an operator may need to distinguish unknown tenants from failures
loading known tenants' configuration. Do not prescribe metric names, spans or attributes, instrumentation libraries,
Grafana queries, or implementation details; those belong in engineering design. Deliberately consider the need
and use `Not applicable` when no meaningful operational obligation exists.

## Verification plans

Each requirement owns a high-level plan for expected external evidence. Describe what must be demonstrated,
the evidence category, its intended claim, known limitations or assumptions, and unresolved verification questions.
Appropriate categories include application Gherkin/BDD, manual procedures, runtime observability and alert
validation, static analysis of externally meaningful properties, policy-as-code, infrastructure configuration
assessments, and deployed-environment checks. The distinction is externally meaningful claims, not static versus
dynamic or automated versus manual evidence. Do not prescribe unit tests, property tests, internal module strategies,
test steps, functions, generators, or detailed implementation instructions. Engineering testing guidance owns those.

A plan may reference a manual document or describe one to create, or summarize a Gherkin feature's purpose without
writing scenarios. Name known limits without exhaustive speculative gaps: a Terraform policy check, for example,
does not necessarily prove the deployed environment matches configuration. Include observability obligations.
When criteria or observability change, normally revise the plan in the same PR and identify existing evidence that
may no longer support the contract.

A human may explicitly decide a plan is unnecessary or premature. Record the exception and human-provided reason:

```markdown
## Verification Plan

Omitted by explicit maintainer decision.

Reason: [Human-provided rationale]
```

Do not invent a justification or enforce an agent-defined test of triviality. Respect documented human exceptions,
including during revision and review. Omission establishes neither implementation nor verification.

## Evidence ownership and traceability

Evidence artifacts own their relationships to requirement IDs. Requirements describe expected evidence; do not
maintain a synchronized inventory of implemented tests or execution results in them. Evidence intentionally
created to verify a requirement must reference its ID; other evidence may do so when appropriate. Not every test
needs a requirement reference. New relationships require human approval before becoming authoritative. Agents may
propose incidental relationships in a PR for human review, but must not silently authorize inferred relationships.

Respect native conventions: Cucumber tags, readable Vitest descriptions or adjacent metadata, manual prose about
claims and limits, and policy-system conventions may differ. Readability takes priority over uniform annotations.
An ID reference alone does not establish an entire requirement. Assess supported claims, execution boundaries,
conditions, results where applicable, limitations, and remaining unsupported outcomes. Distinguish planned from
executed evidence, and installed monitoring from evidence that it functions correctly. Read
[Testing as evidence](../engineering/testing/README.md) when assessing claims. Do not invent results.

For BDD, follow [Requirements-backed BDD](../engineering/testing/requirements-bdd.md). Assertions derive from requirement versions already in current `origin/main`; merge new or stronger promises before adding dependent assertions. Requirement-ID tags identify evidence, and feature-level `@partial` identifies an intermediate slice, not a manual requirement status. Scenario coverage remains distinct from executed evidence.

## Authoring and review

The repository-local [author skill](../../.agents/skills/requirements-author/SKILL.md) supports interactive
requirements development; the [review skill](../../.agents/skills/requirements-review/SKILL.md) independently
assesses contracts and evidence implications. Inspect existing contracts and relevant engineering guidance first.
Stop for human decisions on conflicts with accepted requirements, material ambiguity, failure policy, scope,
conditions, or changes to established obligations. Resolve minor editorial ambiguity directly. Finalize once the
contract is sufficiently clear; surface non-blocking uncertainty without endless speculative questioning.

Explain material changes to the contract, dependents, observability, verification, existing evidence, and other
domains before editing an existing requirement. Group logically dependent changes in a PR; do not bundle unrelated
changes just because they share a domain. Missing implementation or evidence is a legitimate gap, not a defect in
a clear contract. Requirements remain independent of Spec Kit; historical references do not require synchronizing
`specs/` or `.specify/` artifacts.

## Transition and scope

Existing contracts have been migrated to ID-named files. The former area containers retain historical Git
pointers only and define no active contracts. `context/` holds shared source/scope qualifications, not independent
requirements; exclude it alongside templates and governance documents from active-contract discovery.
See the [migration record](migration-plan.md) for preserved IDs, verification-plan changes, and remaining
product decisions. New operational observability obligations were deliberately excluded from this migration
by maintainer direction; existing diagnostic obligations remain binding.

Assess structure, IDs, dependencies, and organization through human review assisted by agents. Do not introduce
structural CI validators, lint scripts, schemas, indexes, RTMs, evidence adapters, result aggregation, verification
dashboards, or review triggers. This governance does not change delivery planning or issue workflows.
