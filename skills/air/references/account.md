# AIR account login

Inspect the existing authentication and client framework. Follow [sources.md](sources.md) and installed AIR Kit types for construction, initialization, login, and cleanup. Install `@mocanetwork/airkit` in the actual frontend workspace if absent, then record the resolved version. Use the real Partner ID and chosen environment. Browser SDK calls belong in client code.

## AIR login

Initialize AIR Kit with the installed version's supported options and invoke its login flow when needed. Reuse an existing session and avoid duplicate service initialization. Implement loading, cancellation, login failure, and logout/session cleanup using the actual return/event contract. In AIR Kit 1.13+ branch on `AirKitError` `code` with a `category` fallback: `auth/user-cancelled` and `window/closed` are cancellations, `network/channel-closed` means the popup or channel closed mid-flow, and `sdk/not-logged-in` or category `session` means sign in again. See [polish.md](polish.md#sdk-errors-air-kit-113).

`abstractAccountAddress` in the login token and user info is optional: it is returned only after passkey MFA setup unless the partner opted out. Do not assume it exists after login.

## BYO login

Available to issuer, verifier, and account-only roles. Follow https://docs.air3.com/get-started/authentication/custom-auth (and the https://docs.air3.com/get-started/recipes/bring-your-own-auth recipe) for the auth model, but verify code examples against installed SDK types.

The application first validates its own session. Its server signs a dedicated login JWT containing Partner ID and the verified user's email. AIR Kit 1.11+ removed `partnerUserId`; keep any partner application's user ID in its own database, joined to the AIR user UUID (`user.id`). By default the first Custom Auth login to an app sends an email one-time password to the address in the JWT, and later logins with the same email skip it; design the UX for that step rather than promising a silent login. Changes to this behavior are an AIR account customization request. Pass the token to `airService.login({ authToken })` if supported by the installed version. Identity must not come directly from client-provided email/user ID.

Use `keys.mjs --env sandbox` for signing-only configuration in account/verifier roles, then implement the generated token route's authentication adapter. Request `{ "operation": "login" }` only when Custom auth is enabled. Issuance tokens (`scope: "issue"`), verification tokens (`scope: "verify"`), and login tokens (`email`, no scope) are not interchangeable.

For subsequent credential work, follow the relevant issue/verify playbook and its JWKS prerequisites. Account-only work does not need an unsolicited warning about unrelated credential features.
