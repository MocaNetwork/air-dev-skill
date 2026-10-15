---
name: air
description: Set up, implement, troubleshoot, and review AIR Kit account, credential issuance, and verification integrations. Use for AIR Kit, @mocanetwork/airkit, or /air commands; not generic JWT or database work unrelated to AIR.
version: 0.2.0
user-invocable: true
argument-hint: "[init|provision|keys|issuer-did|register|account|schema|issue|verify|agent|audit|polish|document] [target]"
license: MIT
---

# AIR

Integrate AIR Kit with the user's application. `PARTNER.md` records identity, choices, and app directories; `AIR.md` records the installed SDK and integration contract. Resolve `<skill-base-dir>` to this skill's actual installation directory. Run helpers from the user's project root, or pass `--project <root>`.

## Communication and scope

Ask every question through the harness's structured question tool with choices (Claude Code `AskUserQuestion`, Cursor `AskQuestion`, Codex `request_user_input`), never as plain prose when the tool exists; follow [questions.md](references/questions.md) for the format, fallback, and setup question set. Ask only for missing inputs and reuse answers already supplied. Keep workflow rules internal: no interview announcements, refusal preambles, or promises about what you will not invent or write. Explain a blocker only when it affects the next action and provide a concrete way forward. Role choices describe capabilities; issuance is not synonymous with a backend-only user experience.

Honor the existing framework, app directories, authentication, and deployment. Backend-only, SDK-led, and direct issuance are distinct choices. Do not create a frontend, clone a backend, start a database, or replace a deployed URL merely because an example uses one. User authorization already given for a setup step remains valid.

## Start and resume

1. For project work, run `node <skill-base-dir>/scripts/context.mjs --json`. Missing context means collect only the setup inputs required by the requested work using [init.md](references/init.md). Read-only explanations and code inspection do not require init.
2. Load the relevant command playbook and follow its linked prerequisites. Read actual context files for values; scan signals only indicate possible code, not runtime readiness.
3. Refresh context after changes to identity, app layout, or implementation, and when resuming work. Do not repeat answered questions.
4. With no argument, show the next useful commands using [routing.md](references/routing.md); do not mutate the project.

## Identity, contracts, and supported automation

