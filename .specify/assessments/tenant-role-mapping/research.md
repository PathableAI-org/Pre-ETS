# Idea Research: Tenant Role Mapping

- **Slug**: tenant-role-mapping
- **Created**: 2026-09-18
- **Evidence confidence (overall)**: medium
- **Scope**: Evidence collection only; no role catalog, mapping design, or adoption verdict.
- **Updated**: 2026-09-18 — requested follow-up on provider metadata and application mapping versus provider-managed assignments; addresses decision blockers B2–B3.

## Users & Demand

- The requester identifies lesson delivery to particular student groups and collection of lesson data for billing as different staff responsibilities. This is a stated need, not observed behavior or a confirmed division into mutually exclusive roles. — [source: I1] (confidence: high; cited)
- Tenant-configurable mapping and support for future roles are explicit requests. Their operational value, frequency of configuration changes, and administrator workflow have not been demonstrated by interviews or usage evidence in this assessment. — [source: I1] (confidence: high for the request; cited)
- **ASSUMPTION:** Responsibilities may overlap for individual staff members; no client roster or permission matrix was supplied. (confidence: low)

## Prior Art

### Current repository

- Login initiation currently requests `scope: "openid"`. The callback obtains claims from the code-grant result, extracts `sub`, and chooses a display name from `name`, `preferred_username`, then `sub`. It passes user ID and name into authenticated-session persistence. These observations are source inspection, not runtime verification. — [source: I2, I3] (confidence: high; cited)
- The inspected `SessionRecord` and `SessionContext` expose tenant, expiry, user ID, and user name; neither declares role or group fields. `TenantConfig` declares display name and OIDC configuration, without a role-mapping field. This is a bounded finding about those interfaces, not proof that every repository file lacks authorization code. — [source: I4, I5] (confidence: high; cited)
- The constitution assigns authentication orchestration and tenant configuration to the frontend, and domain authorization to the backend. It requires independent backend enforcement and tenant-bound callbacks/sessions. These are existing constraints for later definition, not a new architecture decision. — [source: I6, principles II–III] (confidence: high; cited)

### Standards: what metadata can be available?

The following Core inventory is normative availability, not a promise about the unidentified client provider. — [source: S1 §§2, 5] (confidence: high; cited)

| Category                 | Claims / behavior                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required ID-token fields | `iss`, `sub`, `aud`, `exp`, `iat`                                                                                                                                                |
| Authentication context   | `auth_time`, `nonce`, `acr`, `amr`, `azp`: optional or conditional                                                                                                               |
| Profile                  | `name`, `given_name`, `family_name`, `middle_name`, `nickname`, `preferred_username`, `profile`, `picture`, `website`, `gender`, `birthdate`, `zoneinfo`, `locale`, `updated_at` |
| Contact                  | `email`, `email_verified`, `phone_number`, `phone_number_verified`, `address`                                                                                                    |
| Requesting metadata      | `profile`, `email`, `address`, `phone` scopes; optional `claims` parameter                                                                                                       |
| Retrieval                | ID token and UserInfo; scope-requested profile claims in code flow are returned through UserInfo                                                                                 |

- Requested claims can be omitted; `essential` is not a general guarantee. UserInfo requires an access token and its `sub` must match the ID token. — [source: S1 §§5.3–5.5] (confidence: high; cited)
- Stable identity is the issuer/subject pair; email and username are not unique identifiers. Pairwise subjects can differ between clients. — [source: S1 §§5.7, 8] (confidence: high; cited)
- Core permits additional claims but defines no standard application-role catalog or required groups claim. — [source: S1 §§5.1–5.2] (confidence: high; cited)

### Discovery metadata is about the provider

- Discovery describes issuer, authorization/token/UserInfo endpoints, signing keys, subject types, supported algorithms, scopes, and claims. It is capability metadata, not a user's attributes or memberships. — [source: S2 §3] (confidence: high; cited)
- `claims_supported` is recommended and may be incomplete; it lists claims the provider may supply. `scopes_supported` likewise need not enumerate every supported scope. Neither establishes that a particular user or client will receive a claim. `claims_parameter_supported` defaults to false when absent. — [source: S2 §3] (confidence: high; cited)

### Related standards and provider examples

