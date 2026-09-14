---
name: air
description: Set up, implement, troubleshoot, and review AIR Kit account, credential issuance, and verification integrations. Use for AIR Kit, @mocanetwork/airkit, or /air commands; not generic JWT or database work unrelated to AIR.
version: 0.1.0
user-invocable: true
argument-hint: "[init|provision|keys|issuer-did|register|account|schema|issue|verify|agent|audit|polish|document] [target]"
license: MIT
---

# AIR

Integrate AIR Kit with the user's application. `PARTNER.md` records identity, choices, and app directories; `AIR.md` records the installed SDK and integration contract. Resolve `<skill-base-dir>` to this skill's actual installation directory. Run helpers from the user's project root, or pass `--project <root>`.

## Communication and scope

Ask directly for missing inputs and reuse answers already supplied. Keep workflow rules internal: no interview announcements, refusal preambles, or promises about what you will not invent or write. Explain a blocker only when it affects the next action and provide a concrete way forward. Role choices describe capabilities; issuance is not synonymous with a backend-only user experience.

Honor the existing framework, app directories, authentication, and deployment. Backend-only, SDK-led, and direct issuance are distinct choices. Do not create a frontend, clone a backend, start a database, or replace a deployed URL merely because an example uses one. User authorization already given for a setup step remains valid.

## Start and resume

1. For project work, run `node <skill-base-dir>/scripts/context.mjs --json`. Missing context means collect only the setup inputs required by the requested work using [init.md](references/init.md). Read-only explanations and code inspection do not require init.
2. Load the relevant command playbook and follow its linked prerequisites. Read actual context files for values; scan signals only indicate possible code, not runtime readiness.
3. Refresh context after changes to identity, app layout, or implementation, and when resuming work. Do not repeat answered questions.
4. With no argument, show the next useful commands using [routing.md](references/routing.md); do not mutate the project.

## Identity, contracts, and supported automation

- Issuer role means the partner controls credential authorization, source data, creation/signing, encryption, and storage in its backend. AIR Kit `issueCredential()` is a client entry point that orchestrates login, selection, consent, and registered AIR/issuer requests; it does not create or sign the VC. Direct issuance uses AIR `initialize-user` and `dstorage/vcs` from the backend. See [issuance.md](references/issuance.md).
- Obtain Partner ID and schema/program configuration from the user's Dashboard or existing configuration. Derive issuer DID using the installed issuer backend and existing/generated seed; never fabricate IDs, URLs, parameters, or successful results.
- Verifiers need signing keys and JWKS, not an issuer seed or Nest backend. Generate/import issuer keys only after the issuer backend is installed. Never replace existing keys or rotate a registered seed; helpers do not support key rotation.
- Credential calls require live public HTTPS JWKS registered for the partner, a matching signing `kid`, and operation-specific token scope (`issue` or `verify`). One Partner ID has one registered JWKS URL; share a combined public JWKS when issuer and verifier keys use the same Partner ID. Continue local implementation while remote registration is pending; do not claim live success. Keep secrets server-side and do not print them in chat.
- The scaffolded token endpoint denies access until its authentication adapter is implemented. Complete and test session validation and authorization before exposing it through a tunnel. Custom login identity comes from a verified server session.
- Automated init/key/provision/route writes support **sandbox only**. Mainnet is a separate, manually configured integration; see [environments.md](references/environments.md). Never relabel sandbox IDs or keys as production.
- Preserve existing `.env.example` and application routes. Helpers may create missing files; adapt existing implementations through targeted edits.
- Before implementing version-sensitive code, follow [sources.md](references/sources.md). The installed SDK types govern client parameters/returns; checked-out backend code governs its handlers; current official docs govern AIR and Dashboard configuration. Record discrepancies and resolve the affected contract rather than combining incompatible examples. When evidence is unavailable, state the specific unknown and continue independent work.

## Commands

| Command | Outcome | Playbook |
|---|---|---|
| `init` | Record role, issuance trigger, app paths, auth, database, and sandbox context | [init.md](references/init.md) |
| `provision` | Record observed IDs and confirmed registration state; no remote creation | [init.md](references/init.md) |
| `keys` | Issuer configuration or verifier/login signing keys; preserve existing identity | [init.md](references/init.md) |
| `issuer-did` | Read issuer DID from installed backend | [init.md](references/init.md) |
| `register` | Sandbox Dashboard registration or mainnet handoff | [register.md](references/register.md) |
| `account` | AIR login or existing-auth integration | [account.md](references/account.md) |
| `schema` | Map real schema, eligibility, and program configuration | [schema.md](references/schema.md) |
| `issue` | SDK-led and/or direct issuance with issuer backend | [issue.md](references/issue.md) |
| `verify` | Program-driven verification | [verify.md](references/verify.md) |
| `agent` | Handoff to the wallet skill | [agent.md](references/agent.md) |
| `audit` | Static observations and explicit runtime checks | [audit.md](references/audit.md) |
| `polish` | Error handling and UX for the selected flow | [polish.md](references/polish.md) |
| `document` | Document the actual integration | [document.md](references/document.md) |

## Helpers

Use the bundled helpers where they implement the requested operation. Other work, including app authentication, schema classes, SDK calls, backend start, and tunnels, is performed by the assistant using the inspected project. Do not describe a dry run or scaffold as a working integration.

```bash
node <skill-base-dir>/scripts/context.mjs --json
node <skill-base-dir>/scripts/init.mjs --role issuer --partner-id <uuid> --issuance sdk --db none --frontend next --web-dir apps/web
node <skill-base-dir>/scripts/issue.mjs --clone-backend --yes --install
node <skill-base-dir>/scripts/keys.mjs --env sandbox
node <skill-base-dir>/scripts/keys.mjs --env sandbox --import <existing-env-file>
node <skill-base-dir>/scripts/issuer-did.mjs
node <skill-base-dir>/scripts/jwks.mjs emit --target <web-root>
node <skill-base-dir>/scripts/jwt.mjs --scope verify
node <skill-base-dir>/scripts/jwks.mjs --check <actual-public-jwks-url>
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --verify-program-id <actual-id>
node <skill-base-dir>/scripts/detect.mjs --json
```

The npm CLI also runs these helpers: `npx air-dev-skill <command>`. Slash commands such as `/air register` are assistant playbooks, not all npm CLI commands. Remote provisioning actions are explicitly unsupported; use the Dashboard workflow.

Other focused references: [auth.md](references/auth.md), [api-map.md](references/api-map.md), [anti-patterns.md](references/anti-patterns.md). Documentation index: https://docs.air3.com/llms.txt; optional docs MCP: https://docs.air3.com/mcp.
