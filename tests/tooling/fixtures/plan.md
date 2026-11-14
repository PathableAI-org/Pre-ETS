# Implementation Plan: Sample

### Phase 7 — Implementation slices

| Slice  | Branch               | Decision a reviewer accepts | Contracts and modules | Telemetry rows                               | Claim IDs advanced                                                  | Est. hand-written files |
| ------ | -------------------- | --------------------------- | --------------------- | -------------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| **A1** | `900-sample-impl`    | Denials answer 401          | `session.ts`          | T-001                                        | V-001 (gate), V-004 (no-script unknown; server-expired best effort) | ~15                     |
| **A2** | `900-sample-impl-a2` | Forms work without scripts  | `actions.ts`          | None new (existing `authorizeSessionAction`) | V-006 (full), V-001 (action-level path)                             | ~9                      |
| **B**  | `900-sample-impl-b`  | The modal conceals          | `coordinator.tsx`     | T-002, T-003 (`expiration_log_in`)           | V-009–V-011, partial V-012                                          | ~13                     |
| **C**  | `900-sample-impl-c`  | Log in is fresh             | None (evidence only)  | Uses T-001–T-003 and existing                | V-019, V-020 (full); full manual procedure for all claims           | ~4                      |
