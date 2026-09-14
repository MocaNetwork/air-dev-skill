# AIR account login

Inspect the existing authentication and client framework. Follow [sources.md](sources.md) and installed AIR Kit types for construction, initialization, login, and cleanup. Install `@mocanetwork/airkit` in the actual frontend workspace if absent, then record the resolved version. Use the real Partner ID and chosen environment. Browser SDK calls belong in client code.

## AIR login

Initialize AIR Kit with the installed version's supported options and invoke its login flow when needed. Reuse an existing session and avoid duplicate service initialization. Implement loading, cancellation, login failure, and logout/session cleanup using the actual return/event contract.

## BYO login

Available to issuer, verifier, and account-only roles. Follow https://docs.air3.com/recipes/custom-auth-integration for the auth model, but verify its code examples against installed SDK types.

The application first validates its own session. Its server signs a dedicated login JWT containing Partner ID and the verified user's email. AIR Kit 1.11.1 removed `partnerUserId`; keep any partner application's user ID in its own database. Pass the token to `airService.login({ authToken })` if supported by the installed version. Identity must not come directly from client-provided email/user ID.

Use `keys.mjs --env sandbox` for signing-only configuration in account/verifier roles, then implement the generated token route's authentication adapter. Request `{ "operation": "login" }` only when Custom auth is enabled. Issuance and verification tokens have their own scopes and are not interchangeable with login tokens.

For subsequent credential work, follow the relevant issue/verify playbook and its JWKS prerequisites. Account-only work does not need an unsolicited warning about unrelated credential features.
