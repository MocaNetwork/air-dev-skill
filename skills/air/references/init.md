# Setup, keys, and context

Reuse conversation and project information. Ask only the next missing inputs, with the structured question tool and the choices in [questions.md](questions.md). Run init when those needed for the chosen role are available; no extra confirmation round.

## Inputs

Role question (Role in [questions.md](questions.md)): issuance, verification, both, or account wallet. Label issuance **“Issue credentials — through AIR Kit or directly from your backend”**. Do not label it “issue from my backend,” which confuses responsibility with the trigger.

For issuer/both, separately ask the Issuance question: users claim through AIR Kit, your backend issues directly, or both. Record `--issuance sdk|direct|both`. In all cases the issuer backend authorizes and creates/signs, encrypts, and stores the credential. AIR Kit orchestrates the user flow; see [issuance.md](issuance.md).

Collect as applicable, using the questions.md choice sets:

- Existing partner configuration or new keys. Existing verifiers may have only signing keys, not an issuer backend.
- Partner ID from Dashboard → Account → General. Existing partners may defer it until importing their configuration. Sandbox Dashboard: https://developers.sandbox.air3.com/.
- Authentication for any role that logs users in: AIR login or existing/BYO auth (`--auth air-login|byo`). Account-only and verifier roles can use BYO auth too.
- Frontend: existing app / create Next / none. Inspect existing paths; record `--web-dir`. New Next apps default to `apps/web`, recorded before keys are written. An SDK frontend may live in another application: `--frontend none` does not imply direct issuance.
- Issuer backend: inspect existing implementation before cloning; record `--backend-dir` (default `apps/backend`). The bundled backend helpers support `air-issuer-service@main_sd-jwt-vc`; adapt other backends against verified contracts. An existing backend with `SEED` or a `did:air` DID is an Iden3 issuer: leave it unchanged and see [sources.md](sources.md).
- Database for issuer roles only: none / Docker / existing Postgres. None works for sandbox; revocation, issuance history, and the token status list need one, so plan it before production. For external Postgres supply `--db external --database-url <url>`; init stores it in a gitignored root `.env` for the keys step. Do not print credentials. Skip database questions for verifier/account/agentic roles.
- Issuer origin: where the issuer service will be publicly reachable over HTTPS (existing deployment, a host to deploy to, or a development tunnel). It becomes the issuer DID host, so ask early; do not ask for URLs the skill is about to generate.

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

   The helper clones the `main_sd-jwt-vc` branch into the recorded backend directory and records the branch and commit. If cloning previously succeeded but installation failed, use `issue.mjs --install --yes` in that existing directory. Read the checked-out README and `.env.example` before adapting its API.

2. Configure the chosen database. `none`: no Docker/migrations. `docker`: start a local Postgres only if not already running, using the agreed port and database. `external`: use the supplied connection. With a database, run `npx mikro-orm migration:up` in the backend before the first start.

3. Generate or import configuration:

   ```bash
   node <skill-base-dir>/scripts/keys.mjs --env sandbox
   # Existing partner instead:
   node <skill-base-dir>/scripts/keys.mjs --env sandbox --import <existing-env-file>
   ```

   The backend must be cloned and installed. Keys writes `PARTNER_ID`, `PARTNER_PRIVATE_KEY_KID`, `PARTNER_PRIVATE_KEY_ALG`, `PARTNER_PRIVATE_KEY_DER`, public `PARTNER_JWKS`, `API_KEY`, and `ADMIN_API_KEY`, plus signing configuration in the recorded web directory, even before that app is scaffolded. The same partner key signs Partner JWTs and the issuer's SD-JWT credentials. It never rotates existing secrets; Iden3 settings in an import are reported and ignored.

4. Set `ISSUER_ORIGIN` in the backend `.env` to the stable public HTTPS origin (no trailing slash), then start the backend and expose it at that origin. Reuse an existing deployment. A development tunnel works for sandbox, but a new tunnel host is a new issuer DID: use a reserved tunnel domain, or only issue throwaway credentials before switching. See [issue.md](issue.md).

5. Derive and check the issuer DID:

   ```bash
   node <skill-base-dir>/scripts/issuer-did.mjs --check
   ```

   The helper derives `did:web:<host>` from `ISSUER_ORIGIN` exactly as the backend does, confirms `/.well-known/did.json` serves that `id` with `<did>#<kid>` as an assertion method, and records it. It also records the full URLs of the **Available Credentials API**, **Issue Credential API**, and **Revocation Status API** in `PARTNER.md` → Issuer endpoints, resolved from the backend's actual routes, and with `--check` probes each one (a guarded route answers 403 without the API key; 404 means the path is wrong). It refuses localhost/HTTP origins and a host that differs from a recorded DID. On failure, diagnose the backend or tunnel; do not change keys.

6. Continue [issue.md](issue.md) for the chosen trigger, [register.md](register.md) for setup, and [schema.md](schema.md) for credential types and issuance programs. Build local code while registration is pending; attempt real credentials only after prerequisites are confirmed.

## Verifier / account login

No issuer backend or issuer API keys. For verifier or BYO login, use the same keys command: it generates signing keys only, or imports `PARTNER_ID`, `PARTNER_PRIVATE_KEY_KID`, `PARTNER_PRIVATE_KEY_DER`, and optional public `PARTNER_JWKS` (`SD_JWT_JWKS` is accepted as a fallback name).

Create/use the recorded web application, emit missing routes, connect authentication, and register public JWKS. Then use [verify.md](verify.md) or [account.md](account.md). AIR login alone does not require generating issuer secrets. If the Dashboard lacks credential access, inspect the actual account state with [register.md](register.md); do not automatically turn a verifier into an issuer.

## Agentic

Use [agent.md](agent.md). Let the wallet skill collect its own requirements instead of generating issuer secrets.

## Recording observed configuration

```bash
node <skill-base-dir>/scripts/provision.mjs --env sandbox write-ids --schema-id <id> --vct <type> --issue-program-id <id> --verify-program-id <id> --trusted-issuer <did:web:...>
```

Supply only values applicable to the task. This updates context and the recorded web environment; it creates no remote resources. `createPartner`, `createIssuerDid`, `createApiKeys`, `createProgram`, `registerJwksUrl`, and `registerIssuer` are unsupported. Mainnet: [environments.md](environments.md).
