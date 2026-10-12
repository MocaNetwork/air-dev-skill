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
npx air-dev-skill vct plan --spec air/credentials/<name>.json
```

Docs MCP is optional: `https://docs.air3.com/mcp`. Without MCP, use the official web documentation and installed SDK/backend source.

## First command

Inside the agent:

```text
/air init
```

Sandbox is the default. The agent collects only missing setup inputs: role, issuance trigger, authentication, app paths, existing configuration, and database/frontend choices where relevant. Obtain the Partner ID from [Credential Dashboard → Account → General](https://developers.sandbox.air3.com/). Existing deployment URLs are reused; local tunnel URLs are discovered from the running tunnel.

Credentials are **SD-JWT VC** (`SD_JWT_VC`), the AIR default. Iden3 is an advanced option the AIR team enables; the skill detects Iden3-era projects (`SEED`, `did:air`) and leaves them unchanged.

Issuer setup: inspect/clone and install [`air-issuer-service@main_sd-jwt-vc`](https://github.com/MocaNetwork/air-issuer-service/tree/main_sd-jwt-vc) → configure the selected database (optional in sandbox) → generate/import existing keys → set a stable public HTTPS `ISSUER_ORIGIN` → derive and check the `did:web` issuer DID → register issuer/endpoints → configure credential types (`vct`) and programs. The issuer DID is `did:web:<host of ISSUER_ORIGIN>`, so the host is permanent once you issue.

Credential types: describe the credential you want to issue and `/air schema` does the rest. It writes `air/credentials/<name>.json`, generates the `vct` URL (served by the issuer at `${ISSUER_ORIGIN}/vct/<name>/v1`) and its SD-JWT VC Type Metadata, and prints the four Dashboard values to paste into **Issuer → Schemas → SD-JWT VCT details** (Title, Description, VCT, VCT JSON). Give it the schema ID after you publish and it generates and registers the backend schema class.

Choose how issuance starts separately from the issuer role: AIR Kit, a direct backend event/job, or both. `issueCredential({ ..., credentialSubject: {} })` orchestrates login, preview, consent and AIR's calls to the issuer's `available-vc` / `issue-vc`. Direct issuance calls the issuer's `POST /admin/issue-vc`, which resolves the holder with AIR `POST /v2/auth/initialize-user` and stores through `POST /dstorage/vcs`. The issuer backend remains responsible for authorization, source data, SD-JWT creation/signing, holder binding, encryption and dStorage storage. See [the issuance contract](skills/air/references/issuance.md).

Verifier setup generates signing keys without an issuer backend and scaffolds backend verification of the returned SD-JWT presentation (single-use nonce, key-binding JWT, trusted `did:web` issuers, expected `vct`). Account-only and verifier roles also support BYO auth. Generated routes deny access until connected to verified authentication, operation authorization, and nonce storage; existing routes are preserved.

Record frontend/backend directories during init. New Next apps default to `apps/web`; keys and program IDs are written to that directory, including when the app has not yet been scaffolded. Existing `.env.example` files are preserved.

Automated writes support **sandbox only**. Production is self-serve for SD-JWT in the [production Dashboard](https://developers.air3.com/dashboard) but is configured manually as a separate integration; the helpers reject production flags instead of relabeling sandbox identity.

## Secrets

Issuer secrets are written to the recorded backend’s gitignored `.env`. Only Partner JWT signing configuration is copied to the web server’s `.env.local`; issuer API keys stay in the backend. The issuer service publishes no Partner JWT JWKS route, so serve `PARTNER_JWKS` from the web app or another public HTTPS host. Existing secrets cannot be rotated by the helpers. Never commit those files. Never put them under `NEXT_PUBLIC_*`.

Sandbox and production are separate partners, issuer origins/DIDs, and programs.

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
