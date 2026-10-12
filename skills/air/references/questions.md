# Asking the user

Every question this skill asks goes through the harness's structured question tool, with choices. Do not ask in plain prose when such a tool is available.

| Harness | Tool |
|---|---|
| Claude Code | `AskUserQuestion` |
| Cursor | `AskQuestion` |
| Codex | `request_user_input` |
| Other harnesses | Their equivalent multiple-choice question tool |

Use the tool name the current session actually exposes. If none is available (for example Cursor outside Plan mode or with a model that lacks it, Codex with the tool disabled, or a headless run), ask the same question as a short numbered list of the same choices plus "Other", one line each, and wait for the answer.

## Format that works in all three

- One to three questions per call; ask dependent questions in a later call. Prefer one question unless several independent decisions block the next step.
- Each question has a short header (at most 12 characters), a complete question ending in "?", and two to four options.
- Option labels are one to five words; put the consequence in the option description. Put the recommended option first and add "(Recommended)" to its label.
- Do not add an "Other" option yourself; the tools provide free-text entry. For free-form values (IDs, paths, URLs), offer the realistic alternatives as options and let the user type the value through the free-text entry.
- Never collect secrets through a question: private keys, `API_KEY`, `ADMIN_API_KEY`, or database passwords. Offer "I'll add it to the gitignored env file" and read the file afterwards.
- Skip questions whose answer is already in the conversation, `PARTNER.md`/`AIR.md`, or discoverable from the project. Preselect detected values as the recommended option.
- Confirmations before cloning, installing, starting services, or overwriting configuration are questions too: ask them with the tool, with the action and its alternative as options.

## Setup questions

Ask in this order, batching up to three that do not depend on each other. Record answers with `init.mjs` flags as noted.

**Call 1**

| Header | Question | Options → flag |
|---|---|---|
| Role | What would you like to add to this app? | Issue credentials — through AIR Kit or directly from your backend → `--role issuer` · Verify credentials → `verifier` · Issue and verify → `both` · Account wallet only → `account-only` |
| Setup | Is this a new AIR setup or an existing partner? | New setup — generate keys · Existing partner — import my configuration → `--existing` |
| Partner ID | Do you have your sandbox Partner ID (Dashboard → Account → General)? | I have it — type it in · Not yet — show me where to find it |

An agentic wallet is not one of the four options; users who type it go to [agent.md](agent.md). Never label issuance "issue from my backend": the issuer backend always signs, and the trigger is a separate question.

**Call 2** (depends on role)

| Header | Question | Options → flag | When |
|---|---|---|---|
| Issuance | How should issuance start? | Users claim through AIR Kit → `--issuance sdk` · Your backend issues directly → `direct` · Both → `both` | issuer, both |
| Login | How do users sign in? | AIR Kit login → `--auth air-login` · My existing login (Custom Auth) → `byo` | any role with user login |
| Frontend | Where does the AIR Kit UI live? | Existing app at `<detected path>` → `--frontend existing --web-dir <path>` · Create a Next.js app in apps/web → `next` · No frontend in this repo → `none` | when AIR Kit runs in a browser |

**Call 3** (issuer and both only)

| Header | Question | Options → flag |
|---|---|---|
| Database | Which database should the issuer backend use? | None for now — sandbox only → `--db none` · Local Docker Postgres → `docker` · Existing Postgres → `external` (the URL goes into the gitignored root `.env`) |
| Origin | Where will the issuer service be reachable over HTTPS? | Existing deployment — type the origin · Deploy to a host (Railway, Render, …) · Development tunnel with a reserved domain |
| Backend | Where should the issuer backend live? | `<detected directory>` · apps/backend → `--backend-dir apps/backend` |

The origin becomes the `did:web` issuer DID host. When the user picks an ephemeral tunnel, state in the option description that a new host means a new issuer identity.

## Credential questions

Used by [schema.md](schema.md) to write `air/credentials/<name>.json`. Ask once per credential type, after the issuer origin is known.

**Call 1**

| Header | Question | Options |
|---|---|---|
| Credential | What should this credential prove about the user? | Membership or loyalty tier · KYC or identity check passed · Event ticket or attendance · (free text for anything else) |
| Claims | Which claims should it contain? | Suggested claims for the chosen purpose, as one option · Let me list them — type `name:type:label` per claim |
| Data | Where does the claim data come from? | Existing database · Existing API or service · Static test values (sandbox only) |

**Call 2**

| Header | Question | Options |
|---|---|---|
| Disclosure | Which claims may a holder disclose on their own? | All of them (Recommended) · Only some — type which · None; every claim is always visible |
| Validity | How long should each credential stay valid? | One year · 30 days · Type a number of days |
| VCT URL | Where should the credential type's vct URL live? | On the issuer origin (Recommended) — `${ISSUER_ORIGIN}/vct/<name>/v1` · Another HTTPS domain you control — type the URL · No hosted URL — use a URN identifier |

Propose `title`, `description`, `name`, and claim labels from the answers; ask only when they cannot be derived. Never put real user data in the spec.

## Other questions

- Unknown issuance trigger during `/air issue`: the Issuance question above.
- Verification inputs: Program ("Do you have the published verification program ID?" — I have it — type it in · Not yet — walk me through the Dashboard), and Issuers ("Which issuers should your backend accept?" — the recorded issuer DID · Another did:web issuer — type it in).
- Domain: "Have you whitelisted `<tunnel or app domain>` under Account → Domains?" — Yes, it's whitelisted · Not yet — show me where. AIR Kit does not load until it is; record `--domain-whitelisted yes` only after "Yes".
- Registration state: "Have you saved this in the Dashboard?" — Yes, it's saved · Not yet — show me the fields. Record `provision.mjs` state only after "Yes".
- `/air` with no task: offer the recommended next commands from [routing.md](routing.md) as the options, each with its reason as the description.
