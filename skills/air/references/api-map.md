# API boundaries

| Component | Operation | Authentication / implementation |
|---|---|---|
| Partner browser | `issueCredential()` / `verifyCredential()` | AIR Kit with an operation-scoped Partner JWT (`authToken`); inspect installed types |
| AIR → issuer backend | `POST /available-vc`, `POST /issue-vc` | Called by AIR during SDK issuance with `x-api-key: <API_KEY>`; never called from the browser |
| Partner servers → issuer backend | `POST /admin/issue-vc`, `POST /admin/revoke`, `GET /admin/issuance-history`, `POST /admin/publish-token-status-list` | `x-admin-api-key: <ADMIN_API_KEY>`; server-to-server only |
| Verifiers / AIR → issuer backend | `GET /revocation-status/:nonce`, `GET /statuslist/:partition` | Public, under stable `ISSUER_ORIGIN` |
| Verifiers / AIR → issuer backend | `GET /.well-known/did.json`, `/.well-known/jwt-vc-issuer`, `/.well-known/air-partner-info` | Public; the DID document is the `did:web` issuer identity and its keys; `air-partner-info` returns `{ partnerId }`, which must equal `PARTNER_ID` |
| Issuer backend → AIR API | `POST /v2/auth/initialize-user` | `x-partner-id` header and body `partnerJwt` (claims `partnerId`, `scope: "issue"`, recipient `email`) |
| Issuer backend → AIR API | `POST /dstorage/vcs` | `x-partner-auth: <Partner JWT>` with `scope: "issue"`, without an email claim |
| Partner web server | `POST /api/partner-jwt` | Verified session and operation authorization, then server signing; returns a stored nonce for `verify` |
| Partner web server | `POST /api/air/verify-presentation` | Verified session; consumes the nonce and verifies the SD-JWT presentation |
| Partner web server | `GET /api/.well-known/jwks` | Public keys only; registered as the partner JWKS URL |
| Partner agent backend → AIR API | `POST /v2/auth/agent/keys/partner` (bind), `/rotate`, `DELETE` (revoke); `POST /v2/auth/agent/session`; `POST /v2/auth/agent/checkout-session` | Bind/rotate/revoke: `x-partner-id`, `x-partner-access-token` (user's `getAccessToken()`), `x-partner-jwt`; session/checkout: `x-partner-id`, `x-agent-api-key`. See [agent.md](agent.md) |
| Partner agent backend → Credential API | `GET /v2/credentials`, `POST /v2/credentials/verify-by-agent` | `Authorization: Bearer <agent JWT>`; agent JWTs only |
| Wallet agent APIs | Agent wallet signing | Delegate to the installed wallet skill's supported workflow |

| Environment | `initialize-user` origin | dStorage base |
|---|---|---|
| Sandbox | `https://air.api.sandbox.air3.com` | `https://api.sandbox.mocachain.org/v1` |
| Production | `https://air.api.air3.com` | `https://mocachain-mainnet.api.air3.com/v1` |

AIR's credential API is a separate host that the SDK calls during issuance; it then calls the issuer. In sandbox it is `https://credential-testnet.api.sandbox.air3.com`, for example `POST /v2/issuer/<partnerId>/issue-vc`, whose 403/502/503 the browser shows as `ISSUER_BACKEND_UNAVAILABLE` (see [issuance.md](issuance.md)). The same path on `https://air.api.sandbox.air3.com` returns 404; do not probe the AIR API host for it. The production credential API host is `https://credential-mainnet.api.air3.com`.

| Environment | AIR API (auth, agent keys, sessions, checkout) | Credential API (SDK issuance/verification, agent list/verify) |
|---|---|---|
| Sandbox | `https://air.api.sandbox.air3.com` | `https://credential-testnet.api.sandbox.air3.com` |
| Production | `https://air.api.air3.com` | `https://credential-mainnet.api.air3.com` |

AIR login tokens are verified against `https://static.sandbox.air3.com/.well-known/jwks.json`, `https://account.sandbox-testnet.air3.com/.well-known/jwks.json`, then `https://static.air3.com/.well-known/jwks.json` in sandbox, and only `https://static.air3.com/.well-known/jwks.json` in production.

Do not mix these hosts or headers. Backend origin comes from actual deployment/tunnel configuration. The issuer DID is `did:web:<host of ISSUER_ORIGIN>`; it resolves to `/.well-known/did.json` but is not itself a route to call.

One Partner ID has one registered JWKS URL. If issuer and verifier share a Partner ID, publish both required public keys from that single JWKS document; request a second Partner ID only when separate JWKS URLs are genuinely required.
