import { NextResponse } from "next/server";

export async function GET() {
  const raw = process.env.PARTNER_JWKS || process.env.SD_JWT_JWKS;
  if (!raw) {
    return NextResponse.json({ error: "Missing PARTNER_JWKS" }, { status: 500 });
  }

  try {
    const jwks = JSON.parse(raw);
    if (!Array.isArray(jwks.keys) || !jwks.keys.length
      || jwks.keys.some((key: Record<string, unknown>) => !key.kid || ["d", "p", "q", "dp", "dq", "qi"].some(field => field in key))) {
      return NextResponse.json({ error: "Invalid public JWKS" }, { status: 500 });
    }
    return NextResponse.json(jwks, {
      // Short cache while sandbox keys are being set up, so a replaced key is not stuck in
      // AIR's cache. Raise it once the signing key is final.
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return NextResponse.json({ error: "PARTNER_JWKS is not valid JSON" }, { status: 500 });
  }
}
