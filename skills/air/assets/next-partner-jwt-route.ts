import { NextResponse } from "next/server";
import { createPrivateKey, sign } from "node:crypto";
import { authorizeAirToken } from "./air-token-auth";

export const runtime = "nodejs";
const allowedOperations: string[] = [/* AIR_ALLOWED_OPERATIONS */];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const operation = body?.operation;
  if (!allowedOperations.includes(operation)) {
    return NextResponse.json({ error: "Unsupported operation" }, { status: 400 });
  }
  // Integrate the application's actual session and authorization checks in this
  // adapter before exposing the route. Identity never comes from the request body.
  const user = await authorizeAirToken(request);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!user.operations.includes(operation)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const der = process.env.PARTNER_PRIVATE_KEY_DER;
    const partnerId = process.env.PARTNER_ID || process.env.NEXT_PUBLIC_PARTNER_ID;
    const kid = process.env.PARTNER_PRIVATE_KEY_KID;
    if (!der || !partnerId || !kid) throw new Error("Missing key configuration");
    const key = createPrivateKey({ key: Buffer.from(der, "base64"), type: "pkcs8", format: "der" });
    const jwk = key.export({ format: "jwk" });
    const alg = jwk.kty === "RSA" ? "RS256" : jwk.kty === "EC" && jwk.crv === "P-256" ? "ES256" : null;
    if (!alg) throw new Error("Unsupported signing key");
    const published = JSON.parse(process.env.SD_JWT_JWKS || "{}");
    const match = published.keys?.find((entry: { kid?: string }) => entry.kid === kid);
    if (!match || ["kty", "crv", "x", "y", "n", "e"].some(field => match[field] !== jwk[field])
      || (match.alg && match.alg !== alg)) throw new Error("JWKS mismatch");
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = { partnerId, iat: now, exp: now + 300 };
    if (operation === "login") {
      if (!user.email) throw new Error("Missing authenticated email");
      claims.email = user.email;
    } else claims.scope = operation;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const data = `${encode({ alg, kid, typ: "JWT" })}.${encode(claims)}`;
    const signature = sign("sha256", Buffer.from(data), { key, ...(alg === "ES256" ? { dsaEncoding: "ieee-p1363" as const } : {}) });
    return NextResponse.json({ token: `${data}.${signature.toString("base64url")}` }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Partner token configuration is incomplete" }, { status: 500 });
  }
}
