# Authentication

Use [sources.md](sources.md) and the actual component's contract. AIR Partner JWT authentication and the issuer's private API authentication are separate.

## Partner JWT

Sign server-side using an RSA/RS256 or P-256/ES256 key. The helpers derive the algorithm from the key, record it as `PARTNER_PRIVATE_KEY_ALG` for the issuer backend, preserve imported `kid`, and validate that published JWKS matches. A `kid` is a key identifier; it need not equal Partner ID. Fresh generated keys use Partner ID as a convenience convention.

| Purpose | Claims | Transport |
|---|---|---|
| SDK issuance | `partnerId`, `scope: "issue"`, `iat`, `exp` | `issueCredential({ authToken })` |
| Verification | `partnerId`, `scope: "verify"`, `iat`, `exp` | `verifyCredential({ authToken })` |
| Direct issuance: `initialize-user` | `partnerId`, `scope: "issue"`, recipient `email`, `iat`, `exp` | Body `partnerJwt`, header `x-partner-id` |
| Direct issuance: `dstorage/vcs` | `partnerId`, `scope: "issue"`, `iat`, `exp` (no email) | Header `x-partner-auth` |
| BYO login | `partnerId`, trusted user `email`, `iat`, `exp` | `login({ authToken })` |

Every issuance token carries `scope: "issue"`, for `issueCredential` and for direct issuance alike. Verification tokens carry `scope: "verify"`. Only login and `initialize-user` tokens carry `email`. Every token has header `typ: "JWT"`. A token without the scope is treated by AIR as a failed issuer call.

Discrepancy with the docs: the checked-out issuer service (`main_sd-jwt-vc` at 1a7cf6b) signs its own `initialize-user` and dStorage tokens in `PartnerJwtService.generateJwt` without `typ` and without defaulting `scope` (it adds `iss: ISSUER_ORIGIN`). Record this in `AIR.md`. Do not assume that adding `scope` and `typ` makes dStorage accept the token: `POST https://api.sandbox.mocachain.org/v1/dstorage/vcs` has returned `401 Invalid x-partner-auth` for tokens that already had `scope`, `typ`, and `iss`. The next check is the JWKS: fetch the exact JWKS URL registered in the Dashboard, confirm it is the live public document, and confirm it contains the token header `kid` with the public key matching the signing key.

Use `kid`, `alg`, and `typ: "JWT"` headers. Five-minute expiry is recommended; the local helpers cap lifetime at 15 minutes as a skill policy, not a claimed AIR protocol limit. Login identity comes from verified server authentication; credential recipients are resolved through the documented issuance flow rather than invented JWT fields.

The issuer backend uses `PARTNER_PRIVATE_KEY_DER` (PKCS#8 base64), `PARTNER_PRIVATE_KEY_KID`, `PARTNER_PRIVATE_KEY_ALG`, `PARTNER_ID`, and public `PARTNER_JWKS`. The same key also signs its SD-JWT credentials and is published in its `did:web` document, so rotating it is an issuer key change, not just a JWT change. The web server uses the same names except `PARTNER_PRIVATE_KEY_ALG`. Never expose private material through `NEXT_PUBLIC_*`. Imported JWKS must match the actual private key and contain public material only. `SD_JWT_JWKS` is accepted as a fallback name.

### Key rotation

The helpers never rotate. Rotate only when the user explicitly asks, and never by replacing the key in place:

- Partner JWT key: publish the new public key in the registered JWKS alongside the old one, switch signing to the new `kid`, then remove the old key once outstanding JWTs (minutes) have expired.
- Issuer signing key (the same key in the reference service): add the new key to the JWKS **and** the `did:web` document first, and keep the old key published while any credential it signed is unexpired, because those credentials' `kid` points at it. Check whether the checked-out backend can publish more than one key before starting; if it cannot, report that rather than rotating.
- The issuer host is not rotatable: it is the DID.

The holder's key-binding JWT is separate: it is signed by the holder's AIR Account key (ES256) and checked against the credential's `cnf.jwk`, not against partner JWKS.

AIR Kit 1.11+ removed `AirUserDetails.partnerUserId`. Do not add, trust, or document a `partnerUserId` claim; keep any partner application's user ID in its own database, keyed to the AIR user UUID.

The generated web endpoint supports only operations selected for that role/auth model and requires an implemented authentication adapter. It fails closed by default, including for verification until nonce storage is implemented. `jwt.mjs` is a dependency-free local diagnostic helper; it is not an application session endpoint.

## JWKS and headers

Serve a valid public-key document on public HTTPS and register the exact URL in the Dashboard. The SD-JWT issuer service does not serve one; use the generated web route or another public host. `[scope (verify only), kid, algorithm, expiry, signature, partner]` must all match the requested operation and published key; matching `kid` strings alone is insufficient.

For self-hosted `air-issuer-service`, inspect its guards: AIR-facing `/available-vc` and `/issue-vc` use `x-api-key`, admin operations use `x-admin-api-key`. Never expose either issuer key to browser code.

For 401/403, inspect which component responded, then check registration, URL reachability, signature/key/algorithm, token expiry/scope, the `x-partner-id`/email pairing for `initialize-user`, and session/operation authorization. Do not assume the status code alone identifies the cause.
