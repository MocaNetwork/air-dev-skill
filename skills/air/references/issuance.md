# Issuance responsibilities and contracts

Two ways to start issuance share the same issuer responsibility. The partner's issuer backend authorizes issuance, loads trusted source data, builds and signs the SD-JWT VC under its `did:web` issuer DID, binds it to the holder, encrypts it for the holder, and stores the envelope in dStorage. AIR Kit orchestrates the client experience; it does not become the credential issuer. Reference implementation: `air-issuer-service@main_sd-jwt-vc`.

## SDK-led issuance

1. The partner app calls `airService.issueCredential({ authToken, issuerDid, credentialId, credentialSubject: {} })`. `authToken` is an issuance Partner JWT (`partnerId`, `scope: "issue"`, `iat`, `exp`, header `typ: "JWT"`), `issuerDid` the did:web DID, and `credentialId` the issuance program ID. Pass `{}` as `credentialSubject`; the backend supplies the authoritative claims.
2. AIR Kit ensures the user is logged into AIR.
3. AIR calls the registered issuer `POST /available-vc` with `holderDID`, `pubKey`, `userId`, optional `schemaId`, and `proofType: "SD_JWT_VC"`. The backend returns `{ data: [...] }` previews whose `credentialSubject` is encrypted to `pubKey`.
4. The user reviews the decrypted preview and confirms.
5. AIR calls `POST /issue-vc` with the same identity, the required `schemaId`, and the holder `signingKey` (`{ jwk: EC P-256 }`).
6. The backend loads the final claims, sets `sub` to the holder DID and `cnf` to `signingKey.jwk`, signs the SD-JWT VC, encrypts it to `pubKey`, records it when a database is configured, uploads it to dStorage, and returns `201` with an empty body.
7. The SDK promise resolves on success and rejects on failure. It does not return the VC or a storage path.

Both issuer endpoints require `x-api-key: <API_KEY>`, the value registered with AIR. Use `userId` (the partner identifier AIR resolved) for eligibility and data, not `holderDID` alone. Do not send the issuer API key to the browser, call these handlers from browser code, or change their request/response shapes.

By default `issueCredential` resolves before the credential's on-chain record (hashes and status metadata) is confirmed. Pass `waitForOnchainCompletion: true` when the next step, such as an immediate verification, depends on it. It replaced the removed `offchain` parameter; whether a program writes on-chain is a Dashboard program setting.

## Direct backend issuance

A trusted backend event or job issues without an interactive SDK flow. With the reference service, the partner's own servers call:

```bash
curl -X POST "$ISSUER_ORIGIN/admin/issue-vc" \
  -H "x-admin-api-key: $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{ "userId": "<email AIR knows>", "schemaId": "<SCHEMA_ID>", "vct": "<REGISTERED_VCT>",
        "expiration": "<future ISO 8601>", "credentialSubject": { ... }, "disclosureFrame": { "_sd": [ ... ] } }'
```

- `userId` must be the email AIR knows the user by, and it must be the individual recipient's own address, never a shared or service mailbox. The service resolves or creates the AIR Account with `POST {AIR_API_ORIGIN}/v2/auth/initialize-user`, which returns the holder DID, encryption public key, and the signing public key when present, so direct credentials are holder-bound too. If AIR returns no holder DID or encryption key, do not issue.
- Deduplicate by recipient and program before calling. To change a credential (a tier upgrade), revoke the old one and then issue the new one, so the user never holds two current versions.
- `credentialSubject` must not contain reserved claims: `cnf`, `exp`, `iat`, `id`, `iss`, `nonce`, `status`, `sub`, `vct`, `vct#integrity`. `disclosureFrame` is optional; by default every top-level claim is selectively disclosable.
- No backend schema class is required for this route, but the Dashboard credential type and issuance program still are.
- Only partner servers call `/admin/*`. Keep `ADMIN_API_KEY` out of browsers and logs. Persist and report results only after the request succeeds; history is at `GET /admin/issuance-history` when a database is configured.

A backend that implements the AIR calls itself uses two different surfaces:

| Call | Host (sandbox / production) | Authentication |
|---|---|---|
| `POST /v2/auth/initialize-user` | `https://air.api.sandbox.air3.com` / `https://air.api.air3.com` | `x-partner-id: <PARTNER_ID>` header; body `{ "partnerJwt": <JWT with partnerId, scope "issue", recipient email> }` |
| `POST /dstorage/vcs` | `https://api.sandbox.mocachain.org/v1` / `https://mocachain-mainnet.api.air3.com/v1` | `x-partner-auth: <Partner JWT with scope "issue", without email>`; body includes `holderDid`, `proofType: "SD_JWT_VC"`, `schemaId`, `expiresAt`, `data`, `iv`, `authTag`, `encryptedKey`, and required `externalId` |

