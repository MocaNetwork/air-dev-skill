import { NextResponse } from "next/server";

export async function GET() {
  const raw = process.env.SD_JWT_JWKS;
  if (!raw) {
    return NextResponse.json({ error: "Missing SD_JWT_JWKS" }, { status: 500 });
  }

  try {
    const jwks = JSON.parse(raw);
    if (!Array.isArray(jwks.keys) || !jwks.keys.length
      || jwks.keys.some((key: Record<string, unknown>) => !key.kid || ["d", "p", "q", "dp", "dq", "qi"].some(field => field in key))) {
      return NextResponse.json({ error: "Invalid public JWKS" }, { status: 500 });
    }
    return NextResponse.json(jwks, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "SD_JWT_JWKS is not valid JSON" }, { status: 500 });
  }
}
