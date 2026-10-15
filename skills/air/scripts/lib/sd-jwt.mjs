// Decode and verify an SD-JWT VC presentation from verifyCredential() with node:crypto only.
// Mirrors the checks of assets/verify-air-sd-jwt.ts for local inspection; production code uses that asset.
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

const ENVELOPE_PREFIXES = ['data:application/dc+sd-jwt,', 'data:application/vc+sd-jwt,'];

const b64json = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const sha256 = text => createHash('sha256').update(text, 'ascii').digest('base64url');

/** Accepts a verifyCredential result, its verifiablePresentation, a data: URL, or a compact SD-JWT. */
export function extractCompact(input) {
  const text = String(input).trim();
  if (text.startsWith('{')) {
    const parsed = JSON.parse(text);
    const vp = parsed.verifiablePresentation ?? parsed;
    // Docs: { id: "data:application/dc+sd-jwt,…" }. AIR Kit 1.12 types: the compact string itself.
    const entry = vp?.verifiableCredential?.[0];
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (typeof id !== 'string') throw new Error('No verifiableCredential[0] SD-JWT in the JSON; is this a Compliant result?');
    return extractCompact(id);
  }
  const prefix = ENVELOPE_PREFIXES.find(p => text.startsWith(p));
  if (prefix) return text.slice(prefix.length);
  if (text.startsWith('data:')) throw new Error(`Unsupported envelope type: ${text.slice(0, text.indexOf(','))}`);
  if (!text.includes('~')) throw new Error('Not an SD-JWT: expected <Issuer-JWT>~<Disclosure>~…~[<KB-JWT>].');
  return text;
}

function decodeJwt(token, label) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`${label} is not a compact JWS.`);
  try {
    return { header: b64json(parts[0]), payload: b64json(parts[1]), signingInput: `${parts[0]}.${parts[1]}`, signature: parts[2] };
  } catch {
    throw new Error(`${label} header or payload is not base64url JSON.`);
  }
}

/** Splits and decodes every part. Nothing here is trusted until verifyPresentation() passes. */
export function decodePresentation(compact) {
  const parts = compact.split('~');
  const kbPart = parts.pop();
  const issuer = decodeJwt(parts[0], 'Issuer JWT');
  if (issuer.payload._sd_alg && issuer.payload._sd_alg !== 'sha-256') throw new Error(`Unsupported _sd_alg ${issuer.payload._sd_alg}.`);
  const disclosures = parts.slice(1).filter(Boolean).map(encoded => {
    let value;
    try { value = b64json(encoded); } catch { throw new Error('A disclosure is not base64url JSON.'); }
    if (!Array.isArray(value) || (value.length !== 3 && value.length !== 2)) throw new Error('A disclosure is not [salt, name, value] or [salt, value].');
    return value.length === 3
      ? { digest: sha256(encoded), name: value[1], value: value[2] }
      : { digest: sha256(encoded), value: value[1] };
  });

  // Rebuild the claims: replace each _sd digest (and array "..." digest) with its disclosure.
  const byDigest = new Map(disclosures.map(d => [d.digest, d]));
  const used = new Set();
  let hidden = 0;
  const rebuild = node => {
    if (Array.isArray(node)) {
      const out = [];
      for (const item of node) {
        if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 1 && '...' in item) {
          const d = byDigest.get(item['...']);
          if (d) { used.add(d.digest); out.push(rebuild(d.value)); } else hidden += 1;
        } else out.push(rebuild(item));
      }
      return out;
    }
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) if (key !== '_sd' && key !== '_sd_alg') out[key] = rebuild(value);
    for (const digest of node._sd ?? []) {
      const d = byDigest.get(digest);
      if (!d || d.name === undefined) { hidden += 1; continue; }
      if (d.name in out) throw new Error(`Disclosure for "${d.name}" collides with a visible claim.`);
      used.add(d.digest);
      out[d.name] = rebuild(d.value);
    }
    return out;
  };
  const claims = rebuild(issuer.payload);
  const unmatched = disclosures.filter(d => !used.has(d.digest));

  const disclosed = disclosures.filter(d => used.has(d.digest)).map(d => d.name ?? '(array element)');
  const kb = kbPart ? decodeJwt(kbPart, 'KB-JWT') : null;
  const sdHash = kb ? sha256(compact.slice(0, compact.length - kbPart.length)) : null;
  return { issuer, disclosures, disclosed, unmatched, hidden, claims, kb, sdHash };
}

function publicKey(jwk) {
  const { kty, crv, x, y, n, e } = jwk;
  return createPublicKey({ key: { kty, crv, x, y, n, e }, format: 'jwk' });
}