- RFC 9068 defines a JWT **access-token** profile. For authorization attributes it recommends `groups`, `roles`, and `entitlements`, referring to SCIM definitions. It supplies no specific role/entitlement vocabulary. This does not require every OIDC provider to emit those claims in ID tokens, or every access token to use that JWT profile. — [source: S3 §§1, 2.2.3.1] (confidence: high; cited)
- RFC 9068 resource-server validation includes token type, issuer, audience, signature, and expiry checks. An access token intended for another resource is not interchangeable with one intended for this platform's API. — [source: S3 §4] (confidence: high; cited)
- SCIM provides user/group schemas and role/entitlement attributes, but leaves authorization semantics and role vocabulary to the service provider. It is related provisioning prior art, not evidence that these attributes arrive automatically through OIDC. — [source: S4 §§1, 4.1.2, 4.2] (confidence: high; cited)
- Microsoft Entra documents an ID-token `roles` array. Its JWT group limit is 200 memberships; above the limit, an overage indication replaces the groups list and requires a Microsoft Graph lookup. Missing inline groups therefore need not mean zero memberships. This is an example, not identification of the client's provider. — [source: S5, payload/group-overage sections] (confidence: high; cited)
- Keycloak documents realm/client role structures under `realm_access` and `resource_access`, with protocol mappers controlling token content. This supplies a concrete example of provider-specific structure, not a portable OIDC requirement or a verified property of the local deployment. — [source: S6, role/protocol-mapper sections] (confidence: high; cited)

## Provider Follow-up: Metadata and Assignment Ownership

