# Authentication

Use [sources.md](sources.md) and the actual component's contract. AIR Partner JWT authentication and the issuer's private API authentication are separate.

## Partner JWT

Sign server-side using an RSA/RS256 or P-256/ES256 key. The helpers derive the algorithm from the key, preserve imported `kid`, and validate that published JWKS matches. A `kid` is a key identifier; it need not equal Partner ID. Fresh generated keys use Partner ID as a convenience convention.

| Purpose | Claims |
|---|---|
| SDK/direct issuance | `partnerId`, `scope: "issue"`, `iat`, `exp` |
| Verification | `partnerId`, `scope: "verify"`, `iat`, `exp` |
| BYO login | `partnerId`, trusted user `email`, `iat`, `exp` |

Use `kid`, `alg`, and `typ: "JWT"` headers. Five-minute expiry is recommended; the local helpers cap lifetime at 15 minutes as a skill policy, not a claimed AIR protocol limit. Login identity comes from verified server authentication; credential recipients are resolved through the documented issuance flow rather than invented JWT fields.

Backend/web signing config uses `PARTNER_PRIVATE_KEY_DER` (PKCS#8 base64), `PARTNER_PRIVATE_KEY_KID`, `PARTNER_ID`, and public `SD_JWT_JWKS`. Never expose private material through `NEXT_PUBLIC_*`. Imported JWKS must match the actual private key and contain public material only.

AIR Kit 1.11.1 removed `AirUserDetails.partnerUserId`. Do not add, trust, or document a `partnerUserId` claim; keep any partner application's user ID in its own database when needed.

The generated web endpoint supports only operations selected for that role/auth model and requires an implemented authentication adapter. It fails closed by default. `jwt.mjs` is a dependency-free local diagnostic helper; it is not an application session endpoint.

## JWKS and headers

Serve a valid public-key document on public HTTPS and register the exact URL in the Dashboard. Use the backend's actual JWKS route or the generated web route. `[scope, kid, algorithm, expiry, signature, partner]` must all match the requested operation and published key; matching `kid` strings alone is insufficient.

For hosted AIR APIs, use the operation's documented Partner JWT header/token parameter. For self-hosted `air-issuer-service`, inspect its guards: holder-facing `/available-vc` and `/issue-vc` typically use `x-api-key`, admin operations use `x-admin-api-key`. AIR's `/issuer/{issuerDidHash}/...` proxy is a different component, invoked by the SDK. Never expose the private issuer API key to browser code.

For 401/403, inspect which component responded, then check registration, URL reachability, signature/key/algorithm, token expiry/scope, and session/operation authorization. Do not assume the status code alone identifies the cause.
