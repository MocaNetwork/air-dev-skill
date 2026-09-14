# AIR Dev skill

 AIR Kit integration skill: one entry point (`/air <cmd>`), traveling `PARTNER.md` + `AIR.md`, scripts that change project state, and static detectors.

This is not the docs-routing skill (`npx skills add https://docs.air3.com`) and not the wallet skill (`npx skills add MocaNetwork/air-agentic-wallet-skill`). Those still matter. This skill is the integration operator.

## Install

From the project root:

```bash
npx air-dev-skill install
```

The installer lists detected agents first and pre-checks them. Space toggles. Enter confirms. Then it asks project vs global and shows the dests for the agents you picked. Reload the harness and type `/air`.

CI / no TTY:

```bash
npx air-dev-skill install -y
npx air-dev-skill install --providers=cursor,claude --scope global
```

Also:

```bash
npx skills add MocaNetwork/air-sdk-ai
```

```text
/plugin marketplace add MocaNetwork/air-sdk-ai
```

CLI after install:

```bash
npx air-dev-skill detect --json
npx air-dev-skill keys --env sandbox
npx air-dev-skill jwks --check https://<origin>/api/.well-known/jwks
```

Docs MCP is optional: `https://docs.air3.com/mcp`. Without MCP, use the official web documentation and installed SDK/backend source.

## First command

Inside the agent:

```text
/air init
```

Sandbox is the default. The agent collects only missing setup inputs: role, issuance trigger, authentication, app paths, existing configuration, and database/frontend choices where relevant. Obtain the Partner ID from [Credential Dashboard → Account → General](https://developers.sandbox.air3.com/). Existing deployment URLs are reused; local tunnel URLs are discovered from the running tunnel.

Issuer setup: inspect/clone and install [`air-issuer-service`](https://github.com/MocaNetwork/air-issuer-service) → configure the selected database → generate/import existing keys → migrations when needed → derive issuer DID → register issuer/endpoints → configure schemas/programs.

Choose how issuance starts separately from the issuer role: AIR Kit, a direct backend event/job, or both. `issueCredential()` orchestrates login, credential discovery, selection, consent and AIR proxy requests. Direct issuance uses AIR `POST /auth/initialize-user` and `POST /dstorage/vcs`; it does not call issuer-hosted `/issue-vc`. The issuer backend remains responsible for authorization, source data, VC creation/signing, encryption and dStorage storage. See [the issuance contract](skills/air/references/issuance.md).

Verifier setup generates signing keys without an issuer seed/backend. Account-only and verifier roles also support BYO auth. Generated token routes deny access until connected to verified authentication and operation authorization; existing routes are preserved.

Record frontend/backend directories during init. New Next apps default to `apps/web`; keys and program IDs are written to that directory, including when the app has not yet been scaffolded. Existing `.env.example` files are preserved.

Automated writes support **sandbox only**. Mainnet needs a separate integration and current AIR access/activation; the helpers reject production flags instead of relabeling sandbox identity. Sandbox issuer registration uses the Dashboard, according to the current official setup guide.

## Secrets

Issuer secrets are written to the recorded backend’s gitignored `.env`. Only Partner JWT signing configuration is copied to the web server’s `.env.local`; issuer seeds and API keys stay in the backend. Existing secrets cannot be rotated by the helpers. Never commit those files. Never put them under `NEXT_PUBLIC_*`.

Sandbox and mainnet are separate partners, DIDs, and programs.

## Commands

Setup: `/air`, `init`, `provision`, `keys`, `issuer-did`, `register`  
Build: `account`, `schema`, `issue`, `verify`, `agent`  
Harden: `audit`, `polish`, `document`

## Related

| Piece | Role |
| --- | --- |
| This repo | Integration skill — context files, commands, detectors |
| [AIR Kit docs](https://docs.air3.com) / MCP | Live API and dashboard docs |
| [air-agentic-wallet-skill](https://github.com/MocaNetwork/air-agentic-wallet-skill) | Agent-sign and verify-by-agent scripts |
