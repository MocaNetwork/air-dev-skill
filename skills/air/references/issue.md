# Implement issuance

Read `PARTNER.md`, `AIR.md`, [issuance.md](issuance.md), and [sources.md](sources.md). Respect `Issuance trigger: sdk|direct|both` and the recorded app paths. If the trigger is unknown, ask which experience the user wants; frontend presence alone does not determine it.

## Backend

Use the existing issuer backend. For a new `air-issuer-service` project, follow [init.md](init.md): clone/install → configure chosen database → generate/import keys → migrations if needed → derive DID. `issue.mjs` clones and installs only; its printed plan does not implement issuance.

Inspect schema registration and eligibility logic. Finish [schema.md](schema.md), using actual Dashboard IDs and source-data rules. Do not offer a real claim with an empty schema or invented program. Backend boot, program registration, and successful credential issuance are separate milestones.

## SDK-led flow

Use the existing frontend framework. If Next was selected, scaffold at the recorded web directory and preserve its existing `.env.local`. If scaffolding refuses a nonempty directory, scaffold into a temporary sibling directory and copy the generated application files without replacing that environment file. Inspect package scripts and choose actual backend/web ports; do not assume both can use port 3000.

For Next App Router, create only missing routes:

```bash
node <skill-base-dir>/scripts/jwks.mjs emit --target <recorded-web-directory> --project <project-root>
```

The helper writes JWKS, token route, and an authentication adapter. Existing files are preserved and must be inspected/adapted, not assumed compatible. Connect `air-token-auth.ts` to verified application authentication (existing session or validated AIR login token) and operation authorization. For cookie sessions, use the app's origin/CSRF protections. Test that anonymous and unauthorized requests fail before tunneling.

The app requests its operation-specific Partner JWT with `POST /api/partner-jwt` and JSON `{ "operation": "issue" }`. `issueCredential()` is the client-side entry point: it orchestrates AIR login, discovery, selection, confirmation, and the registered issuer calls. The issuer backend owns authorization, source-data retrieval, credential creation/signing, encryption, and storage. The current detailed SDK reference still shows a required `credentialSubject` parameter while the newer overview describes backend-driven discovery; inspect the installed AIR Kit types and target docs version before choosing the exact call. Do not fabricate holder data, SDK flags, or response properties.

For another framework, adapt the server helpers to its routing and verified session model. A static frontend needs a server-side token/JWKS service. `Frontend: none` skips local UI creation; document how the separate client calls the issuer integration if SDK issuance was selected.

## Direct issuance

Implement the trusted backend event/job with `POST /auth/initialize-user` followed by issuer-side authorization/data loading/VC creation-signing-encryption and `POST /dstorage/vcs`. Keep all issuer responsibilities on the backend. Do not create a frontend or JWT browser route solely for direct issuance, and do not route direct issuance through issuer-hosted `/issue-vc`. Persist and report the returned `storagePath` only after the dStorage request succeeds.

## Public endpoints and registration

Reuse an existing deployment origin. For local development, start the actual backend/web processes, verify their ports, then open HTTPS tunnels where needed. Record the observed origins; set backend `ISSUER_ORIGIN` before a real claim and restart if configuration changed.

Serve JWKS from either the issuer backend's verified `/.well-known/jwks` route or the web app's `/api/.well-known/jwks`. Backend-only setups do not require a web tunnel. Record the exact live URL, then follow [register.md](register.md).

Run [audit.md](audit.md), obtain a fresh issuance token through authenticated code, and execute the selected flow. Report the returned result and what was actually verified. If the next operation needs on-chain confirmation, use the installed SDK's documented wait option; do not invent a polling status API.
