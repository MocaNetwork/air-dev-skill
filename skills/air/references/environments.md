# Environments

Automated writes in this skill support sandbox only. `--env production` is rejected before writing files. Read-only inspection can review either environment.

## Sandbox

- Dashboard: https://developers.sandbox.air3.com/dashboard
- AIR Kit: `BUILD_ENV.SANDBOX` (Moca Chain testnet); confirm the installed version's options.
- Issuer backend: `NODE_ENV=sandbox`; `AIR_API_ORIGIN` and `MOCA_CHAIN_API_ORIGIN` default per `NODE_ENV`.
- AIR APIs: `initialize-user` at `https://air.api.sandbox.air3.com`, dStorage at `https://api.sandbox.mocachain.org/v1`.
- Generated IDs and keys remain tied to this integration.

## Production (mainnet)

Moca Chain mainnet is live and production is self-serve for SD-JWT issuers and verifiers. Iden3 in production requires the AIR team.

- Dashboard: https://developers.air3.com/dashboard, a separate partner with its own Partner ID, issuer registration, credential types, programs, JWKS, and domains. As a new account it cannot create schemas or programs until did:web Host is saved ([register.md](register.md#didweb-host-gate-every-role-every-new-account)).
- AIR Kit: `init({ buildEnv: BUILD_ENV.PRODUCTION, credentialNetwork: "mainnet" })`. `credentialNetwork` (`"testnet"` | `"mainnet"`) is accepted only with `BUILD_ENV.PRODUCTION`; verify the installed package before writing configuration.
- AIR APIs: `initialize-user` at `https://air.api.air3.com`, dStorage at `https://mocachain-mainnet.api.air3.com/v1`.
- Issuer: a production `ISSUER_ORIGIN` on a custom domain you control; it defines the production `did:web` issuer DID.

The assistant may implement a user-requested production integration through targeted, reviewed configuration based on https://docs.air3.com/get-started/environments/about, but must not invoke sandbox setup helpers against it. Record actual network, identity, SDK version, backend commit, and endpoints in separate context. Generate production keys and API keys for that environment; never copy or relabel sandbox identity as production.

Do not treat an approval already granted by the user as missing. AIR account access and authorization to edit local code are separate requirements.
