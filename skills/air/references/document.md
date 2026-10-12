# /air document

Generate an integration README from `PARTNER.md`, `AIR.md`, and the env names that actually exist. Do not invent values. Do not copy secrets.

## Output

Write `docs/AIR-INTEGRATION.md` (or update `README.md` if the user asked). Include:

- Role, network (sandbox vs mainnet), auth model
- Partner ID, `did:web` issuer DID and `ISSUER_ORIGIN` (public IDs only), with the warning that the host is the issuer identity
- The registered Available Credentials API, Issue Credential API, and Revocation Status API URLs from `PARTNER.md`
- Credential format (`SD_JWT_VC`), schema IDs, `vct`, program IDs, trusted issuers
- JWKS URL and `kid` convention
- Issuance path and verification path from AIR.md, including the backend presentation check and nonce handling
- Revocation: database, `/admin/revoke`, and token status list settings if enabled
- Env table split: `NEXT_PUBLIC_*` vs server-only names
- How to run backend + web, migrate (only if `Database` is docker or external), and the actual JWKS route
- Register checklist (link, do not paste API keys)
- Related: docs MCP, this `/air` skill, wallet skill if agentic

Include confirmed blockers separately from unverified source observations. Record installed SDK version, backend branch and commit, issuance trigger, app directories, and the actual SDK parameter/result contract.
