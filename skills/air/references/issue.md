# Implement issuance

Read `PARTNER.md`, `AIR.md`, [issuance.md](issuance.md), and [sources.md](sources.md). Respect `Issuance trigger: sdk|direct|both` and the recorded app paths. If the trigger is unknown, ask the Issuance question from [questions.md](questions.md); frontend presence alone does not determine it.

## Backend

Use the existing issuer backend. For a new project, follow [init.md](init.md): clone/install `air-issuer-service@main_sd-jwt-vc` → configure chosen database → generate/import keys → set stable `ISSUER_ORIGIN` → start → derive and check the did:web DID. `issue.mjs` clones and installs only; its printed plan does not implement issuance.

Implement the backend schema class for each Dashboard credential type with [schema.md](schema.md), using actual Dashboard IDs and source-data rules. Do not offer a real claim with an empty schema or invented program. Backend boot, issuer registration, and successful credential issuance are separate milestones.

## SDK-led flow

Use the existing frontend framework. If Next was selected, scaffold at the recorded web directory and preserve its existing `.env.local`. If scaffolding refuses a nonempty directory, scaffold into a temporary sibling directory and copy the generated application files without replacing that environment file. Inspect package scripts and choose actual backend/web ports; do not assume both can use port 3000.

For Next App Router, create only missing routes:

```bash
node <skill-base-dir>/scripts/jwks.mjs emit --target <recorded-web-directory> --project <project-root>
```

The helper writes JWKS, token route, and an authentication adapter (plus verification routes for verifier roles). Existing files are preserved and must be inspected/adapted, not assumed compatible. Install `jose` in the web app.

`air-token-auth.ts` authenticates the AIR login token, which is a Bearer token: the client sends `Authorization: Bearer <token>` with `login().token` or `(await airService.getAccessToken()).token` on every `/api/partner-jwt` and verification request. The adapter:

- Verifies the token against AIR's JWKS. Sandbox: `https://static.sandbox.air3.com/.well-known/jwks.json`, then `https://account.sandbox-testnet.air3.com/.well-known/jwks.json`, then `https://static.air3.com/.well-known/jwks.json`. Production: `https://static.air3.com/.well-known/jwks.json` only. Key IDs do not overlap; it moves to the next set only on `ERR_JWKS_NO_MATCHING_KEY` and rejects every other error. The docs sessions page lists the same order.
- Requires `payload.partnerId` to equal `PARTNER_ID` and `payload.sub` to be a non-empty string, and returns `sub` as the user id with the role's operations (`["issue"]` for an issuer app).
- Rejects `Sec-Fetch-Site: cross-site` and allows `same-origin`/`same-site`. Otherwise it compares the `Origin` host with `x-forwarded-host` or `Host`: behind a tunnel, Next reports `request.url` as `https://localhost:<port>` while the browser `Origin` is the public host.

Add the application's own authorization policy where needed. For Custom Auth (BYO login), replace the adapter with the app's verified session, which supplies the email. Test that anonymous, cross-site, and wrong-partner requests fail before tunneling.

The emitted routes export `runtime = "nodejs"`. Next 16 with `cacheComponents: true` rejects that export; `jwks.mjs emit` omits it when `next.config` enables `cacheComponents`, and existing routes must be edited by hand. The JWKS route caches for 60 seconds so a key replaced during sandbox setup is not stuck in AIR's cache; raise it once the key is final.

The app requests its operation-specific Partner JWT (`scope: "issue"`, header `typ: "JWT"`) with `POST /api/partner-jwt`, the Bearer header, and JSON `{ "operation": "issue" }`, then calls `issueCredential({ authToken, issuerDid, credentialId, credentialSubject: {} })` from a browser event handler after AIR login. Pass `waitForOnchainCompletion: true` only when the next step needs the on-chain record. Handle the resolved/rejected promise; it returns no VC. Do not fabricate holder data, SDK flags, or response properties.

For another framework, adapt the server helpers to its routing and verified session model. A static frontend needs a server-side token/JWKS service. `Frontend: none` skips local UI creation; document how the separate client calls `issueCredential` if SDK issuance was selected.

## Direct issuance

Implement the trusted backend event/job as a server-to-server call to `POST {ISSUER_ORIGIN}/admin/issue-vc` with `x-admin-api-key`, or adapt the backend's own equivalent. Validate the recipient and claims on the server, exclude reserved claims, and pass the registered `schemaId` and `vct`. Use the recipient's own email, deduplicate by recipient and program, and revoke a superseded credential before issuing its replacement (see [issuance.md](issuance.md#direct-backend-issuance)). Do not create a frontend or browser JWT route solely for direct issuance, and do not route it through the AIR-facing `/issue-vc`. Report success only after the request succeeds.

## Public endpoints and registration

Reuse an existing deployment origin. For local development, start the actual backend/web processes, verify their ports, then open HTTPS tunnels. The web app always needs one: AIR Kit only loads on HTTPS origins whitelisted under Account → Domains, never on `http://localhost`. Tell the user to whitelist the web tunnel domain, confirm it with the Domain question in [questions.md](questions.md), and test only at the tunnel URL. When a tunnel URL changes, the new domain must be whitelisted again and the JWKS URL updated. The issuer tunnel host becomes the issuer DID host: prefer a reserved/static tunnel domain, set backend `ISSUER_ORIGIN` to it before deriving the DID, and restart after configuration changes. When registering the issuer endpoints, the user whitelists the `ISSUER_ORIGIN` host under Account → Domains as well as the web domain (ask both in the Domain question), and saves did:web Host before creating any schema or program.

A Next dev server returns 403 for `/_next` assets requested through a host it does not know: add the tunnel hostname to `allowedDevOrigins` in `next.config`. Otherwise the HTML loads with 200 but the page never hydrates, so AIR Kit never starts. Restart the dev server after changing `allowedDevOrigins` or any `NEXT_PUBLIC_*` value.

A Cloudflare quick tunnel can die with `Unauthorized: Tunnel not found`, and its hostname never comes back. A new web host means a new JWKS URL and a new Dashboard domain. A new issuer host means a new `did:web` (re-save did:web Host), new Available Credentials, Issue Credential, and Revocation Status URLs, a new whitelisted domain, and a new `vct` when the type is hosted on the issuer origin. Update them together: set `ISSUER_ORIGIN`, run `issuer-did.mjs --rehost`, `vct.mjs plan --replace` and `vct.mjs schema --rehost`, and update the web `NEXT_PUBLIC_ISSUER_DID` (issuer-did writes it). Then mark issuer, JWKS, and domain registration unconfirmed (`provision.mjs write-ids --jwks-registered no --domain-whitelisted no`; `--rehost` already resets issuer registration) until the user has updated the Dashboard. Prefer a stable host (deployment or reserved tunnel domain) before issuing any credential that should be kept.

The SD-JWT issuer service serves `/.well-known/did.json` and `/.well-known/jwt-vc-issuer` but no Partner JWT JWKS route. Serve JWKS from the web app's `/api/.well-known/jwks` (generated route) or another public HTTPS host with the same `PARTNER_JWKS`; backend-only/direct setups still need one, because AIR validates the issuer service's own Partner JWTs. Record the exact live URL, then follow [register.md](register.md).

Run [audit.md](audit.md), obtain a fresh issuance token through authenticated code, and execute the selected flow. Report the observed result and what was actually verified. Confirm the credential is usable through the verification flow; without a database an empty issuance history is not a failure.
