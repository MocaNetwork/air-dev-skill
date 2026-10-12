# Audit

Run `node <skill-base-dir>/scripts/detect.mjs --json`. The report distinguishes concrete configuration failures from source observations. Source text matches are not proof of runtime behavior. Inspect each finding before editing; do not fix examples or documentation as if they were live requests. A clean scan does not establish a complete integration.

For live endpoints:

```bash
sh <skill-base-dir>/scripts/preflight.sh <issuer-origin> [web-origin] [--jwks-url <registered-url>] --kid <signing-kid> --token-file <gitignored-token-file> --operation issue --partner-id <actual-id>
# Verifier-only:
node <skill-base-dir>/scripts/preflight.mjs --jwks-url <actual-url> --token-file <gitignored-token-file> --operation verify --partner-id <actual-id>
```

Obtain the short-lived token through the authenticated app or use the local diagnostic JWT helper for signing configuration only. Never remove authentication to make preflight pass. The checker verifies public JWKS and, when a token is provided, its signature, kid, algorithm, claims, and expiry. For an issuer origin it also confirms `/.well-known/did.json` serves the derived `did:web` DID (and `<did>#<kid>` when `--kid` is given); a synthetic `revocation-status` probe establishes reachability only. A backend-only issuer must pass the registered `--jwks-url`, because the issuer service serves no JWKS route.

Separately verify anonymous token and presentation requests are denied, authenticated users have appropriate operation permissions, verification nonces are single-use, Dashboard JWKS/domain settings, issuer registration (DID, API key, endpoint URLs) where applicable, and a real issue/verify flow including the backend presentation check. State which checks were actually run and which remain pending. Do not print tokens or secret values in findings.
