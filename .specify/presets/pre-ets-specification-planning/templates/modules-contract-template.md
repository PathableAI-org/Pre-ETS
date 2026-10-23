# Module Architecture and Public Contracts: [FEATURE NAME]

**Plan**: [plan.md](../plan.md)

**Feature verification**: [verification.md](../verification.md)

**Status**: Planned design — signatures must be verified against installed declarations before implementation

## Module architecture decisions

| Concern          | Current owner and consumers                   | Decision                                            | Public boundary            | Private decomposition | Rationale and non-goals                                |
| ---------------- | --------------------------------------------- | --------------------------------------------------- | -------------------------- | --------------------- | ------------------------------------------------------ |
| [Responsibility] | [Current module/package and actual consumers] | [Preserve / extend / decompose / extract / promote] | [Owning parent or package] | [Children, or none]   | [Why this boundary is warranted; rejected speculation] |

Every affected concern must make an explicit abstraction decision. File size or feature novelty alone does not
justify a new public module, service, provider interface, re-export, or workspace package.

## Public contracts

### [Public module or package]

**Responsibility**: [Coherent owned concern]

**Actual consumers**:

- [Current consumer and why it needs the capability]

**Proposed signatures**:

```ts
// Exact public TypeScript signatures only; omit implementation bodies.
```

**Inputs and validation ownership**: [Trusted/untrusted inputs and where decoding occurs]

**Success semantics and invariants**:

- [Consumer-facing guarantee and conditions]

**Expected errors**:

| Public error         | Meaning for consumers     | Owned internal failures translated here | Consumer response         |
| -------------------- | ------------------------- | --------------------------------------- | ------------------------- |
| [Error type or none] | [Stable semantic meaning] | [Private/library failures, if any]      | [Why distinction matters] |

**Defects and interruption**: [What must remain a defect/interruption rather than an expected error]

**Effect environment requirements**: [Required services/configuration, or explain why ordinary TypeScript is appropriate]

**Compatibility and relationships**: [Existing consumers, migration, cross-module dependencies, stable wire behavior]

### Contract evidence

| Claim                | Meaningful violation | Durable evidence                                                  | Manual/transient evidence            | Limitations and non-duplication                        |
| -------------------- | -------------------- | ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| [Consumer guarantee] | [Counterexample]     | [Public-interface example/property/integration/existing evidence] | [Distinct inspection/probe, or none] | [What remains and why another layer is not duplicated] |

[Repeat the Public contracts section for every affected public module, including existing modules whose contract
changes.]

## Cross-module dependency direction

[Describe allowed dependency direction and how public parents prevent sibling/private-child imports.]

## Rejected abstractions and alternatives

- [Candidate abstraction]: [Why no current consumer, ownership, reuse, lifecycle, or packaging need justifies it]

## Open decisions

### Blocking contract decisions

- [Product/authority question that must return to its owning workflow, or "None"]

### Implementation choices left to tasks

- [Technical choice that does not change the approved public contract]