The VC must carry the returned signing key in `cnf` and be encrypted to the returned encryption key before storage. Direct issuance does **not** call the AIR-facing `/issue-vc`.

`externalId` is the dStorage dedup key: 16–255 characters from `[A-Za-z0-9._:-]` (a UUID or ULID works). The same value with identical bytes returns the existing object; the same value with different bytes returns `409`. Generate it once per credential and reuse it, with the same encrypted bytes, on every retry; use a new value only for new or corrected content. A `409` can also mean the user declined credentials from this issuer. dStorage answers `201` with a storage path (`dstorage://vc/…`) immediately and seals the object on Moca Chain in the background; to confirm, poll `GET /dstorage/vcs/status?path=<storagePath>` until `status` is `STORED`.

Both paths preserve issuer authorization and source-data ownership. An identifier is lookup context, not proof of entitlement. AIR-supplied holder identity is trusted only over the authenticated AIR-to-issuer boundary. Direct jobs must resolve recipients through a trusted server flow.

## Backend implementation

For `air-issuer-service`, inspect the checked-out README, `.env.example`, `src/app.controller.ts`, and `src/issuer/sd-jwt-vc-schemas/` before changing code. Configuration: `NODE_ENV`, optional `DATABASE_URL`, `ISSUER_ORIGIN`, `PARTNER_ID`, `PARTNER_PRIVATE_KEY_KID`, `PARTNER_PRIVATE_KEY_ALG`, `PARTNER_PRIVATE_KEY_DER`, `PARTNER_JWKS`, `API_KEY`, `ADMIN_API_KEY`; optional `AIR_API_ORIGIN`, `MOCA_CHAIN_API_ORIGIN` (both default per `NODE_ENV`), and `SD_JWT_TSL_PARTITION_SIZE`.

`ISSUER_ORIGIN` is the issuer identity: the DID is `did:web:<host>`, served with the public keys at `/.well-known/did.json` and `/.well-known/jwt-vc-issuer`; credentials are signed with `kid` `<did>#<PARTNER_PRIVATE_KEY_KID>`. Preserve it once credentials exist. Read the DID with `issuer-did.mjs`; never reimplement signing or encryption to work around a failed backend boot.

Schema implementation: [schema.md](schema.md). Keep the backend's wire format and encryption implementation intact. If CORS is enabled on the backend or a proxy, allow `*.air3.com`.

### "Issuer is temporarily unavailable"

In AIR Kit 1.13+ the SDK rejects with `credential/issuer-not-ready` (category `network`). The browser message "Issuer is temporarily unavailable" (`ISSUER_BACKEND_UNAVAILABLE`) comes from AIR's credential API, in sandbox `POST https://credential-testnet.api.sandbox.air3.com/v2/issuer/<partnerId>/issue-vc`. A 403, 502, or 503 there becomes that screen, and so does a 500 from the issuer's own `POST /issue-vc`. It does not prove the issuer is unreachable: on one traced claim AIR's call to `/available-vc` returned 201, and `/issue-vc` returned 500 because dStorage rejected the partner JWT.

Read the issuer log before diagnosing. The reference service does not log HTTP requests and Nest does not log 4xx, so add temporary request logging of method, path, status, `schemaId`, and the `x-api-key` length only (never the key, tokens, or claims). Then:

- No issuer request: AIR is still calling the URL registered in the Dashboard, often a dead tunnel host. Compare it with `PARTNER.md` → Issuer endpoints.
- Issuer 403: the Dashboard issuer API key does not match the backend `API_KEY`.
- Issuer 201 on `/available-vc`, then 500 on `/issue-vc`: AIR reached the issuer, and the failure is inside issuance or dStorage. For dStorage `401 Invalid x-partner-auth`, check the Dashboard JWKS URL and `kid` as described in [auth.md](auth.md). For dStorage `409`, see `externalId` above.

## Revocation and status

All routes run on the issuer service and need a database:

- Find a credential's `revocationNonce` with `GET /admin/issuance-history?holderDid=…&schemaId=…`, revoke with `POST /admin/revoke` `{ "nonce": "<revocationNonce>" }` (`x-admin-api-key`). Revocation is one-way; to change a credential, revoke it and issue a new one.
- `GET /revocation-status/:nonce` returns `{ "isRevoked": boolean }` immediately and is registered as `revocationStatusApiUrl`.
- Optional IETF Token Status List: set `SD_JWT_TSL_PARTITION_SIZE` (a multiple of 8) before the first credential that should carry `status`; it cannot change afterwards. Revocations reach verifiers only after `POST /admin/publish-token-status-list`, so schedule it from one runner (minutes for fraud-sensitive types, hourly or nightly for routine changes) and cache `GET /statuslist/:partition` no longer than the publish interval. The list is valid/revoked only; there is no suspended state.
- Revoking does not delete the stored envelope, and claims already disclosed to verifiers stay with them. Short expiry reduces how much revocation is needed.
