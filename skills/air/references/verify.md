# Verification

Verifier-only apps use signing keys and public registered JWKS without an issuer seed, Nest backend, or issuer API keys. Complete [init.md](init.md)'s verifier path and [register.md](register.md). BYO auth is supported for verifier roles.

Create/select a verification program in Dashboard → Verifier → Program. Confirm schema, trusted issuer restrictions, proof type, disclosure requirements, and off-chain/on-chain mode. Publish as required and record the actual ID:

```bash
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --verify-program-id <actual-id>
```

Obtain a fresh Partner JWT with `scope: "verify"` through the authenticated token endpoint using `{ "operation": "verify" }`. Follow [sources.md](sources.md) and inspect installed `verifyCredential` types. Use `authToken` and the selected `programId`; supply disclosure fields/nonce only as required by that version and program.

For AIR Kit 1.11.1, an SD_JWT_VC verification request requires both `fieldsToDisclose` and `nonce`. The compliant result payload is `verifiablePresentation`; `zkProofs`, `transactionHash`, and `disclosedData` are deprecated and may be absent. Verification mode is configured by the program (on-chain or off-chain); do not pass a removed `offchain` option.

Implement consent cancellation, no matching credential, non-compliance, expiry/revocation, and success according to the actual returned union. Do not invent response fields or treat every resolved promise as compliance. Same-network credentials and program configuration are required.

```bash
node <skill-base-dir>/scripts/verify.mjs --check
```

This checks recorded prerequisites, not live SDK verification. Run a real verification in the app when configured and authorized; otherwise report the precise pending prerequisite.

Agent verification: use [agent.md](agent.md), not a reimplementation of wallet signing/session logic. Additional context: [verification.md](verification.md).
