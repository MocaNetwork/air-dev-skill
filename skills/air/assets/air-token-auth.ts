import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AirTokenUser = {
  id: string;
  email?: string;
  operations: Array<"issue" | "verify" | "login">;
};

// Operations an authenticated AIR user of this app may request; set from the project role.
// Narrow them with the application's own policy in authorizeAirToken if needed.
const OPERATIONS: AirTokenUser["operations"] = [/* AIR_TOKEN_OPERATIONS */];

// AIR login tokens (login().token, getAccessToken().token). Sandbox tries each key set in order;
// sandbox and production key IDs do not overlap, so only a missing kid moves to the next set.
const AIR_JWKS_URLS = (process.env.AIR_BUILD_ENV ?? process.env.NEXT_PUBLIC_BUILD_ENV) === "production"
  ? ["https://static.air3.com/.well-known/jwks.json"]
  : [
      "https://static.sandbox.air3.com/.well-known/jwks.json",
      "https://account.sandbox-testnet.air3.com/.well-known/jwks.json",
      "https://static.air3.com/.well-known/jwks.json",
    ];
const keySets = AIR_JWKS_URLS.map((url) => createRemoteJWKSet(new URL(url)));

// Rejects cross-site browser requests. Behind a tunnel, request.url is https://localhost:<port>
// while the browser Origin is the public host, so compare against the forwarded host instead.
export function isSameSiteRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (site === "same-origin" || site === "same-site") return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function verifyAirLoginToken(token: string): Promise<JWTPayload | null> {
  for (const keySet of keySets) {
    try {
      return (await jwtVerify(token, keySet)).payload;
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_JWKS_NO_MATCHING_KEY") continue;
      return null;
    }
  }
  return null;
}

// Authenticates the caller with the AIR login token sent as `Authorization: Bearer <token>`.
// For Custom Auth (BYO login), replace this with the application's own verified session, which
// supplies the user's email. Never trust an email, user ID, or permissions supplied in the body.
export async function authorizeAirToken(request: Request): Promise<AirTokenUser | null> {
  if (!isSameSiteRequest(request)) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  const partnerId = process.env.PARTNER_ID || process.env.NEXT_PUBLIC_PARTNER_ID;
  if (!match || !partnerId) return null;
  const payload = await verifyAirLoginToken(match[1]);
  if (!payload || payload.partnerId !== partnerId || typeof payload.sub !== "string" || !payload.sub) return null;
  return { id: payload.sub, operations: OPERATIONS };
}

// Store the verification nonce server-side against this user's session (session
// store or database) with a short TTL, replacing any earlier pending nonce. Return
// true only once it is stored. The default refuses, so verification fails closed.
export async function storeVerificationNonce(_user: AirTokenUser, _nonce: string): Promise<boolean> {
  return false;
}

// Return this user's pending nonce and delete it in the same step, so a presentation
// cannot be replayed. Return null when none is pending.
export async function consumeVerificationNonce(_user: AirTokenUser): Promise<string | null> {
  return null;
}
