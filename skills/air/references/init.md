# Setup, keys, and context

Reuse conversation and project information. Ask only the next missing inputs. Run init when those needed for the chosen role are available; no extra confirmation round.

## Inputs

Role question: “What would you like to add: credential issuance, verification, both, or account wallet?” In interactive choices, label issuance **“Issue credentials — through AIR Kit or directly from your backend”**. Do not label it “issue from my backend,” which confuses responsibility with the trigger.

For issuer/both, separately ask: “How should issuance start: users claim through AIR Kit or your backend issues directly?” Record `--issuance sdk|direct|both`. In all cases the issuer backend authorizes and creates/signs, encrypts, and stores the credential. AIR Kit orchestrates the user flow; see [issuance.md](issuance.md).

Collect as applicable:

- Existing partner configuration or new keys. Existing verifiers may have only signing keys, not an issuer seed.
- Partner ID from Dashboard → Account → General. Existing partners may defer it until importing their configuration. Sandbox Dashboard: https://developers.sandbox.air3.com/.
- Authentication for any role that logs users in: AIR login or existing/BYO auth (`--auth air-login|byo`). Account-only and verifier roles can use BYO auth too.
- Frontend: existing app / create Next / none. Inspect existing paths; record `--web-dir`. New Next apps default to `apps/web`, recorded before keys are written. An SDK frontend may live in another application: `--frontend none` does not imply direct issuance.
- Issuer backend: inspect existing implementation before cloning; record `--backend-dir` (default `apps/backend`). The bundled backend helpers support `air-issuer-service`; adapt other backends against verified contracts.
- Database for issuer roles only: none / Docker / existing Postgres. For external Postgres supply `--db external --database-url <url>`; init stores it in a gitignored root `.env` for the keys step. Do not print credentials. Skip database questions for verifier/account/agentic roles.

Do not ask for URLs the skill is about to generate. Reuse deployed origins already configured. If an existing remote service's URL is unknown and cannot be discovered, ask for that actual URL; do not replace it with a tunnel.

## Write context

```bash
node <skill-base-dir>/scripts/init.mjs --role <role> --partner-id <uuid> --auth <air-login|byo> --frontend <none|next|existing> [--web-dir <dir>] [--issuance sdk|direct|both] [--backend-dir <dir>] [--existing] [--db none|docker|external] [--database-url <url>]
```

`--partner-id` is required unless `--existing`. Init creates `PARTNER.md`, `AIR.md`, and `.env.example` if absent; it preserves an existing `.env.example`. Use `--force` only for an explicitly requested context reset, never to repair a missing field. Update individual fields instead. Context placeholders indicate unfinished setup, not verified facts. Init is sandbox-only.

## Issuer/both sequence

1. Record choices and paths. Inspect existing backend and package scripts. Clone/install only if missing:

   ```bash
   node <skill-base-dir>/scripts/issue.mjs --clone-backend --yes --install
   ```

   The helper uses the recorded backend directory. If cloning previously succeeded but installation failed, use `issue.mjs --install --yes` to install in that existing directory. Record the resulting backend commit in `AIR.md` before adapting its API.

2. Configure the chosen database. `none`: no Docker/migrations, and verify that the checked-out backend supports no-database development before booting. `docker`: start a local Postgres only if not already running, using the agreed port and database. `external`: use the supplied connection. Inspect the backend's migration requirements.

3. Generate or import configuration:

   ```bash
   node <skill-base-dir>/scripts/keys.mjs --env sandbox
   # Existing partner instead:
   node <skill-base-dir>/scripts/keys.mjs --env sandbox --import <existing-env-file>
   ```

   The backend must be cloned and installed. Keys writes issuer configuration and, when selected, signing configuration to the recorded web directory, even before that app is scaffolded. It never rotates existing secrets. It does not boot the backend or extract the DID automatically.

4. Run the backend's migrations only when a database was selected, then:

   ```bash
   node <skill-base-dir>/scripts/issuer-did.mjs
   ```

   The helper runs the backend repl, validates successful execution and any recorded/expected DID, and records the result. On failure, diagnose the actual backend error; preserve keys and retry the DID step.

5. Continue [issue.md](issue.md) for the chosen trigger, [register.md](register.md) for setup, and [schema.md](schema.md) for schemas and issuance programs. Build local code while registration is pending; attempt real credentials only after prerequisites are confirmed.

## Verifier / account login

No issuer backend, issuer seed, or issuer API keys. For verifier or BYO login, use the same keys command: it generates signing keys only, or imports `PARTNER_ID`, `PARTNER_PRIVATE_KEY_KID`, `PARTNER_PRIVATE_KEY_DER`, and optional public `SD_JWT_JWKS`.

Create/use the recorded web application, emit missing routes, connect authentication, and register public JWKS. Then use [verify.md](verify.md) or [account.md](account.md). AIR login alone does not require generating issuer secrets. If the Dashboard lacks credential access, inspect the actual account state with [register.md](register.md); do not automatically turn a verifier into an issuer.

## Agentic

Use [agent.md](agent.md). Let the wallet skill collect its own requirements instead of generating issuer secrets.

## Recording observed configuration

```bash
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --schema-id <id> --issue-program-id <id> --verify-program-id <id>
```

Supply only values applicable to the task. This updates context and the recorded web environment; it creates no remote resources. `createPartner`, `createIssuerDid`, `createApiKeys`, `createProgram`, `registerJwksUrl`, and `activateIssuer` are unsupported. Mainnet: [environments.md](environments.md).
