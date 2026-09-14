# Schema and issuance program

Inspect the selected backend's base schema class, registry, and eligibility implementation. Read current schema/program Dashboard documentation via [sources.md](sources.md). Do not copy a class shape across backend versions without inspecting it.

## Required observed inputs

After issuer registration, create or select a Dashboard schema and capture its schema ID, credential type, JSON schema URL, JSON-LD context URL, and exact subject field types. These URLs identify schema documents; they are not issuer claim URLs. Obtain them from the Dashboard/export or existing configuration, asking only for missing information.

Create/select and publish an issuance program referencing that schema and issuer, with the intended proof/signature type and on-chain behavior. Record the actual program ID separately from the schema ID. An SDK parameter called `credentialId` may represent the issuance program ID; confirm its installed type/documentation rather than interchanging IDs.

Store public IDs using `provision.mjs --env sandbox write-ids --schema-id <id> --issue-program-id <id>`. Record schema type/URLs, selected program, backend version, and source-data mapping in `AIR.md`. Multiple programs need an explicit selection per operation; do not pass a list as one SDK program ID.

## Implementation

- Match schema keys/types exactly. Confirm the base class sets holder identity before omitting `credentialSubject.id`; in `air-issuer-service` it is framework-owned.
- Implement eligibility/authorization and source-data lookup by the trusted user/identifier supplied through the verified flow. A sample `is_member: true` is not production authorization.
- Prefer derived claims where they satisfy the product requirement. Do not silently change a required schema field or copy raw PII into unrelated claims.
- Use the backend's actual expiry units and register the schema implementation in its registry.
- Confirm the available-credentials result exposes the intended schema for an eligible user and excludes an ineligible one. Then test issuance and verification against the same configuration.

If schema/program creation is pending, scaffold only what is independent and describe the missing Dashboard artifact. Do not claim issuance is ready.
