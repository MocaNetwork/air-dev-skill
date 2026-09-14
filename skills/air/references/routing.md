# No-argument routing

An invocation of `/air` without a task asks for next steps. Inspect current context and suggest up to three applicable commands with short reasons. Do not start setup or show every command unless useful or requested.

Use helper recommendations as hints. Respect role and trigger:

- Missing context → init.
- Issuer needing a backend → issue; backend installed but missing keys → keys; configured backend missing DID → issuer-did.
- Verifier or BYO login missing signing keys → keys, without an issuer backend.
- Missing public JWKS/registration → register when the endpoint is ready, otherwise implement it in the selected app.
- Registered issuer missing schema/program → schema; missing SDK/direct implementation → issue for the selected trigger.
- Verifier missing program/integration → verify.
- Account-only → account; agentic → agent.
- Existing implementation → audit, then polish for the requested feature.

Source detections do not prove success. A direct-only or backend-only issuer does not need an `issueCredential` call in this repository. Refresh context when state changes.
