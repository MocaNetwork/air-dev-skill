# Credential type and issuance program

The user describes the credential they want to issue; the skill produces everything else. The Dashboard form is filled by the user, because it is session-authenticated and has no partner API: the skill prepares every value to paste and records what comes back. Read current Dashboard documentation via [sources.md](sources.md), and inspect the checked-out backend before relying on the class shape below.

## 1. Collect the credential design

Ask with the Credential questions in [questions.md](questions.md): what the credential proves, its claims (name, type, label), which claims a holder may disclose on their own, whether each is always present, validity period, where the data comes from, and where the `vct` URL lives. Prefer derived claims (`tier`, `over_18`) to raw PII. Reserved claims (`id`, `iss`, `sub`, `vct`, `cnf`, `exp`, `iat`, `nbf`, `nonce`, `status`) are set by the issuer service and cannot be claims.

Write the answers to `air/credentials/<name>.json` in the project:

```json
{
  "name": "membership",
  "version": 1,
  "title": "Gold membership",
  "description": "Membership tier held by a customer",
  "locale": "en-US",
  "vctHosting": "issuer",
  "expiryDays": 365,
  "claims": [
    { "path": "tier", "type": "string", "label": "Membership tier", "sd": "always", "mandatory": true },
    { "path": "points", "type": "number", "label": "Points balance", "sd": "never" },
    { "path": "address.city", "type": "string", "label": "City", "mandatory": false }
  ]
}
```

- `name`: lowercase letters, digits, hyphens. Title ≤ 100 and description ≤ 500 characters (Dashboard limits).
- `path`: claim name, or a dotted path for nested claims; verifiers request the same dotted path in `fieldsToDisclose`.
- `type`: `string`, `number`, or `boolean`. `sd`: `always` (selectively disclosable, the default) or `never` (visible in every presentation). `mandatory` defaults to `true`.
- `vctHosting`: `issuer` (default; served by the issuer backend at `${ISSUER_ORIGIN}/vct/<name>/v<version>`), `url` with `"vct": "https://…"` on another domain you control, or `urn` with `"vct": "urn:<namespace>:…"` (identifier only, no hosted metadata).

## 2. Generate the Type Metadata and Dashboard values

Issuer hosting needs the backend's stable public HTTPS `ISSUER_ORIGIN` first ([init.md](init.md)); the vct URL, like the issuer DID, is permanent once credentials carry it.

```bash
node <skill-base-dir>/scripts/vct.mjs plan --spec air/credentials/<name>.json
```

The helper validates the spec, writes IETF SD-JWT VC Type Metadata (`vct`, `name`, `description`, `display`, and `claims` with `path`, `display` labels, `sd`, `mandatory`), and prints the four Dashboard values. With issuer hosting it writes `vct/<name>/v<version>.json` in the backend and adds `src/vct.controller.ts`, registered in `AppModule`, which serves that file at the vct URL. Restart the backend and confirm:

```bash
node <skill-base-dir>/scripts/vct.mjs --check <vct-url> --spec air/credentials/<name>.json
```

For `url` hosting, publish the file the helper wrote under `air/vct/` at exactly that URL, then run the same check.

Give the user the values to paste in **Issuer → Schemas → SD-JWT VCT details**: **Title**, **Description**, **VCT** (the vct URL), and **VCT JSON** (the printed Type Metadata). Always fill VCT JSON: the Dashboard builds the verification program's claim picker from its `claims`. After **Publish**, ask for the schema ID shown by the Dashboard (Registration-state question, then the free-text answer).

A published credential type is immutable. To change claims, labels, or disclosure, bump `version` in the spec and register a new type; the helper refuses to rewrite a published version.

## 3. Generate the backend schema class

```bash
node <skill-base-dir>/scripts/vct.mjs schema --spec air/credentials/<name>.json --schema-id <dashboard-schema-id>
```

The helper writes `src/issuer/sd-jwt-vc-schemas/schema_<SCHEMA_ID>.ts` with `schemaId`, `vct`, the `disclosureFrame` derived from `sd`, `expirySec`, and a typed `Claim`; registers it in that directory's `index.ts`; and records the schema ID and vct in `PARTNER.md`. Existing class files are preserved.

`generateCredentialData(userId)` fails closed until implemented. Implement it with the data source the user named: load the claims for `userId` (the partner identifier AIR resolved for the holder), validate types and values, and never sign browser-supplied values. `expirySec` sets the credential's `exp`; the returned `expiration` is only the preview value.

Known backend behavior (`main_sd-jwt-vc` at 1a7cf6b): `available-vc` calls `generateCredentialData` for every registered schema without catching errors, so one schema throwing for an ineligible user fails the whole preview. Handle eligibility with a per-schema `try`/`catch` (skip that schema) in your fork's `IssuerService.availableVc`.

Register only the real schema. Once it is registered, remove the bundled sample schema (`schema_01KXF7F6Z5XGHXRJY37JEK`, fake claims) from `src/issuer/sd-jwt-vc-schemas/index.ts`: `availableVc` walks every registered schema, and one failure fails the whole preview. Leave `vct#integrity` undefined: the reference marks Dashboard integrity as unfinished.

## 4. Issuance program

Create and publish an issuance program under **Issuer → Programs** with that schema record and the `SD_JWT_VC` proof type. Record the program ID separately; the SDK's `credentialId` is the issuance program ID, while the backend works with `schemaId`. Iden3 schemas (JSON-LD contexts, Schema Builder) apply only to AIR-enabled Iden3 accounts.

```bash
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --issue-program-id <id>
```

Record the selected program, backend commit, and source-data mapping in `AIR.md`. Multiple programs need an explicit selection per operation; do not pass a list as one SDK program ID.

Confirm `/available-vc` returns a preview for an eligible user and excludes an ineligible one, then test issuance and verification against the same configuration. If Dashboard creation is pending, build only what is independent and say which Dashboard artifact is missing. Do not claim issuance is ready.
