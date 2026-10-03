---
applyTo: ".agents/skills/delivery-plan/**,.agents/skills/delivery-review/**"
---

# Delivery skill review

Review these skills against `docs/delivery/README.md` and the repository requirements and testing guides they reference.
Keep format and lifecycle rules in the guides rather than duplicating them in skills. Check relative links and concise,
discriminating skill descriptions.

Preserve authoring versus review behavior: delivery-plan produces draft documentation; delivery-review reports findings
without editing by default. Neither approves decomposition, modifies requirements or product code/tests, commits
implicitly, writes to GitHub, or integrates Spec Kit/RTM/Projects automation. Read-only issue inspection is allowed but
unavailable access must be reported. Check preservation of published references and handling of proposed/retired sources,
partial coverage, unresolved decisions, and planned versus executed evidence.
