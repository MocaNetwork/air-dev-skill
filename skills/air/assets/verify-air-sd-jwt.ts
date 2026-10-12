// Backend verification of the SD-JWT presentation returned by airService.verifyCredential().
// Source: https://docs.air3.com/products/identity/verify-sd-jwt (reference implementation).
// Requires: npm i @sd-jwt/sd-jwt-vc@^0.20 jose@^5 — run it on the server only.
import { createHash } from "node:crypto";
import { SDJwtVcInstance } from "@sd-jwt/sd-jwt-vc";
import {
  compactVerify,
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeJwt,
  importJWK,
  type JWK,
} from "jose";

/** An issuer you accept, and where its signing keys are published. */
export type TrustedIssuer =
  | { iss: `did:web:${string}` } // keys from the DID document's assertionMethod
  | { iss: string; jwksUrl: string }; // keys from the issuer's JWKS

export type VerifyAirSdJwtInput = {
  /** `verifiablePresentation` from a Compliant `verifyCredential` result. */
  verifiablePresentation: { verifiableCredential?: Array<{ id?: unknown }> };
  /** The `programId` you passed to `verifyCredential`. It is the KB-JWT `aud`. */
  programId: string;
  /** The `nonce` you passed to `verifyCredential`. Omit it if you passed none. */
  expectedNonce?: string;
  /** Reject presentations that are not holder-bound. */
  requireHolderBinding?: boolean;
  trustedIssuers: TrustedIssuer[];
  expectedVct: string;
  /** Claims that must be present, for example your `fieldsToDisclose`. */
  requiredClaims?: string[];
  /** Maximum KB-JWT age. Default 300. */
  maxKbAgeSeconds?: number;
  /** Tolerated clock difference with the holder's device. Default 60. */
  skewSeconds?: number;
  /** Check the issuer's Token Status List (revocation). Default false. */
  checkStatus?: boolean;
};

const ENVELOPE_PREFIXES = ["data:application/dc+sd-jwt,", "data:application/vc+sd-jwt,"];

export function extractCompactSdJwt(vp: VerifyAirSdJwtInput["verifiablePresentation"]): string {
  const id = vp.verifiableCredential?.[0]?.id;
  const prefix = ENVELOPE_PREFIXES.find((p) => typeof id === "string" && id.startsWith(p));
  if (typeof id !== "string" || !prefix) {
    throw new Error("The presentation does not contain an enveloped SD-JWT");
  }
  return id.slice(prefix.length);
}

const sha256 = (data: string | ArrayBuffer, alg: string): Uint8Array => {
  if (alg !== "sha-256") throw new Error(`Unsupported _sd_alg: ${alg}`);
  return createHash("sha256")
    .update(typeof data === "string" ? data : new Uint8Array(data))
    .digest();
};

type DidVerificationMethod = { id: string; publicKeyJwk?: JWK };
type DidDocument = {
  verificationMethod?: DidVerificationMethod[];
  assertionMethod?: Array<string | DidVerificationMethod>;
};

async function didWebKeySet(did: string) {
  const [host, ...path] = did.slice("did:web:".length).split(":");
  const origin = `https://${host.replace(/%3A/gi, ":")}`;
  const url = path.length
    ? `${origin}/${path.join("/")}/did.json`
    : `${origin}/.well-known/did.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DID document fetch failed: HTTP ${res.status}`);
  const doc = (await res.json()) as DidDocument;

  const absolute = (id: string) => (id.startsWith("#") ? `${did}${id}` : id);
  const methods = new Map((doc.verificationMethod ?? []).map((vm) => [absolute(vm.id), vm]));
  const keys: JWK[] = [];
  for (const ref of doc.assertionMethod ?? []) {
    const vm = typeof ref === "string" ? methods.get(absolute(ref)) : ref;
    if (!vm?.publicKeyJwk) continue;
    const id = absolute(vm.id);
    // Current credentials use the full DID URL as `kid`; older ones use only the fragment.
    keys.push({ ...vm.publicKeyJwk, kid: id });
    const fragment = id.split("#")[1];
    if (fragment) keys.push({ ...vm.publicKeyJwk, kid: fragment });
  }
  return createLocalJWKSet({ keys });
}

export async function verifyAirSdJwt(input: VerifyAirSdJwtInput) {
  const {
    programId,
    expectedNonce,
    requireHolderBinding = false,
    maxKbAgeSeconds = 300,
    skewSeconds = 60,
    checkStatus = false,
  } = input;
  const compact = extractCompactSdJwt(input.verifiablePresentation);

  // Unverified read, used only to select keys. The signature check below covers these claims.
  const unverified = decodeJwt(compact.split("~")[0]);
  const issuer = input.trustedIssuers.find((t) => t.iss === unverified.iss);
  if (!issuer) throw new Error(`Untrusted issuer: ${String(unverified.iss)}`);
  const issuerKeys =
    "jwksUrl" in issuer
      ? createRemoteJWKSet(new URL(issuer.jwksUrl))
      : await didWebKeySet(issuer.iss);

  const cnf = unverified.cnf;
  const holderBindable = typeof cnf === "object" && cnf !== null && "jwk" in cnf;
  if (requireHolderBinding && !(expectedNonce && holderBindable)) {
    throw new Error(
      "Holder binding required: send a nonce and accept only credentials with cnf.jwk"
    );
  }
  // With a nonce and cnf.jwk, Air always attaches a KB-JWT, so a missing one means it was stripped.
  const keyBindingNonce = expectedNonce && holderBindable ? expectedNonce : undefined;

  const verifyIssuerSignature = async (data: string, sig: string) => {
    try {
      await compactVerify(`${data}.${sig}`, issuerKeys);
      return true;
    } catch {
      return false;
    }
  };

  const sdjwt = new SDJwtVcInstance({
    hasher: sha256,
    verifier: verifyIssuerSignature,
    statusVerifier: verifyIssuerSignature,
    kbVerifier: async (data, sig, payload) => {
      const jwk = payload.cnf?.jwk;
      if (jwk?.kty !== "EC") return false;
      try {
        const key = await importJWK({ kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y }, "ES256");
        await compactVerify(`${data}.${sig}`, key, { algorithms: ["ES256"] });
        return true;
      } catch {
        return false;
      }
    },
  });

  // Checks the issuer signature, disclosure digests, exp/nbf, and, when keyBindingNonce is set,
  // the KB-JWT's typ, signature, nonce and sd_hash.
  const { payload, kb } = await sdjwt.verify(compact, {
    keyBindingNonce,
    requiredClaimKeys: input.requiredClaims,
    skewSeconds,
    disableStatusVerification: !checkStatus,
  });

  if (payload.vct !== input.expectedVct) throw new Error(`Unexpected vct: ${payload.vct}`);
  if (keyBindingNonce) {
    // The library does not check the KB-JWT audience or age.
    if (!kb) throw new Error("Missing KB-JWT");
    if (kb.payload.aud !== programId) throw new Error(`KB-JWT aud mismatch: ${kb.payload.aud}`);
    if (Math.floor(Date.now() / 1000) - kb.payload.iat > maxKbAgeSeconds) {
      throw new Error("KB-JWT is too old");
    }
  }

  return { claims: payload, holderBound: keyBindingNonce !== undefined };
}
