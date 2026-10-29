# Anti-patterns

Never do these. `detect.mjs` catches a subset.

- Change the `ISSUER_ORIGIN` host after issuing real credentials; it is the `did:web` issuer identity
- Rotate partner signing keys or regenerate configuration for a registered issuer unprompted, or by swapping the key in place; rotation is an explicit user request done with overlap (see [auth.md](auth.md#key-rotation))
- Replace or "migrate" an existing Iden3 (`did:air`, `SEED`) identity without an explicit plan with the AIR team
- Put Partner JWT signing in the browser or under `NEXT_PUBLIC_*`
- Reuse one JWT across users or across issue + verify, or omit `scope: "issue"` from issuance tokens
- Assume Testnet credentials exist on mainnet, or sandbox registration carries to production
- Call Privy directly for agentic wallets
- Bind agent scopes the user did not approve on the partner's own consent screen, or keep `agentApiKey` / agent JWTs anywhere but the agent backend
- Store raw PII in `credentialSubject` when a boolean / enum works
- Branch on `err.name` or show `err.message` to users with AIR Kit 1.13+; use `AirKitError` `code` with a `category` fallback
- Generate a new dStorage `externalId` per retry, or reuse one for different content
- Treat a revocation status that could not be fetched as "not revoked"
- Return reserved claims (`id`, `iss`, `sub`, `vct`, `cnf`, `exp`, `iat`, `nonce`, `status`) from schema code or `/admin/issue-vc`
- Sign claim values supplied by the browser; pass `credentialSubject: {}` to `issueCredential`
- Skip JWKS because login already works, or point the JWKS URL at the issuer's `did.json`
- Invent Partner ID, schema ID, `vct`, program ID, issuer DID, or API origins
- Use a JDBC `DATABASE_URL`
- Leave `ISSUER_ORIGIN` on localhost after a real claim
- Mix sandbox configuration with another network
- Send `x-api-key` to AIR / Moca chain APIs, `x-partner-auth` to issuer `/available-vc`, or call `/admin/*` from a browser
- Route direct backend issuance through the AIR-facing `/issue-vc`; use `/admin/issue-vc` or the documented AIR calls
- Restrict issuer CORS so that `*.air3.com` is excluded
- Change the token status list partition size after issuing
- Edit published Type Metadata or reuse a vct URL for different claims; bump the version instead
- Leave VCT JSON empty in the Dashboard; verifiers then have no claims to pick
- Act on a browser-side `Compliant` result, or trust the presentation wrapper's `holder`, without backend SD-JWT verification
- Call `verifyCredential` without a backend nonce, reuse a nonce, or accept a missing KB-JWT after sending one
- Change the verified backend wire contract or holder encryption to work around an integration error
- Commit `.env` / `.env.local`
- Print `PARTNER_PRIVATE_KEY_DER`, `API_KEY`, `ADMIN_API_KEY`, or other private keys in chat
