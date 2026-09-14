# Polish

Improve the selected integration after checking [audit.md](audit.md).

- Request short-lived tokens per operation through authenticated code; use `issue`, `verify`, or dedicated custom login claims appropriately.
- Handle login/consent cancellation, authorization failure, backend errors, and actual SDK result states.
- If verification immediately follows issuance, use the installed SDK's supported on-chain wait option when the program needs it. Do not invent a polling endpoint or status enum.
- Restrict browser CORS to the actual required origins using the backend framework's supported configuration; a literal wildcard string is not necessarily a valid subdomain allowlist.
- Diagnose errors from the actual response and component. A 401 can involve token/JWKS/session configuration; a 403 can involve permissions/API credentials/registration. Neither proves a single cause.
- Keep issuer origins stable for credential status URLs; avoid replacing a deployed origin with an ephemeral tunnel.
- Recheck affected code/configuration after edits and report remaining runtime prerequisites accurately.

Authentication and secret handling are setup requirements, not optional polish. Do not add unrelated auth/wallet/paymaster features.
