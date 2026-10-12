# Register configured endpoints and identity

Inspect the actual partner, environment, and live endpoints. Current official setup: https://docs.air3.com/products/identity/issuing-credentials and https://docs.air3.com/products/identity/backend-hosting (reviewed 2026-10-12). If the Dashboard differs, verify current instructions rather than insisting on a remembered field.

## JWKS and application domain

Choose the URL actually served. The SD-JWT issuer service has no Partner JWT JWKS route, so use the web app's `/api/.well-known/jwks` or another public HTTPS host serving the same `PARTNER_JWKS`. Check it with:

```bash
node <skill-base-dir>/scripts/jwks.mjs --check <actual-public-https-jwks-url>
```

Register that exact URL in Dashboard → Account → General → JWKS URL; AIR fetches it with no path discovery.

AIR is gated: AIR Kit only loads on HTTPS origins whitelisted under Account → Domains (up to 3, wildcards such as `*.myapp.example.com` allowed), in sandbox and production. `localhost` and plain-HTTP origins never work. Tell the user to whitelist the actual web origin; for local testing that is the web app's tunnel domain, and the app must be opened at that tunnel URL. When the tunnel URL changes, the new domain must be whitelisted, the stale one removed, and the JWKS URL updated. Preserve existing whitelisted production domains; do not replace them with an ephemeral tunnel.

A Cloudflare quick tunnel can die with `Unauthorized: Tunnel not found`, and its hostname never comes back. A new web host means a new JWKS URL and a new Dashboard domain. A new issuer host means a new `did:web`, new Available Credentials, Issue Credential, and Revocation Status URLs, and a new `vct` when the type is hosted on the issuer origin. Update them together: set `ISSUER_ORIGIN`, run `issuer-did.mjs --rehost`, `vct.mjs plan --replace` and `vct.mjs schema --rehost`, and update the web `NEXT_PUBLIC_ISSUER_DID` (issuer-did writes it). Then mark issuer, JWKS, and domain registration unconfirmed (`provision.mjs write-ids --jwks-registered no --domain-whitelisted no`; `--rehost` already resets issuer registration) until the user has updated the Dashboard. Prefer a stable host (deployment or reserved tunnel domain) before issuing any credential that should be kept.

One Partner ID maps to one registered JWKS URL. When issuer and verifier capabilities use the same Partner ID, serve both public signing keys from that one JWKS document; use a second Partner ID only if separate JWKS URLs are required.

## Issuer

Credential menus (schemas, programs, DID settings) stay hidden until an issuer DID is registered. In **Issuer → Settings** of the target environment's Dashboard:

- Issuer DID: the recorded `did:web:…`, which must equal the `id` served at `${ISSUER_ORIGIN}/.well-known/did.json` (`issuer-did.mjs --check`)
- Issuer API key: the backend `API_KEY`; AIR sends it as `x-api-key`
- Supported signature type: `SD_JWT_VC`
- JWKS URL for the partner keys
- Available Credentials API (`availableVcApiUrl`), Issue Credential API (`issueVcApiUrl`), and Revocation Status API (`revocationStatusApiUrl`): copy the exact URLs from `PARTNER.md` → Issuer endpoints, written by `issuer-did.mjs` (for the reference backend: `${ISSUER_ORIGIN}/available-vc`, `${ISSUER_ORIGIN}/issue-vc`, `${ISSUER_ORIGIN}/revocation-status/:nonce`). If a field still says pending, run `issuer-did.mjs --check` first. Give the user these URLs verbatim; do not retype them from memory

The user can copy `API_KEY` from the gitignored backend configuration into the Dashboard field. Do not print it in chat, put it into documentation, or ask for private signing keys. If CORS is enabled on the issuer or a proxy, it must allow `*.air3.com`.

SD-JWT registration is self-serve in sandbox and production; there is no activation email. Iden3 (`BJJ_SIG_2021`) requires the AIR team. After registration, design the credential and create its type and issuance program using [schema.md](schema.md); the skill prepares the Dashboard values.

## Verifier

Register its signing JWKS and browser domain as applicable, then create/select a verification program. Do not generate an issuer backend to enable verification by default. If credential menus are hidden, inspect the actual account state and current Dashboard guidance; explain only that access step.

## Production

Production uses the separate Dashboard at https://developers.air3.com/dashboard with its own Partner ID, issuer registration, credential types, programs, JWKS, and domains; nothing carries over from sandbox. Register them the same way. The issuer DID follows the production `ISSUER_ORIGIN`, so use a custom domain you control. Prepare a reviewable checklist of public IDs/endpoints; never send mail or submit forms without explicit authorization. Automated context/key/provision commands are sandbox-only; follow [environments.md](environments.md).

## Record confirmed state

Record each action only after it has actually been completed or the user confirms that specific action through the registration-state question in [questions.md](questions.md):

```bash
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --jwks-url <actual-url> --jwks-registered yes
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --issuer-registered yes
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --domain-whitelisted yes
```

Issuer registration is inapplicable to a verifier-only setup. A live JWKS or DID document check does not prove Dashboard registration. A `403` from the issuer usually means a missing or mismatched `x-api-key`; inspect the request route, credentials, and backend error before diagnosing it.
