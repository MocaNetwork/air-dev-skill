# Issuance responsibilities and contracts

Two ways to start issuance share the same issuer responsibility. The partner's backend authorizes issuance, loads trusted source data, builds/signs the VC, encrypts it for the holder, stores it in dStorage, and makes the result/reference available through the integration. AIR Kit orchestrates the client experience; it does not become the credential issuer.

## SDK-led issuance

1. The partner app calls `airService.issueCredential()` with its issuance program/schema configuration and an optional identifier when supported by the installed SDK.
2. AIR Kit ensures the user is logged into AIR.
3. The SDK discovers available credentials through AIR's `GET /issuer/{issuerDidHash}/available-vc` proxy.
4. The user selects a credential and confirms issuance.
5. The SDK calls AIR's `POST /issuer/{issuerDidHash}/issue-vc` proxy.
6. AIR forwards holder DID, public key, schema, and identifier to the issuer backend according to the configured backend contract.
7. The issuer backend performs authorization, data retrieval, VC generation/signing, encryption, and dStorage persistence.
8. The SDK returns the issuance result/reference defined by its installed version to the partner app.

These AIR proxy routes are distinct from the self-hosted backend's `POST /available-vc` and `POST /issue-vc`. Do not send the issuer's API key to the browser or directly call its protected handlers from browser code. Do not manually reimplement SDK proxy calls or guess how `issuerDidHash` is calculated.

The SDK parameters and return shape vary by version. Before writing a call, follow [sources.md](sources.md), inspect installed types, and record the actual contract. If an older SDK expects `credentialSubject`, obtain it through the verified server-side preview flow; never substitute an empty hint or let browser input authorize issuance. A backend handler may return an empty body while the SDK exposes a result through its orchestration; inspect each layer independently.

## Direct backend issuance

A trusted backend event or job can issue without an interactive SDK flow. The documented sequence is:

1. Call AIR's `POST /auth/initialize-user` with the recipient email and an issuance-scoped Partner JWT in `x-partner-auth`. The response provides AIR's `userId`, holder `did`, and `publicKey`; AIR's UUID is not necessarily the partner application's primary user ID.
2. The issuer backend authorizes the recipient, loads source data, builds and signs the VC, and encrypts the resulting envelope.
3. Store the encrypted envelope with AIR's `POST /dstorage/vcs` using `holderDid`, `schemaId`, `expiresAt`, `data`, `iv`, `authTag`, `encryptedKey`, and optional `externalId`. A successful response is `201` with `storagePath`, `state`, `envelopeVersion`, and `createdAt`.

Use the documented `batch-issue-vc-csv` pattern or the installed backend's equivalent for batch work. Direct issuance does **not** call the issuer-hosted `/issue-vc` endpoint; that endpoint is the AIR-to-issuer route used by the hosted SDK flow. The issuer backend remains responsible for authorization, data retrieval, VC generation/signing, encryption, and storage in every mode.

Both paths preserve issuer authorization and source-data ownership. An identifier is lookup context, not proof of entitlement. AIR-supplied holder identity is trusted only over the authenticated AIR-to-issuer boundary. Direct jobs must resolve holder identity through a trusted server flow.

## Backend implementation

For `air-issuer-service`, inspect the checked-out `.env.example`, config, controllers, and schema base class before changing code. Common configuration includes `SEED`, `PARTNER_ID`, `PARTNER_PRIVATE_KEY_KID`, `PARTNER_PRIVATE_KEY_DER`, `SD_JWT_JWKS`, `API_KEY`, `ADMIN_API_KEY`, `ISSUER_ORIGIN`, and optional `DATABASE_URL`. Confirm network selection from source rather than adding guessed API-origin variables.

`SEED` determines issuer identity and must be preserved. Read DID with the installed backend repl using `issuer-did.mjs`. Confirm no-database boot is supported when that option was chosen. Never use a cryptographic reimplementation to work around a failed backend boot.

Schema implementation: [schema.md](schema.md). Keep the backend's wire format and encryption implementation intact. Check actual status-route construction before explaining credential revocation URLs.
