# Idea Intake: Tenant Role Mapping

- **Slug**: tenant-role-mapping
- **Created**: 2026-09-18
- **Source**: Pasted text from the user in this conversation
- **Type**: exploration

## Idea (as captured)

> We are still in discovery and don't have a full picture of what this platform needs to do to add value; however, we do now that there will need to be some concept of permissions and user roles. We know that there will be staff that delivery lessons to particular groups of students and staff that collects that data for billing and possibly other roles we don't know about yet. We have built an authentication system that assumes an OIDC provider for user accounts and we want to lean as much into that standard as we can before we learn with specific OIDC provider our client uses.
>
> We need to learn more about the OIDC specs and standards to get a better sense of what metadata is available. Then we also need a way to map that metadata into user roles within our system. The mapping needs to be configurable at the tenant level and it needs to be extensible enough for us to easily add new roles as we go through discovery.

## Follow-up assumption (2026-09-18)

> I assume the most likely login provider clients will have is Microsoft, but Google and Cognito are probably in the mix also.

Source: user follow-up in this conversation. Microsoft is the leading provider hypothesis; Google and Amazon Cognito are additional candidates. Actual client providers, product variants, and available metadata remain unverified. This assumption guides discovery rather than establishing a provider support commitment.

## Scope clarification (2026-09-18)

The requester clarified that the platform's Tenant Configuration type must contain the information needed to parse provider metadata. Clients will manage their own users; they likely already have role/permission arrangements, and the platform should minimize friction by accommodating those arrangements. Existing Microsoft account job titles were offered as an illustrative way a client might distinguish site administration from more targeted access, not as a verified claim source or a rule granting administrators access.

Specific application roles are intentionally unknown during discovery. The requested capability is a tenant-configurable foundation for interpreting available, trustworthy provider metadata as application roles as they emerge. It does not depend on clients adopting platform-specific assignment administration in their provider. Provider-managed application roles remain valid input when a client already uses them; their availability does not replace the requested platform configuration capability.

Source: explicit user clarification in this conversation. Client user administration and the platform configuration requirement are stated requirements; the existence and suitability of each client's current role/permission arrangements remain assumptions to validate. This clarification supersedes the earlier question of whether provider-managed assignments alone satisfy the requested scope. Exact permission meanings, configuration operators, attribute authority, and deployed provider support remain open.

## Restated

Explore what identity metadata OIDC specifications and related standards make available and how it could support tenant-configurable mapping into application roles. The capability should accommodate roles discovered over time, starting with the known activities of delivering lessons to particular student groups and collecting lesson data for billing.

## Origin & Context

- **Raised by**: The user in this conversation on 2026-09-18; [NEEDS CLARIFICATION: stakeholder role and eventual capability owner].
- **Trigger**: Ongoing platform discovery has identified different staff responsibilities while the full set of valuable workflows and roles remains unknown.
- **Authentication context**: The user reports that an authentication system has been built around an OIDC provider for user accounts. This is supplied context, not an implementation verification performed during intake.
- **Provider context**: The client's specific OIDC provider is not yet known. The user wants to rely on standards as much as possible before that provider is identified.
- **Known activities**: Staff deliver lessons to particular groups of students; staff collect that data for billing. These activities are examples, not an agreed role catalog or permission model.
- **Configuration need**: Metadata-to-role mapping must be configurable per tenant and accommodate additional roles as discovery progresses.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: What metadata and claims do OIDC specifications and related standards define, which are required versus optional, and which role or group concepts depend on provider-specific extensions?]
- [NEEDS CLARIFICATION: Through which protocol artifacts or endpoints is relevant metadata available, and what establishes its authenticity, intended audience, and suitability for authorization decisions?]
- [NEEDS CLARIFICATION: Which OIDC provider does the client use, and which claims, scopes, configuration options, and sample metadata will it actually supply?]
- [NEEDS CLARIFICATION: What application roles and permissions are needed for lesson delivery and billing data collection, and can one staff member perform multiple responsibilities?]
- [NEEDS CLARIFICATION: How does assignment to particular student groups affect access, and what is the relationship between group assignment, tenant membership, roles, and permissions?]
- [NEEDS CLARIFICATION: What tenant-specific mapping inputs and rules are needed, and who is authorized to configure and maintain them?]
- [NEEDS CLARIFICATION: What should happen when metadata is absent, unrecognized, contradictory, or matches more than one mapping?]
- [NEEDS CLARIFICATION: How should changes to provider metadata or tenant mappings affect existing access and active sessions?]
- [NEEDS CLARIFICATION: What does adding a new role require, including defining its permissions, configuring mappings, and maintaining existing tenant behavior?]
- [NEEDS CLARIFICATION: What evidence, client examples, and success criteria would establish that this capability adds value without prematurely fixing a role model?]
