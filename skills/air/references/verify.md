# Verification

Verifier-only apps use signing keys and public registered JWKS without an issuer backend or issuer API keys. Complete [init.md](init.md)'s verifier path and [register.md](register.md). BYO auth is supported for verifier roles.

## Program

Create/select a verification program in Dashboard → Verifier → Program. Confirm the accepted proof type (`SD_JWT_VC` by default; Iden3 programs are AIR-enabled), requested claims and selective disclosure, issuer revocation checks, and any trusted issuer DID restriction. SD-JWT verification is off-chain. Publish and record the actual ID with the credential type and trusted issuers your backend accepts; ask for missing values with the Program and Issuers questions in [questions.md](questions.md):

```bash
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --verify-program-id <actual-id> --vct <credential type> --trusted-issuer <did:web:issuer-host>
```

## Flow (AIR Kit 1.12)

1. The authenticated app requests `POST /api/partner-jwt` with `{ "operation": "verify" }`. The server returns a `verify`-scoped Partner JWT and a fresh nonce (at least 128 bits) that it stores against the user's session.
2. The client calls `verifyCredential({ authToken, programId, fieldsToDisclose, nonce })`. `fieldsToDisclose` is required for `SD_JWT_VC` programs: a list of claim names, dotted paths for nested claims (`address.city`), or `"*"`. `nonce` is optional in the SDK but required by this skill's flow: without it the presentation is a replayable bearer token. Do not pass the removed `offchain` option.
3. Handle the returned union on `status`: `Compliant`, `Non-Compliant`, `Pending`, `Revoking`, `Revoked`, `Expired`, `NotFound`, plus rejected promises such as `USER_CANCELLED` and `CHANNEL_CLOSED`. Only `Compliant` carries `verifiablePresentation`; `zkProofs`, `transactionHash`, and `disclosedData` are no longer populated.
4. The client posts `result.verifiablePresentation` to the backend. AIR's check ran in the browser and the presentation wrapper (including `holder`) is unsigned, so the app grants nothing until the backend check passes.
5. The backend consumes the session nonce and verifies the compact SD-JWT inside `verifiableCredential[0].id` (`data:application/dc+sd-jwt,` or legacy `vc+sd-jwt,`).

`jwks.mjs emit` writes this for Next App Router when the role includes verification: the token route returns `{ token, nonce }`, `app/api/air/verify-presentation/route.ts` runs the check, and `verify-air-sd-jwt.ts` is the docs reference implementation (`@sd-jwt/sd-jwt-vc@^0.20`, `jose@^5`). Implement `storeVerificationNonce` and `consumeVerificationNonce` in `air-token-auth.ts` with the app's session store (one pending nonce per user, short TTL, delete on read). Configure server env `AIR_VERIFY_PROGRAM_ID`, `AIR_TRUSTED_ISSUERS` (comma-separated did:web DIDs), `AIR_EXPECTED_VCT`, and optional `AIR_REQUIRED_CLAIMS` (dotted paths). Act on the verified claims inside that route, not on the client's status.

## Backend checks

Always: `iss` is on the allowlist (keys from your configuration, never a URL taken from the token); issuer signature verifies against the did:web document's `assertionMethod` keys (`kid` is `<did>#<key>`; older credentials use only the fragment); every disclosure digest appears in `_sd` with `_sd_alg: sha-256`; `exp`/`nbf` are valid; `vct` is the expected type; every requested field is present. Optionally check revocation.

With a nonce and `cnf.jwk` in the issuer JWT (AIR issuance always sets it), a KB-JWT must be present: `typ: kb+jwt`, `alg: ES256`, signed by `cnf.jwk`, `nonce` equals the stored nonce, `aud` equals your `programId`, `iat` within the freshness window (for example 5 minutes, 60 seconds skew), and `sd_hash` matches the token up to the final `~`. A missing KB-JWT then means it was stripped: reject. Any `nonce`, `aud`, signature, or `sd_hash` mismatch is a rejection.

For another framework or language, port the same checks; the library verifies KB-JWT `typ`, signature, `nonce`, and `sd_hash` but not `aud` or `iat` age, and ignores the KB-JWT unless given the nonce.

## Prerequisite check

```bash
node <skill-base-dir>/scripts/verify.mjs --check
```

This checks recorded prerequisites and the presence of a backend presentation check, not live SDK verification. Run a real verification in the app when configured and authorized, and test that a replayed presentation (same nonce twice), a wrong `programId`, and a tampered disclosure are rejected; otherwise report the precise pending prerequisite.

Agent verification: use [agent.md](agent.md), not a reimplementation of wallet signing/session logic. Troubleshooting: [verification.md](verification.md).
