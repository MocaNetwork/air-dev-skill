# API boundaries

| Component | Operation | Authentication / implementation |
|---|---|---|
| Partner browser | `issueCredential()` / `verifyCredential()` | AIR Kit and operation-scoped Partner JWT; inspect installed types |
| AIR proxy used by SDK | `GET /issuer/{issuerDidHash}/available-vc`, `POST /issuer/{issuerDidHash}/issue-vc` | SDK-managed AIR session/proxy requests; do not hand-code or guess the DID hash |
| Issuer backend | `POST /available-vc`, `POST /issue-vc` | AIR-to-issuer forwarding for the hosted SDK flow; backend checks `x-api-key`; direct issuance uses dStorage instead |
| AIR API (direct issuance) | `POST /auth/initialize-user`, `POST /dstorage/vcs` | Partner JWT in `x-partner-auth`; direct backend-to-AIR flow |
| Issuer backend | `GET /credential-status/:nonce`, `GET /revocation-status/:nonce` | Public status checks under stable `ISSUER_ORIGIN` |
| Issuer backend | JWKS route | Public route as implemented by that backend |
| Partner web server | `POST /api/partner-jwt` | Verified session, operation authorization, then server signing |
| Partner web server | `GET /api/.well-known/jwks` | Public keys only |
| AIR account / dStorage APIs | `/auth/initialize-user` and `/dstorage/vcs` | Exact AIR API base and `x-partner-auth` contract; no guessed hosts/headers |
| Wallet agent APIs | Agent signing and verification | Delegate to the installed wallet skill's supported workflow |

Documented AIR API bases are `https://api.sandbox.mocachain.org/v1` (sandbox) and `https://mocachain-mainnet.api.air3.com/v1` (production). Backend origin comes from actual deployment/tunnel configuration. Issuer DID is an identifier derived from the backend, not an HTTP route.

One Partner ID has one registered JWKS URL. If issuer and verifier share a Partner ID, publish both required public keys from that single JWKS document; request a second Partner ID only when separate JWKS URLs are genuinely required.
