# Pre-ETS specification authority and verification

Apply this project workflow before and while executing the wrapped command.

Whenever the wrapped workflow resolves `spec-template`, use
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/resolve-template.sh spec-template --json`
and parse `TEMPLATE_CONTENT`. Do not invoke the Bash resolver outside that isolated
runtime; preset composition requires PyYAML that may not exist in the system Python.

## Intake gate — complete before creating feature artifacts

1. Require the input to identify exactly one GitHub delivery issue. Treat a bare issue
   number or repository issue URL as sufficient identification. If no issue is
   identifiable, stop and request it; do not create a feature from an unauthoritative
   prose summary.
2. Read the issue without modifying it. Locate its originating reviewed delivery-plan
   slice and every accepted requirement and acceptance criterion it cites.
3. Read requirement files from the current `origin/main` tree. If that baseline or the
   issue is unavailable, report the access limitation and stop rather than assuming
   approval or reconstructing scope from a feature branch.
4. Read the requirement Verification Plan and Observability sections, applicable
   approved architecture, `docs/requirements/README.md`, `docs/delivery/README.md`,
   `docs/engineering/testing/README.md`, and the project constitution.
5. Confirm that the issue represents one authorized delivery slice with sufficiently
   clear behavior, scope, dependencies, and feasible evidence. Code and historical
   Spec Kit artifacts are context, not product-contract authorities.

Requirements on `origin/main`, the reviewed delivery plan, and the delivery issue are
read-only inputs. Do not edit them, update the issue, broaden its scope, or make a new
product decision. When a material ambiguity, contradiction, missing product decision,
or unauthorized expansion blocks the specification, stop the affected work and report:

1. authoritative source;
2. ambiguity or conflict;
3. impact;
4. decision required;
5. possible resolutions labelled as proposals.

This authority rule overrides any wrapped instruction to make an informed guess about
product behavior, delivery scope, security/privacy policy, acceptance expectations, or
requirement meaning. Reasonable wording choices that preserve the authorized contract
may be resolved directly. Technical architecture belongs to planning.

## Specification perspective

Write from the perspective of an external stakeholder approving observable
expectations. Required HTTP behavior, cookie properties, isolation guarantees,
accessibility outcomes, confidentiality constraints, and operational obligations are
appropriate when the authoritative sources require them. Do not introduce module
interfaces, services, dependency injection, internal algorithms, files, libraries, or
runtime composition.

Preserve one delivery issue to one Spec Kit feature. In `spec.md`, complete the appended
Delivery Authority and Scope section with exact repository links or revision-qualified
references and requirement IDs. Do not treat Spec Kit functional-requirement IDs as a
replacement authority for the durable requirements register.

## Feature verification design

After `spec.md` is coherent, run
`uv run --with pyyaml==6.0.3 -- .specify/scripts/bash/resolve-template.sh verification-template --json`, use the
returned content to create `verification.md` beside `spec.md`, and complete it from the
approved feature contract. Verification design is implementation-independent and must:

- map each claim to its authoritative requirement criterion or delivery-issue scope;
- identify observable outcomes and meaningful possible violations;
- select automated behavioral evidence, including requirements-backed BDD only where
  the accepted `origin/main` requirements support the assertions;
- include a non-empty, agent-executable manual feature procedure for every feature;
- include operational observability verification where obligations apply, using manual
  inspection or temporary probes rather than durable telemetry-output tests;
- name environment prerequisites, evidence to retain, cleanup, limitations, and claims
  that remain incomplete;
- label all content as planned evidence until a later execution record supplies actual
  observations.

Manual verification must add a distinct observation rather than mechanically duplicate
automated scenarios. It may use Playwright, Grafana, or other available integration
tools. Do not claim tool availability or successful execution during specification.

## Pre-ETS readiness gate

Extend the specification checklist to confirm that authority and scope are traceable,
`verification.md` is complete, manual feature verification is executable, planned and
executed evidence are distinguished, and no architectural decisions leaked into the
contract. The feature is ready for clarification or planning only when both `spec.md`
and `verification.md` pass this gate. Report both paths in the completion summary.

{CORE_TEMPLATE}

## Pre-ETS completion rule

Do not report the specification ready for planning when a blocking authority finding is
open, an accepted criterion lacks a disposition, `verification.md` is absent, or the
standard manual feature procedure is not meaningful and executable.