function checkJws(jwt, jwk) {
  const alg = jwt.header.alg;
  const data = Buffer.from(jwt.signingInput);
  const signature = Buffer.from(jwt.signature, 'base64url');
  if (alg === 'ES256') return verifySignature('sha256', data, { key: publicKey(jwk), dsaEncoding: 'ieee-p1363' }, signature);
  if (alg === 'ES384') return verifySignature('sha384', data, { key: publicKey(jwk), dsaEncoding: 'ieee-p1363' }, signature);
  if (alg === 'RS256') return verifySignature('sha256', data, publicKey(jwk), signature);
  if (alg === 'EdDSA') return verifySignature(null, data, publicKey(jwk), signature);
  throw new Error(`Unsupported signature alg ${alg}.`);
}

export function didDocumentUrl(did) {
  if (!did.startsWith('did:web:')) throw new Error(`Issuer ${did} is not did:web; pass its DID document with --did-doc.`);
  const [host, ...rest] = did.slice('did:web:'.length).split(':');
  const origin = `https://${decodeURIComponent(host)}`;
  return rest.length ? `${origin}/${rest.map(decodeURIComponent).join('/')}/did.json` : `${origin}/.well-known/did.json`;
}

/** The issuer key named by the JWT kid, taken only from the DID document's assertionMethod. */
export function issuerKey(didDocument, did, kid) {
  const absolute = id => (id.startsWith('#') ? `${did}${id}` : id);
  const methods = new Map((didDocument.verificationMethod ?? []).map(vm => [absolute(vm.id), vm]));
  const wanted = kid ? absolute(kid.includes('#') ? kid : `#${kid}`) : null;
  for (const ref of didDocument.assertionMethod ?? []) {
    const vm = typeof ref === 'string' ? methods.get(absolute(ref)) : ref;
    if (vm?.publicKeyJwk && (!wanted || absolute(vm.id) === wanted)) return vm.publicKeyJwk;
  }
  return null;
}

/**
 * Runs the backend checks from docs/products/identity/verify-sd-jwt and returns one row per check.
 * expect: { issuers?, vct?, programId?, nonce?, requireHolderBinding?, maxKbAgeSeconds?, now? }
 */
export function verifyPresentation(decoded, didDocument, expect = {}) {
  const now = expect.now ?? Math.floor(Date.now() / 1000);
  const skew = 60;
  const { issuer, kb } = decoded;
  const p = issuer.payload;
  const rows = [];
  const add = (check, ok, detail = '') => rows.push({ check, ok, detail });

  add('issuer is trusted', !expect.issuers?.length || expect.issuers.includes(p.iss), String(p.iss));
  add('DID document id matches iss', didDocument?.id === p.iss, String(didDocument?.id));
  const key = didDocument ? issuerKey(didDocument, p.iss, issuer.header.kid) : null;
  add('issuer key found (kid in assertionMethod)', Boolean(key), String(issuer.header.kid));
  let sigOk = false;
  let sigDetail = String(issuer.header.alg);
  try { sigOk = Boolean(key) && checkJws(issuer, key); } catch (error) { sigDetail = error.message; }
  add('issuer signature', sigOk, sigDetail);
  add('every disclosure is in the signed _sd', decoded.unmatched.length === 0, decoded.unmatched.length ? `${decoded.unmatched.length} unmatched` : `${decoded.disclosed.length} matched`);
  add('not expired', typeof p.exp !== 'number' || p.exp + skew > now, p.exp ? new Date(p.exp * 1000).toISOString() : 'no exp');
  add('not before', typeof p.nbf !== 'number' || p.nbf - skew <= now, p.nbf ? new Date(p.nbf * 1000).toISOString() : 'no nbf');
  if (expect.vct) add('vct is expected', p.vct === expect.vct, String(p.vct));

  const bindable = Boolean(p.cnf?.jwk);
  const wantKb = Boolean(expect.nonce) && bindable;
  if (expect.requireHolderBinding) add('holder binding possible (nonce sent, cnf.jwk present)', wantKb, bindable ? 'cnf.jwk present' : 'no cnf.jwk');
  if (!kb) {
    add('KB-JWT present', !wantKb, wantKb ? 'missing: stripped, or no nonce was passed' : 'not expected (bearer presentation)');
  } else {
    add('KB-JWT typ is kb+jwt', kb.header.typ === 'kb+jwt', String(kb.header.typ));
    let kbOk = false;
    try { kbOk = bindable && checkJws(kb, p.cnf.jwk); } catch { kbOk = false; }
    add('KB-JWT signed by cnf.jwk', kbOk, kb.header.alg);
    add('KB-JWT sd_hash covers these disclosures', kb.payload.sd_hash === decoded.sdHash);
    if (expect.nonce) add('KB-JWT nonce is yours', kb.payload.nonce === expect.nonce);
    if (expect.programId) add('KB-JWT aud is your programId', kb.payload.aud === expect.programId, String(kb.payload.aud));
    const age = now - Number(kb.payload.iat);
    const maxAge = expect.maxKbAgeSeconds ?? 300;
    add(`KB-JWT is fresh (≤ ${maxAge}s)`, Number.isFinite(age) && age <= maxAge && age >= -skew, `${age}s old`);
  }
  return rows;
}
