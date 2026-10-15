// Backend verification of the SD-JWT presentation returned by airService.verifyCredential().
// Source: https://docs.air3.com/products/identity/verify-sd-jwt (reference implementation).
// Requires: npm i @sd-jwt/sd-jwt-vc@^0.20 jose@^5 — run it on the server only.
import { createHash } from "node:crypto";
import { SDJwtVcInstance } from "@sd-jwt/sd-jwt-vc";
import { compactVerify, decodeJwt, importJWK, type CompactVerifyGetKey, type JWK } from "jose";

/** An issuer you accept. Where its signing keys come from depends on `iss`. */
export type TrustedIssuer = {
  /**
   * `did:web:…`: keys from the DID document's assertionMethod.
   * `https://…`: keys from the issuer's `/.well-known/jwt-vc-issuer` metadata.
   * Any other id: keys from `jwksUrl`.
   */
  iss: string;
  /** The issuing partner's JWKS URL. Used only for issuer ids that are not `did:web:` or `https://`. */
  jwksUrl?: string;
  /**
   * The issuer's revocation status URL (`revocationStatusApiUrl`), for example
   * `https://issuer.example/revocation-status`. When set, the credential is rejected
   * unless `GET <url>/<nonce>` returns `{ "isRevoked": false }`.
   */
  revocationStatusUrl?: string;
};

export type VerifyAirSdJwtInput = {
  /** `verifiablePresentation` from a Compliant `verifyCredential` result. */
  verifiablePresentation: { verifiableCredential?: Array<{ id?: unknown } | string> };
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
  /** Check the issuer's Token Status List, when the credential has `status`. Default false. */
  checkStatus?: boolean;
};

const ENVELOPE_PREFIXES = ["data:application/dc+sd-jwt,", "data:application/vc+sd-jwt,"];

export function extractCompactSdJwt(vp: VerifyAirSdJwtInput["verifiablePresentation"]): string {
  // Docs: an EnvelopedVerifiableCredential whose id is a data: URL. AIR Kit 1.12 types: the
  // compact SD-JWT string itself. Accept both.
  const entry = vp.verifiableCredential?.[0];
  const id = typeof entry === "string" ? entry : entry?.id;
  if (typeof id !== "string") throw new Error("The presentation does not contain an enveloped SD-JWT");
  const prefix = ENVELOPE_PREFIXES.find((p) => id.startsWith(p));
  if (prefix) return id.slice(prefix.length);
  if (!id.startsWith("data:") && id.includes("~") && id.split("~")[0].split(".").length === 3) return id;
  throw new Error("The presentation does not contain an enveloped SD-JWT");
}

const sha256 = (data: string | ArrayBuffer, alg: string): Uint8Array => {
  if (alg !== "sha-256") throw new Error(`Unsupported _sd_alg: ${alg}`);
  return createHash("sha256")
    .update(typeof data === "string" ? data : new Uint8Array(data))
    .digest();
};

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

type DidVerificationMethod = { id: string; publicKeyJwk?: JWK };
type DidDocument = {
  id?: string;
  verificationMethod?: DidVerificationMethod[];
  assertionMethod?: Array<string | DidVerificationMethod>;
};

// did:web: the assertionMethod keys, each with its full DID URL as `kid`.
async function didWebKeys(did: string): Promise<JWK[]> {
  const [host, ...path] = did.slice("did:web:".length).split(":");
  const origin = `https://${host.replace(/%3A/gi, ":")}`;
  const url = path.length
    ? `${origin}/${path.join("/")}/did.json`
    : `${origin}/.well-known/did.json`;
  const doc = (await fetchJson(url)) as DidDocument;
  if (doc.id !== did) throw new Error(`DID document id mismatch: ${String(doc.id)}`);

  const absolute = (id: string) => (id.startsWith("#") ? `${did}${id}` : id);
  const methods = new Map((doc.verificationMethod ?? []).map((vm) => [absolute(vm.id), vm]));
  const keys: JWK[] = [];
  for (const ref of doc.assertionMethod ?? []) {
    const vm = typeof ref === "string" ? methods.get(absolute(ref)) : ref;
    if (vm?.publicKeyJwk) keys.push({ ...vm.publicKeyJwk, kid: absolute(vm.id) });
  }
  return keys;
}

// HTTPS issuer: SD-JWT VC issuer metadata at /.well-known/jwt-vc-issuer.
async function httpsIssuerKeys(iss: string): Promise<JWK[]> {
  const url = new URL(iss);
  const path = url.pathname.replace(/\/$/, "");
  const metadata = await fetchJson(`${url.origin}/.well-known/jwt-vc-issuer${path}`);
  if (metadata.issuer !== iss) throw new Error(`Issuer metadata mismatch: ${String(metadata.issuer)}`);
  const jwks = metadata.jwks ?? (metadata.jwks_uri ? await fetchJson(metadata.jwks_uri) : undefined);
  return jwks?.keys ?? [];
}

async function issuerKeys(issuer: TrustedIssuer): Promise<JWK[]> {
  if (issuer.iss.startsWith("did:web:")) return didWebKeys(issuer.iss);
  if (issuer.iss.startsWith("https://")) return httpsIssuerKeys(issuer.iss);
  if (issuer.jwksUrl) return ((await fetchJson(issuer.jwksUrl)).keys ?? []) as JWK[];
  throw new Error(`No key source for issuer ${issuer.iss}`);
}

// Picks the key named by the header `kid`, in full or by the part after `#`:
// current credentials use the full DID URL, JWKS keys usually only the fragment.
function keyFor(keys: JWK[]): CompactVerifyGetKey {
  const fragment = (kid?: string) => kid?.split("#").pop();
  return async ({ kid, alg }) => {
    const jwk = keys.find((k) => k.kid === kid) ?? keys.find((k) => fragment(k.kid) === fragment(kid));
    if (!jwk) throw new Error(`No issuer key for kid ${String(kid)}`);
    return importJWK(jwk, alg);
  };
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
  const issuerKey = keyFor(await issuerKeys(issuer));

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
      await compactVerify(`${data}.${sig}`, issuerKey);
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

  if (issuer.revocationStatusUrl) {
    // The issuer JWT's `nonce` is the credential's revocation nonce.
    const revocationNonce = (payload as { nonce?: unknown }).nonce;
    if (typeof revocationNonce !== "string" || !revocationNonce) {
      throw new Error("Credential has no revocation nonce");
    }
    const base = issuer.revocationStatusUrl.replace(/\/$/, "");
    const status = await fetchJson(`${base}/${encodeURIComponent(revocationNonce)}`);
    if (status?.isRevoked !== false) throw new Error("Credential is revoked");
  }

  return { claims: payload, holderBound: keyBindingNonce !== undefined };
}
