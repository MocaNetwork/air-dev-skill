# Environments

Automated writes in this skill support sandbox only. `--env production` is rejected before writing files. Read-only inspection can review either environment.

## Sandbox

- Dashboard: https://developers.sandbox.air3.com/
- AIR Kit uses `BUILD_ENV.SANDBOX`; confirm the installed version's network options.
- Bundled backend configuration uses `NODE_ENV=sandbox`; inspect the checked-out backend for exact origins and supported variables.
- Generated IDs and keys remain tied to this integration.

## Mainnet

Use a separate project/configuration and the current official development-environments and registration documentation, discovered from https://docs.air3.com/llms.txt. Confirm mainnet access, the installed SDK's production enum/network options, and the real Dashboard origin. Do not guess a production host.

The documented AIR API bases are `https://api.sandbox.mocachain.org/v1` for sandbox and `https://mocachain-mainnet.api.air3.com/v1` for production. In the SDK, the network values are `testnet` and `mainnet`; verify the installed package before writing configuration.

The assistant may implement a user-requested mainnet integration through targeted, reviewed configuration based on those sources, but must not invoke sandbox setup helpers against it. Record actual network, identity, SDK version, backend version and endpoints in separate context. Obtain mainnet IDs, issuer keys, programs and activation for that environment; never copy/relabel sandbox identity as production.

Do not treat an approval already granted by the user as missing. AIR account access/activation and authorization to edit local code are separate requirements.
