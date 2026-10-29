# No-argument routing

An invocation of `/air` without a task asks for next steps. Inspect current context and offer up to three applicable commands as choices in the structured question tool ([questions.md](questions.md)), each with its short reason as the description. Do not start setup or show every command unless useful or requested.

Use helper recommendations as hints. Respect role and trigger:

- Missing context → init.
- Iden3-era context (`SEED`, `did:air`) → explain it is left unchanged and point to the Iden3 docs; do not run setup helpers against it.
- Issuer needing a backend → issue; backend installed but missing keys → keys; keys present but no DID → set a stable public HTTPS `ISSUER_ORIGIN`, then issuer-did.
- Verifier or BYO login missing signing keys → keys, without an issuer backend.
- Missing public JWKS/registration → register when the endpoint is ready, otherwise implement it in the selected app.
- did:web Host not saved (new account, any role that needs a schema or program) → register first: no schema or program can be created until it is. Verifier-only uses the app's own domain.
- Registered issuer missing a credential spec, Dashboard schema, or program → schema; missing SDK/direct implementation → issue for the selected trigger.
- Verifier with did:web Host saved but missing program/integration, or a `verifyCredential` call without a backend presentation check → verify.
- Account-only → account; agentic → agent.
- Existing implementation → audit, then polish for the requested feature.

Source detections do not prove success. A direct-only or backend-only issuer does not need an `issueCredential` call in this repository. Refresh context when state changes.