- Credentials are **SD-JWT VC** (`SD_JWT_VC`) by default; the reference issuer is [`air-issuer-service@main_sd-jwt-vc`](https://github.com/MocaNetwork/air-issuer-service/tree/main_sd-jwt-vc). Iden3 (`BJJ_SIG_2021`, `did:air`, `SEED`) is an advanced option the AIR team enables: point to https://docs.air3.com/products/identity/iden3/issuing, and do not convert or replace an existing Iden3 identity.
- Issuer role means the partner controls credential authorization, source data, SD-JWT creation/signing, holder encryption, and storage in its backend. `issueCredential()` orchestrates login, preview, consent, and AIR's calls to the issuer; it does not create or sign the VC. Direct issuance runs from the partner's servers through the issuer's `POST /admin/issue-vc`. See [issuance.md](references/issuance.md).
- The issuer DID is `did:web:<host of ISSUER_ORIGIN>`, served at `/.well-known/did.json`. Choose a stable public HTTPS origin before the first real credential; changing the host changes the issuer identity. Never fabricate IDs, URLs, parameters, or successful results.
- Verifiers need signing keys and JWKS, not an issuer backend. A `Compliant` result is checked in the browser only: verify the returned SD-JWT presentation on the backend with a single-use nonce. See [verify.md](references/verify.md).
- Credential calls require live public HTTPS JWKS registered for the partner, a matching signing `kid`, and an operation-specific token with header `typ: "JWT"`: `scope: "issue"` for `issueCredential` and direct issuance, `scope: "verify"` for verification; `email` only on login and `initialize-user` tokens. The SD-JWT issuer service publishes no Partner JWT JWKS route; serve it from the web app or another public host. One Partner ID has one registered JWKS URL. Continue local implementation while remote registration is pending; do not claim live success. Keep secrets server-side and do not print them in chat.
- AIR Kit only runs on HTTPS origins whitelisted under Dashboard → Account → Domains; it does not load on `http://localhost`. To test any flow locally, always run the web app behind an HTTPS tunnel, tell the user to whitelist that exact tunnel domain (and remove stale ones; the list holds 3), register the tunnel's JWKS URL, and open the app at the tunnel URL.
- The scaffolded token and presentation routes deny access until their authentication and nonce adapters are implemented. Complete and test session validation and authorization before exposing them through a tunnel. Custom login identity comes from a verified server session.
- Automated init/key/provision/route writes support **sandbox only**. Production is self-serve for SD-JWT but configured manually; see [environments.md](references/environments.md). Never relabel sandbox IDs or keys as production.
- Preserve existing `.env.example` and application routes. Helpers may create missing files; adapt existing implementations through targeted edits.
- Before implementing version-sensitive code, follow [sources.md](references/sources.md). The installed SDK types govern client parameters/returns; checked-out backend code governs its handlers; current official docs govern AIR and Dashboard configuration. Record discrepancies and resolve the affected contract rather than combining incompatible examples. When evidence is unavailable, state the specific unknown and continue independent work.

## Commands

| Command | Outcome | Playbook |
|---|---|---|
| `init` | Record role, issuance trigger, app paths, auth, database, and sandbox context | [init.md](references/init.md) |
| `provision` | Record observed IDs and confirmed registration state; no remote creation | [init.md](references/init.md) |
| `keys` | Issuer configuration or verifier/login signing keys; preserve existing identity | [init.md](references/init.md) |
| `issuer-did` | Derive and check the did:web issuer DID from `ISSUER_ORIGIN` | [init.md](references/init.md) |
| `register` | Sandbox Dashboard registration or mainnet handoff | [register.md](references/register.md) |
| `account` | AIR login or existing-auth integration | [account.md](references/account.md) |
| `schema` | Design the credential, generate the vct URL, Type Metadata, Dashboard values, and backend schema class | [schema.md](references/schema.md) |
| `issue` | SDK-led and/or direct issuance with issuer backend | [issue.md](references/issue.md) |
| `verify` | Program-driven verification with backend SD-JWT checks | [verify.md](references/verify.md) |
| `agent` | Handoff to the wallet skill | [agent.md](references/agent.md) |
| `audit` | Static observations and explicit runtime checks | [audit.md](references/audit.md) |
| `polish` | Error handling and UX for the selected flow | [polish.md](references/polish.md) |
| `document` | Document the actual integration | [document.md](references/document.md) |

## Helpers

Use the bundled helpers where they implement the requested operation. Other work, including app authentication, nonce storage, schema classes, SDK calls, backend start, and tunnels, is performed by the assistant using the inspected project. Do not describe a dry run or scaffold as a working integration.

```bash
node <skill-base-dir>/scripts/context.mjs --json
node <skill-base-dir>/scripts/init.mjs --role issuer --partner-id <uuid> --issuance sdk --db none --frontend next --web-dir apps/web
node <skill-base-dir>/scripts/issue.mjs --clone-backend --yes --install
node <skill-base-dir>/scripts/keys.mjs --env sandbox
node <skill-base-dir>/scripts/keys.mjs --env sandbox --import <existing-env-file>
node <skill-base-dir>/scripts/issuer-did.mjs --check
node <skill-base-dir>/scripts/vct.mjs plan --spec air/credentials/<name>.json
node <skill-base-dir>/scripts/vct.mjs schema --spec air/credentials/<name>.json --schema-id <dashboard-schema-id>
node <skill-base-dir>/scripts/jwks.mjs emit --target <web-root>
node <skill-base-dir>/scripts/jwt.mjs --operation verify
node <skill-base-dir>/scripts/jwks.mjs --check <actual-public-jwks-url>
node <skill-base-dir>/scripts/sd-jwt.mjs inspect air/tmp/presentation.json --verify --nonce <nonce> --program-id <id>
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --verify-program-id <actual-id> --trusted-issuer <did:web:...> --vct <type>
node <skill-base-dir>/scripts/detect.mjs --json
```

The npm CLI also runs these helpers: `npx air-dev-skill <command>`. Slash commands such as `/air register` are assistant playbooks, not all npm CLI commands. Remote provisioning actions are explicitly unsupported; use the Dashboard workflow.

Other focused references: [auth.md](references/auth.md), [api-map.md](references/api-map.md), [anti-patterns.md](references/anti-patterns.md). Documentation index: https://docs.air3.com/llms.txt; optional docs MCP: https://docs.air3.com/mcp.
