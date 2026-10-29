# /air agent

Do **not** copy agent-sign, UserOp, or session scripts into this skill. The operating workflows live in the wallet skill:

```bash
npx skills add MocaNetwork/air-agentic-wallet-skill
```

That repo ships:

- `air-agentic-wallet` — `POST /v2/wallet/agent-sign`, ERC-4337 UserOps
- `moca-credential-verifier` — scoped sessions, `verify-by-agent`

First establish which the user needs. A **partner agent binding** (agent identity for agentic commerce) delegates identity only: it never grants `wallet.sign` (requesting it on a partner binding returns `403`), a spending mandate, or access to assets. Wallet signing is the wallet skill's separate workflow; do not present a partner binding as one that can sign or pay. Source: https://docs.air3.com/technicals/architecture/how-agentic-commerce-works.

## Partner agent identity (what the app must get right)

Agent keys must be enabled for the partner (otherwise `403 AGENT_KEYS_DISABLED`); in-app binding is an AIR team enablement. Hosts: [api-map.md](api-map.md).

- **Consent.** The partner bind call (`POST /v2/auth/agent/keys/partner`) has no approval screen of its own. The app shows the agent nickname and every requested scope, records the user's approval, and binds only those scopes. Bind needs both the user's `x-partner-access-token` (`getAccessToken()`) and a fresh `x-partner-jwt` from the partner backend. AIR Kit's `registerAgentKey`, `getAgentKeys`, and `removeAgentKey` run in the user's own session instead.
- **Scopes** are fixed at bind; AIR adds `openid`. `credentials.read` → `GET /v2/credentials`; `credentials.verify` → `POST /v2/credentials/verify-by-agent`; `commerce.checkout` → `POST /v2/auth/agent/checkout-session` (add it only if the user wants the agent to start purchases). Widening means new approval, a new key, and revoking the old one.
- **Secrets.** `agentApiKey` (`air_ag_…`) is returned once at bind and sent as `x-agent-api-key`; alternatively the agent holds a P-256 key registered as `publicKey` and sends `signedMessage` over `agent_pubkey:userId:unixEpochTime`. Send exactly one. Keep the API key, partner login key, and `x-partner-jwt` server-side only.
- **Sessions.** Create one agent session per operation (`POST /v2/auth/agent/session`) with the narrowest scope; a scope outside the bound set returns `403 AGENT_SCOPE_DENIED`. Agent JWTs last 15 minutes with no refresh; do not cache them past that.
- **Verification.** If the partner creates its own verification program for the agent, the did:web Host gate in [register.md](register.md#didweb-host-gate-every-role-every-new-account) applies first. `verify-by-agent` takes `{ programId, fieldsToDisclose, nonce }` and accepts agent JWTs only. `nonce` is required because every AIR SD-JWT has `cnf.jwk`. When a merchant will act on the result, the **merchant** generates the nonce and verifies the returned SD-JWT itself with the checks in [verify.md](verify.md); a `status` relayed by the agent backend is unsigned. `200` `NotFound` / `Non-Compliant` are answers; `502 CREDENTIAL_STORAGE_UNAVAILABLE` is retryable and is **not** "not eligible"; `401` means start a new session.
- **Checkout.** The checkout JWT's `aud` is the merchant; send it only there. The merchant verifies `aud` and expiry and runs its own payment approval and spending limits; AIR does not.
- **Disconnect.** Rotate (`POST …/keys/partner/{id}/rotate`, which invalidates issued agent JWTs), then revoke (`DELETE …/keys/partner/{id}`). Per-user key limits return `409 CONFLICT_REQUEST`.

## Wallet skill rules (restated)

- Always call AIR's `airApiAgentSignUrl`. **Never call Privy directly.**
- Generate a fresh `signedMessage` every request.
- Treat `signedMessage` and `agentSignature` as different signatures.
- Record the handoff bundle in `.air-wallet-config.json` in the project, not inside this skill.

If the user also needs ordinary issue/verify UI, stay in `/air issue` and `/air verify` for the app, and let the wallet skill operate the agent key.
