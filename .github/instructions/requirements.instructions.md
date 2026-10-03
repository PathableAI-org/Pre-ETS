---
applyTo: "docs/requirements/**"
---

# Durable requirements review

Use `docs/requirements/README.md` and `docs/requirements/templates/area.md` as the format and lifecycle authority.
Use `docs/engineering/testing/README.md` when assessing verification claims.

This register is independent of Spec Kit. Do not compare these documents with `specs/` or `.specify/` artifacts,
flag their differences, or request synchronization with them. References to historical specifications may document
superseded decisions; they do not make those specifications the authority for this review.

Review the requirements register for these conventions:

- Each obligation names its consumer, conditions, observable outcome, rationale, source, and acceptance criteria.
  Criteria must reveal a meaningful violation. Check selectors, prerequisites per mode, failure outcomes, and
  the intended request classes behind broad quantifiers. Respect explicitly approved scope and design choices.
- Classification describes the obligation's nature; source records its supplied basis. Labels such as
  “Functional Requirement” are intentional source conventions. Do not demand ChatGPT conversation links.
- IDs use `PREETS-AREA-NNN` and are unique across area documents, including retired entries. Template placeholders
  allocate no IDs and establish no obligations. New areas must be linked from the register index.
- Consider separate IDs for independently changing obligations or different owners, failure modes, and evidence
  boundaries, without demanding fragmentation. Optional owner and design-constraint fields are not mandatory.
  Explicitly approved design constraints are valid; distinguish them from accidental implementation restrictions.
- Lifecycle (`proposed`, `accepted`, `deprecated`, `superseded`) is independent of verification (`unverified`,
  `partial`, `verified`). Acceptance or retirement needs a recorded decision. Implementation and closed issues
  do not establish approval or verification.
- Preserve stable IDs for refinements. Replacements retain old entries as superseded history with forward links
  and replacement backlinks. Never delete or reuse retired IDs. Historical promises may intentionally differ
  from active replacements; review the replacement decision rather than treating that difference as a defect.
- Verification plans describe future evidence and responsible boundaries; verification evidence records reviewed
  execution, covered criteria, result, date/revision, and limitations. Planned tools, TODOs, links, static checks,
  and Copilot review alone do not establish runtime behavior. Changed criteria require evidence reassessment.
- Prefer automated verification where suitable. Check that policy/configuration checks and deployed behavior
  tests establish their respective claims. A blocked-looking HTTP response alone does not prove ingress rejected
  a request before forwarding. Fixture checks do not prove all externally managed configuration is safe.
- Tenant configuration excludes secret-bearing fields under the accepted security invariant. Flag changes that
  undermine this promise, such as proposing `Config.secret` in the exposed tenant configuration contract, while
  respecting recorded approval and delivery dependencies. A separate server-only secret provider is compatible with the invariant.
  Inspect field meaning and data flow, not names alone; full permitted diagnostic JSON is an approved constraint.
- Explicit open questions and unimplemented/unverified obligations are legitimate gaps. Missing optional delivery
  or design references are not defects. Do not invent policy, execution results, or stronger approval.

Check relative links and requirement dependencies. Report actionable defects with the requirement ID, location,
consequence, and suggested correction; distinguish them from unresolved decisions and evidence limitations.

Delivery plans under `docs/delivery/` describe proposed work and criterion coverage. Follow their cross-links without
treating decomposition approval, issue closure, or PR merge as requirement acceptance or verification. Actual issue/PR
URLs may be added to delivery references later; a draft plan need not contain published references.