This follow-up responds to [decision blockers B2–B3](decision.md#required-clarifications). Product documentation establishes capabilities, not their availability in a particular client deployment. Microsoft Entra ID, Google OIDC/Workspace, and Cognito user pools are the specific products examined; the broader labels Microsoft, Google, and Cognito do not establish those products as the client's actual setup. — [source: I1, S7–S12] (confidence: high for research scope; client adoption unknown)

### Microsoft Entra ID

- Entra app roles are application-defined and may be assigned to users or groups. The token exposes assigned role values in `roles`; authorization remains the application's responsibility. Microsoft explicitly distinguishes application roles from tenant-local groups and describes group-to-app-role assignments for multi-tenant SaaS. — [source: S7, App roles vs. groups] (confidence: high; cited)
- **Inference:** A tenant administrator can associate existing organizational groups with the platform's agreed app roles on the provider side. If this covers the required access situations, a second application-side group-to-role mapping duplicates an existing capability. Adding new app roles still requires agreed permission meanings and assignment administration. — [source: S7; I1] (confidence: medium; cited inference)
- [NEEDS CLARIFICATION: Does the client use Entra ID, can its administrators maintain enterprise-application assignments, and do its licensing, group types, membership patterns, and operational policies support that workflow?]

### Google OIDC and Google Workspace

- Google's canonical ID-token claim list includes identity, email/profile information, and `hd` for a hosted organization domain; it does not list group memberships or application roles. `hd` identifies an organization domain, not a lesson-delivery or billing responsibility. The latter distinction is an inference from the documented claim meaning. — [source: S8, ID Token (Claims)] (confidence: high; cited / explicit inference)
- Google Workspace's Admin SDK Directory API separately supports retrieving groups for a member, with API authorization. This is a separate source of evidence, not metadata automatically included by requesting ordinary OIDC profile/email scopes. — [source: S9, Retrieve all groups for a member; S8] (confidence: high; cited)
- **Inference:** A configurable mapper cannot derive staff responsibilities from information that Google login does not supply. A directory integration, broker-supplied information, or another authoritative assignment process would require separate scope and access evidence. This is not a conclusion about every Google identity product or Workspace federation configuration. — [source: S8–S9] (confidence: medium; cited inference)

### Amazon Cognito User Pools

- User pool groups appear in `cognito:groups` in ID and access tokens. Users can belong to multiple groups; groups cannot be nested. `cognito:roles` and `cognito:preferred_role` concern associated AWS IAM roles, with precedence selecting the preferred role; they are not a ready-made platform business-role vocabulary. — [source: S10] (confidence: high; cited; business-role distinction is inference)
- **Inference:** Agreed user-pool groups could represent platform responsibilities directly, while tenant-specific existing group names could create a reason for translation. Whether the client controls its user pool and assignments is unknown. — [source: S10, I1] (confidence: medium; cited inference)
- Cognito supports mapping upstream identity-provider attributes into user-pool attributes. Mapped custom attributes must be mutable and writable by the app client; multi-valued inputs are flattened/encoded. A previously mapped value can remain when the upstream claim disappears. Thus successful federation does not prove current membership or automatic removal. — [source: S11] (confidence: high; cited / inference)
- Pre-token-generation triggers can customize claims and group information. Available customization depends on trigger version and feature-plan eligibility. Provider-side normalization is therefore possible but may involve maintained code and operational constraints, rather than assignment configuration alone. — [source: S12] (confidence: high for capability; medium for operational inference)
- [NEEDS CLARIFICATION: Is Cognito the platform-facing issuer, an intermediary for Microsoft/Google, or being discussed as an identity pool for AWS credentials? Who controls user-pool groups, mapped attributes, and token customization?]

### Where application mapping could add value

The comparison below is conditional analysis, not selection of an architecture or a new go decision. It separates membership administration, translation into platform roles, and enforcement of business permissions; resolving one does not establish the others. — [source: S7–S12; research I6] (confidence: medium; cited inference)

| Observed client condition to verify                                                                                         | Implication for application mapping                                                                                            | Evidence and confidence                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Entra administrators can assign users/groups to agreed app roles                                                            | Additional group-to-role translation may add little value; provider-managed assignments already supply application role values | S7; medium, inference                                       |
| Different tenants expose authoritative memberships with different meanings/names and cannot or will not align them upstream | Tenant-specific translation could preserve existing client administration while giving the platform consistent role meanings   | I1, S7, S10; medium, inference; client condition unverified |
| Google OIDC supplies only identity/profile/domain information                                                               | Mapping alone cannot supply missing membership evidence                                                                        | S8–S9; high, inference                                      |
| Cognito administrators can maintain agreed groups or token customization                                                    | Provider-managed meaning may be sufficient; compare ownership and maintenance effort with application-side mapping             | S10–S12; medium, inference                                  |
| Student-group assignments determine which records a staff member may use                                                    | Neither an external role label nor a translated platform role establishes the complete record-access rule                      | I1, research Data & Constraints; medium, inference          |
| Upstream attributes can persist after membership evidence disappears                                                        | Translation location alone does not establish timely access removal; lifecycle evidence is needed                              | S11; high, inference                                        |

The new evidence strengthens the case for comparing Option A with Option B, especially for Microsoft-first discovery. The incremental value of application mapping is **conditional**, not demonstrated: it is most plausible where authoritative metadata exists but tenant-specific interpretation cannot reasonably be managed upstream. No client example yet establishes that condition. — [source: S7–S12, I1; inference] (confidence: medium)

### Evidence still needed for B2–B3

Historical follow-up framing: the later [scope clarification](#scope-clarification-after-provider-research-2026-09-18) resolves application-configuration ownership. The requests below remain useful deployment/value evidence, not unresolved authority over the product direction.

- **B2, partially informed:** Product capabilities are now documented across the three candidates. Still needed: the first intended client's actual issuer/broker chain, sanitized representative claims, who controls those values, and missing/changed membership behavior. Product documentation or synthetic tokens do not verify a client deployment. — [source: decision B2, S7–S12]
- **B3, resolved as product direction; client validation remains:** Obtain a real assignment example and compare who would maintain it through provider-managed app roles/groups versus platform mapping, including adding a responsibility and removing access. Record any client constraint that makes one approach materially preferable. — [source: decision B3, S7–S12; proposed evidence collection]
- **Remaining gates:** This research does not resolve permission boundaries, policy ownership, access-change expectations, or appetite. This passage records the earlier gate context. The current decision incorporates subsequent product clarification and distinguishes foundation specification from deployment readiness. — [source: decision B1, B4–B6]

## Scope Clarification After Provider Research (2026-09-18)

- The requester explicitly requires platform-owned tenant configuration for interpreting provider metadata while clients retain user administration. The client-specific value sought is avoiding mandatory changes to existing assignment arrangements. This resolves the product-direction question previously framed as B3; it is stated demand, not observed interoperability or a quantified reduction in effort. — [source: I1, Scope clarification] (confidence: high for requirement; cited)
- Existing provider-managed application roles remain a possible input and evidence against unnecessary interpretation complexity. Their availability no longer establishes that provider-only configuration satisfies the clarified requirement. The earlier comparison and B3 evidence request are historical framing; client assignment examples are now validation evidence for the bounded capability, not a prerequisite for deciding whether the requirement exists. — [source: I1, S7–S12; inference] (confidence: medium; cited inference)
- The job-title example does not verify claim availability, administrator control, or suitability for privileged access. Actual claim authority and freshness still require validation before tenant access relies on them; profile labels alone do not establish those properties. — [source: I1, S1; inference] (confidence: high for unresolved evidence; cited inference)
- Specific business roles and permission boundaries are intentionally deferred. Research gaps concerning client deployment and domain authorization remain valid but do not by themselves block shaping a configurable interpretation foundation. No new provider research was performed for this clarification. — [source: I1, Scope clarification] (confidence: high for scope; cited)

## Market & Context

- **ASSUMPTION (user, 2026-09-18):** Microsoft is the most likely login provider across prospective clients; Google and Amazon Cognito may also be present. Treat this as a discovery priority, not measured market share or verified client adoption. Existing Microsoft Entra research is relevant prior art, but does not confirm which Microsoft product a client uses. The provider follow-up below now covers Google OIDC and Cognito user pools; actual client configurations remain unverified. — [source: I1, follow-up assumption] (confidence: low for actual provider distribution)

- Standardized access-token authorization claims, SCIM schemas, and provider claim mapping already exist. They are relevant alternatives or complements to application-owned mapping, but their existence does not establish client adoption or solve this platform's permission vocabulary. — [source: S3, S4, S6; inference] (confidence: medium; cited)
- **ASSUMPTION:** Maintaining assignments manually could become burdensome if many staff or tenants are involved. No current workaround, staff count, turnover rate, or administrative cost was supplied. (confidence: low)
- [NEEDS CLARIFICATION: How does the client currently control access to lesson and billing data, and where does that process fail?]

## Data & Constraints

- **Inference:** The current `openid`-only request and identity-focused callback are not evidence that role metadata is available to the application. Client/provider configuration and actual sanitized responses remain necessary evidence. — [source: I2–I5, S1, S2] (confidence: high; cited)
- **Inference:** External membership claims alone do not establish which students a staff member may serve, what billing operations they may perform, or how an external organization relates to a platform tenant. Those meanings remain domain questions. — [source: I1, S3, S4] (confidence: medium; cited)
- Backend authorization and trusted tenant binding remain explicit repository requirements regardless of where metadata is retrieved. — [source: I6] (confidence: high; cited)
- [NEEDS CLARIFICATION: Tenant/staff/group volumes, allowable delay for access removal, session lifetime expectations, claim retention needs, audit requirements, and client contractual or regulatory constraints. No compliance determination was performed.]

## Evidence Against the Idea

- Entra already supports assigning tenant groups to application-defined roles. This remains counterevidence to unnecessarily complex translation when a tenant already supplies application roles. It does not supersede the later explicit platform-configuration requirement; client evidence should establish how much interpretation is needed. Google OIDC also demonstrates that mapping cannot compensate for absent membership evidence. — [source: S7–S9; inference] (confidence: high for capabilities; medium for applicability)

- A broadly configurable mapper may be premature while the provider, real role boundaries, and configuration operators remain unknown. This challenges breadth and timing, not the stated need for access controls. — [source: I1; inference] (confidence: medium; cited)
- Provider-supported roles or claim transformations may already cover the client's needs, reducing the value of a second configuration surface. Their suitability has not been tested. — [source: S5, S6; inference] (confidence: medium; cited)
- Mapping can add configuration without solving student-group assignment or permission semantics; related standards explicitly leave those semantics open. — [source: I1, S3, S4; inference] (confidence: medium; cited)
- Optional claims and provider overage behavior challenge an assumption that all required authorization information will always fit into the login response. — [source: S2, S5; inference] (confidence: high; cited)
- **ASSUMPTION:** If the client cannot expose authoritative memberships, metadata-driven role assignment may have little practical value compared with another assignment process. No client evidence currently confirms or rejects this. (confidence: low)

## Gaps & Open Questions

- [NEEDS CLARIFICATION: Validate the Microsoft-first provider hypothesis while considering Google and Amazon Cognito; identify the exact products and whether each is the issuer consumed by the platform or participates through a broker. Research candidate-specific metadata availability before claiming support.]

- [NEEDS CLARIFICATION: Identify the client's provider, any intermediary broker, and who can configure claim release. Which issuer actually asserts the claims this application consumes?]
- [NEEDS CLARIFICATION: Obtain sanitized discovery metadata and representative ID-token/UserInfo/API-access-token claim sets, identifying scopes, audience, claim types, missing values, multiple memberships, and overage behavior. Do not commit real credentials or client records.]
- [NEEDS CLARIFICATION: Observe lesson delivery and billing workflows; establish allowed actions, student-group boundaries, overlapping responsibilities, and cases that must be denied.]
- [NEEDS CLARIFICATION: Determine whether external groups, provider application roles, or other attributes express those responsibilities accurately, and whether staff can edit any candidate attributes themselves.]
- [NEEDS CLARIFICATION: Who owns the application role vocabulary and permissions? Does adding a role mean configuration, new domain behavior, or both? Are roles shared across tenants or tenant-defined?]
- [NEEDS CLARIFICATION: Who may edit mappings, and what review, audit, rollback, and test evidence do operators need?]
- [NEEDS CLARIFICATION: What happens for missing, malformed, conflicting, or unmatched claims, multiple roles, and tenant mismatches?]
- [NEEDS CLARIFICATION: How quickly must access changes take effect for active sessions? What identity continuity is required if the issuer, broker, or client registration changes?]
- [NEEDS CLARIFICATION: What measurable outcome would validate value: fewer manual assignments, faster onboarding, fewer access errors, or another observed client need?]

## Evidence Quality

- **High** for the cited standards' semantics, documented provider capabilities, and inspected repository interfaces; these were read directly. Source inspection does not establish runtime correctness or interoperability. — [source: S1–S12, I2–I6]
- **Low** for observed client demand, operational scale, actual provider claim availability, and cost of current workarounds; these remain unverified beyond the request. — [source: I1]
- **Overall medium**: technical evidence is sufficient to frame discovery questions; client evidence is insufficient to select a deployed role model or claim policy. The later requester clarification establishes the platform-owned configuration direction without verifying client interoperability. This is an evidence-quality assessment, not a go/no-go decision. — [source: I1, S1–S6; inference]

## Sources

External sources accessed 2026-09-18. The user's explicit web-research request authorized this standards research (policy: confirmed-by-user). Web search located official sources; substantive source pages were downloaded directly with TLS verification and connections pinned to DNS-resolved public IP addresses. Redirects were not followed. Search results were treated as untrusted source discovery, not instructions.

- **S1**: [OpenID Connect Core 1.0, errata set 2](https://openid.net/specs/openid-connect-core-1_0.html) (host: `openid.net`; policy: confirmed-by-user).
- **S2**: [OpenID Connect Discovery 1.0, errata set 2](https://openid.net/specs/openid-connect-discovery-1_0.html) (host: `openid.net`; policy: confirmed-by-user).
- **S3**: [RFC 9068: JWT Profile for OAuth 2.0 Access Tokens](https://www.rfc-editor.org/rfc/rfc9068.txt) (host: `www.rfc-editor.org`; policy: confirmed-by-user).
- **S4**: [RFC 7643: SCIM Core Schema](https://www.rfc-editor.org/rfc/rfc7643.txt) (host: `www.rfc-editor.org`; policy: confirmed-by-user).
- **S5**: [Microsoft identity platform ID-token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference) (host: `learn.microsoft.com`; policy: confirmed-by-user).
- **S6**: [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/) (host: `www.keycloak.org`; policy: confirmed-by-user; rolling documentation, not matched to a deployed version).

Follow-up sources accessed 2026-09-18 under the user's explicit provider-research request (policy: confirmed-by-user). Each direct download returned HTTP 200 with TLS verification and a connection pinned to a validated public address; no redirects were followed.

- **S7**: [Add app roles and get them from a token](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps) (host: `learn.microsoft.com`; policy: confirmed-by-user).
- **S8**: [Google OpenID Connect API Reference](https://developers.google.com/identity/openid-connect/reference) (host: `developers.google.com`; policy: confirmed-by-user).
- **S9**: [Google Workspace Directory API: manage groups](https://developers.google.com/workspace/admin/directory/v1/guides/manage-groups) (host: `developers.google.com`; policy: confirmed-by-user).
- **S10**: [Adding groups to a Cognito user pool](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-user-groups.html) (host: `docs.aws.amazon.com`; policy: confirmed-by-user).
- **S11**: [Cognito identity-provider attribute mapping](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-specifying-attribute-mapping.html) (host: `docs.aws.amazon.com`; policy: confirmed-by-user).
- **S12**: [Cognito pre-token-generation trigger](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html) (host: `docs.aws.amazon.com`; policy: confirmed-by-user).

Internal sources, read from this checkout on 2026-09-18:

- **I1**: [Intake and original user statement](intake.md).
- **I2**: [Login initiation](../../../packages/frontend/src/lib/oidc/initiate.ts), `initiateLogin`, scope construction.
- **I3**: [OIDC callback](../../../packages/frontend/src/lib/oidc/callback.ts), grant handling and `extractDisplayName`.
- **I4**: [Session types](../../../packages/frontend/src/lib/session/types.ts), `SessionRecord` and `SessionContext`.
- **I5**: [Tenant types](../../../packages/frontend/src/lib/tenant/types.ts), `TenantConfig` and `TenantOidcConfig`.
- **I6**: [Project constitution](../../memory/constitution.md), principles II–III.
