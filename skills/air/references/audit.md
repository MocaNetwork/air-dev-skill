# Audit

Run `node <skill-base-dir>/scripts/detect.mjs --json`. The report distinguishes concrete configuration failures from source observations. Source text matches are not proof of runtime behavior. Inspect each finding before editing; do not fix examples or documentation as if they were live requests. A clean scan does not establish a complete integration.

For live endpoints:

```bash
sh <skill-base-dir>/scripts/preflight.sh <backend-origin> [web-origin] --token-file <gitignored-token-file> --scope issue --partner-id <actual-id>
# Verifier-only:
node <skill-base-dir>/scripts/preflight.mjs --jwks-url <actual-url> --token-file <gitignored-token-file> --scope verify --partner-id <actual-id>
```

Obtain the short-lived token through the authenticated app or use the local diagnostic JWT helper for signing configuration only. Never remove authentication to make preflight pass. The checker verifies public JWKS and, when a token is provided, its signature, kid, algorithm, claims, and expiry. A synthetic credential-status probe establishes reachability only.

Separately verify anonymous token requests are denied, authenticated users have appropriate operation permissions, Dashboard JWKS/domain settings, issuer registration where applicable, and a real issue/verify flow. State which checks were actually run and which remain pending. Do not print tokens or secret values in findings.
