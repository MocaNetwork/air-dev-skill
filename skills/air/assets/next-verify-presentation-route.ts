import { NextResponse } from "next/server";
import { authorizeAirToken, consumeVerificationNonce } from "AIR_TOKEN_AUTH_IMPORT";
import { verifyAirSdJwt, type TrustedIssuer } from "./verify-air-sd-jwt";

export const runtime = "nodejs";

const list = (value: string | undefined) => (value ?? "").split(",").map(item => item.trim()).filter(Boolean);

// The browser posts result.verifiablePresentation from a Compliant verifyCredential call.
// The wrapper is unsigned and AIR's check ran in the browser, so trust only this result.
export async function POST(request: Request) {
  const user = await authorizeAirToken(request);
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!user.operations.includes("verify")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const programId = process.env.AIR_VERIFY_PROGRAM_ID;
  const expectedVct = process.env.AIR_EXPECTED_VCT;
  const trustedIssuers: TrustedIssuer[] = list(process.env.AIR_TRUSTED_ISSUERS)
    .filter((iss): iss is `did:web:${string}` => iss.startsWith("did:web:"))
    .map(iss => ({ iss }));
  if (!programId || !expectedVct || !trustedIssuers.length) {
    return NextResponse.json({ error: "Verification configuration is incomplete" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  // Consume before verifying: the nonce is single-use even when verification fails.
  const expectedNonce = await consumeVerificationNonce(user);
  if (!expectedNonce) return NextResponse.json({ error: "No pending verification for this session" }, { status: 400 });

  try {
    const { claims } = await verifyAirSdJwt({
      verifiablePresentation: body?.verifiablePresentation ?? {},
      programId,
      expectedNonce,
      requireHolderBinding: true,
      trustedIssuers,
      expectedVct,
      requiredClaims: list(process.env.AIR_REQUIRED_CLAIMS),
    });
    // Act on the verified `claims` here (grant access, record the result) before responding.
    void claims;
    return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ verified: false }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
