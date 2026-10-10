---
applyTo: "**"
---

# Requirements and evidence review

Use `docs/requirements/README.md` as the shared governance authority and
`docs/requirements/templates/area.md` for format. Use `docs/engineering/testing/README.md` for evidence assessment.
Apply the following analyses when a change affects requirements or associated evidence; unrelated files do not
acquire requirement references merely because this instruction applies. Use existing Copilot review configuration;
do not create another trigger or automation. Findings are advisory; human PR review and merge are authoritative.

## Requirements changes

- Identify changes to accepted behavioral contracts using Git/PR history. Requirements merged into `main` are
  accepted regardless of implementation or evidence. Do not require manual approval or verification status fields.
- Assess coherent contracts, consumers, conditions, selectors, mode qualifiers, relevant success/failure outcomes,
  rationale, sources, and classifications. Flag unsupported regulatory claims; distinguish direct legal obligations
  from product decisions and client practices. Preserve explicitly approved scope and design constraints.
- Search active contracts for conflicts, duplicates, hidden cross-domain implications, missing prerequisites,
  and dependent obligations. Check structured hard dependencies for missing IDs, cycles, and deprecated targets.
  Several criteria, components, or evidence types alone do not require splitting or relocation.
- Check stable IDs across active and deprecated history, one contract per ID-only file, minimal frontmatter,
  and domain ownership. Templates allocate no IDs. The filesystem is the index; do not request README inventory
  entries. Respect the documented migration transition for unchanged legacy area documents.
- Assess binding Observability obligations and high-level external Verification Plans. Normally revise plans with
  changed criteria or observability. Identify existing evidence that may no longer support revised claims.
  Respect explicit human verification exceptions and their rationale; do not repeatedly report authorized omissions.
- Protect confidential partner/client identities under the guide's public-source rule, including identifying URLs,
  filenames, quotations, and abbreviations. Do not demand private source links or invent attribution.

For BDD references, follow `docs/engineering/testing/requirements-bdd.md`: assertions derive from requirement versions already in current `origin/main`, not new or strengthened PR-only promises. Requirement-ID tags identify evidence; feature-level `@partial` describes intermediate scope, not requirement verification status. Do not demand complete BDD coverage or equate tag removal with runtime verification.

## Evidence changes

When tests, manual procedures, policies, configuration assessments, runtime checks, or other associated evidence
change, inspect the artifact and its declared requirement in context:

- Determine which behavioral claims remain supported at the execution boundary and relevant conditions.
  An ID reference alone does not establish the entire contract.
- Inspect meaningful assertion and evaluation-condition changes for weakening/removal of established claims,
  new limitations, and removed requirement references. Wording changes alone need not be semantic changes.
- Distinguish planned evidence from executed results and monitoring mechanisms from evidence of correct operation.
  Static/policy evidence can establish externally meaningful properties but need not establish deployed equivalence.
- Propose useful additional relationships for human approval; do not silently authorize inferred associations.
  Evidence intentionally created for a requirement must reference its ID, but not every test needs one.
  Respect native evidence conventions and readability; do not demand independent acceptance-criterion IDs.

## Deprecation and review style

For deprecation, inspect explicit active dependents, implicit behavioral dependencies, and evidence referencing
the retired ID. Identify obligations needing revision or replacement; do not automatically alter or retire them.
Preserve historical content, ID, reason, and applicable replacement links under `deprecated/`. Never reuse IDs;
permanent deletion requires explicit human authorization.

Report specific actionable findings citing affected requirement IDs, locations, behavioral claims, consequences,
and suggested corrections. Distinguish confirmed defects/conflicts, possible semantic regressions, potential
coverage gaps, legitimate intentional changes, and unresolved human decisions. Missing implementation or evidence
is a legitimate gap. Do not invent policy, results, or stronger approval. Do not synchronize `specs/` or `.specify/`
with requirements merely because historical references differ. Do not change delivery-planning conventions or
issue workflows, or demand structural validators, RTMs, dashboards, or manually maintained evidence inventories.
