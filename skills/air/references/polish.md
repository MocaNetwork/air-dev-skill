# Polish

Improve the selected integration after checking [audit.md](audit.md).

- Request short-lived tokens per operation through authenticated code: `scope: "issue"` for issuance, `scope: "verify"` for verification, dedicated custom login claims (`email`, no scope) for login.
- Handle SDK rejections by `AirKitError` code and category (see [SDK errors](#sdk-errors-air-kit-113)), authorization failure, backend errors, and every verification status (`Non-Compliant`, `Pending`, `Revoking`, `Revoked`, `Expired`, `NotFound`).
- If verification immediately follows issuance, pass `waitForOnchainCompletion: true` to `issueCredential`. Do not invent a polling endpoint or status enum.
- Grant access only after the backend verifies the SD-JWT presentation; show a clear failure when it rejects. Keep nonce TTLs short and single-use.
- For Custom Auth, design the first-login email OTP step into the UX.
- If CORS is enabled on the issuer or a proxy, allow `*.air3.com`; restrict browser CORS on partner APIs to the actual required origins using the framework's supported configuration.
- AIR Kit loads its login flow in an iframe. If the app sets `Content-Security-Policy`, allow `frame-src` from `*.air3.com`.
- For wallet features, prompt passkey MFA setup (`setupOrUpdateMfa()`) after login. MFA is required before wallet requests, and `abstractAccountAddress` is absent from user info and the login token until it is set up, unless the partner opted out of that gate. Treat it as optional.
- Diagnose errors from the actual response and component. A 401 can involve token/JWKS/session configuration; a 403 from the issuer usually means the `x-api-key` mismatch. Neither proves a single cause.
- Before handing off, remind the user that development tunnel domains in Account → Domains should be replaced by the real HTTPS domains for launch.
- Keep the issuer origin stable; it is the issuer DID and is embedded in revocation and status-list URLs.
- Plan revocation before production: durable database, `/admin/revoke`, and, if used, a scheduled token status list publish.
- Recheck affected code/configuration after edits and report remaining runtime prerequisites accurately.

## SDK errors (AIR Kit 1.13+)

Every `AirService` method rejects with `AirKitError` (exported from `@mocanetwork/airkit`). Confirm the installed version first; before 1.13 the SDK threw `AirServiceError` with only a `name`.

- Branch on `err.code` (`"domain/reason"`), and always fall back on `err.category` (`user`, `session`, `config`, `network`, `internal`): new codes can appear in minor releases. Rethrow anything that is not an `AirKitError`.
- `err.name` (`USER_CANCELLED`, `CLIENT_ERROR`, …) and the `AirServiceError` alias are deprecated and removed in the next major release. Migrate existing `switch (err.name)` code: `USER_CANCELLED` → `auth/user-cancelled`, `CHANNEL_CLOSED` → `network/channel-closed`, `WINDOW_CLOSED` → `window/closed`, `PARTNER_TOKEN_EXPIRED` → `auth/partner-token-expired`; map `CLIENT_ERROR` by `code`.
- Never show `err.message` to users; it is developer English and can change. Show the app's own copy per `code` or `category`, and log `code` with `eventId` (quote `eventId` to AIR support).

| Category | Handling |
|---|---|
| `user` | Cancelled, rejected, or already explained by the AIR UI: stop the flow quietly |
| `session` | Mint a fresh Partner JWT (`auth/partner-token-expired`, `credential/session-expired`) or sign in again (`sdk/not-logged-in`, `auth/unauthorized`) |
| `config` | Integration problem: fix the call or Dashboard settings; do not offer a retry |
| `network` | Transient: offer a retry |
| `internal` | Generic error; log `code` and `eventId` |

Credential codes: `credential/not-eligible` (no matching credential: send the user to an accepted issuer), `credential/verification-failed` (verified but not compliant; `err.data.status` carries the status), `credential/revoked`, `credential/program-not-found` (wrong or empty program ID), `credential/issuer-not-ready` (issuer unreachable or not set up; see below), `credential/issue-failed`, `credential/verify-failed`, `credential/paused`, `credential/invalid-request`. `window/blocked` means the call did not come from a user gesture. `showReceiveUI()` resolves, rather than rejects, when closed.

`airService.provider.request(...)` still rejects with a standard EIP-1193 error; AIR detail is on `error.data.air` (`{ code, category, message, eventId }`).

Full list: https://docs.air3.com/help/error-codes.

## "Issuer is temporarily unavailable"

In AIR Kit 1.13+ this surfaces to the app as `credential/issuer-not-ready` (category `network`). The browser message "Issuer is temporarily unavailable" (`ISSUER_BACKEND_UNAVAILABLE`) comes from AIR's credential API, in sandbox `POST https://credential-testnet.api.sandbox.air3.com/v2/issuer/<partnerId>/issue-vc`. A 403, 502, or 503 there becomes that screen, and so does a 500 from the issuer's own `POST /issue-vc`. It does not prove the issuer is unreachable: on one traced claim AIR's call to `/available-vc` returned 201, and `/issue-vc` returned 500 because dStorage rejected the partner JWT.

Read the issuer log before diagnosing. The reference service does not log HTTP requests and Nest does not log 4xx, so add temporary request logging of method, path, status, `schemaId`, and the `x-api-key` length only (never the key, tokens, or claims). Then:

- No issuer request: AIR is still calling the URL registered in the Dashboard, often a dead tunnel host. Compare it with `PARTNER.md` → Issuer endpoints.
- Issuer 403: the Dashboard issuer API key does not match the backend `API_KEY`.
- Issuer 201 on `/available-vc`, then 500 on `/issue-vc`: AIR reached the issuer, and the failure is inside issuance or dStorage. For dStorage `401 Invalid x-partner-auth`, check the Dashboard JWKS URL and `kid` as described in [auth.md](auth.md).

Authentication, nonce handling, and secret handling are setup requirements, not optional polish. Do not add unrelated auth/wallet/paymaster features.
