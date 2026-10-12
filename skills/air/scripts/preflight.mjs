#!/usr/bin/env node
import fs from 'node:fs';
import { createPublicKey, verify } from 'node:crypto';
import { parseArgs } from './lib/project.mjs';
import { checkDidDocument, deriveIssuerDid } from './lib/did.mjs';

// Issuance tokens carry scope "issue" (issueCredential and direct issuance); verification tokens scope "verify".
export function tokenOperation(claims) {
  if (claims.scope === 'issue' || claims.scope === 'verify') return claims.scope;
  if (claims.scope === undefined) throw new Error('Token has no scope; issuance tokens need scope "issue" and verification tokens scope "verify"');
  throw new Error('Wrong token scope');
}

export function verifyToken(token, jwks, { partnerId, operation, now = Math.floor(Date.now() / 1000) } = {}) {
  const parts = token.trim().split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  if (!['ES256', 'RS256'].includes(header.alg) || header.typ !== 'JWT') throw new Error('Unsupported JWT header');
  const jwk = jwks.keys?.find(key => key.kid === header.kid);
  if (!jwk || (jwk.alg && jwk.alg !== header.alg)) throw new Error('Signing kid or algorithm is absent from JWKS');
  if ((header.alg === 'ES256' && (jwk.kty !== 'EC' || jwk.crv !== 'P-256')) || (header.alg === 'RS256' && jwk.kty !== 'RSA')) throw new Error('Algorithm and key type differ');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), { key, ...(header.alg === 'ES256' ? { dsaEncoding: 'ieee-p1363' } : {}) }, Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid signature');
  if (!claims.partnerId || (partnerId && claims.partnerId !== partnerId)) throw new Error('Partner ID mismatch');
  if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 30 || claims.exp - claims.iat > 900) throw new Error('Token expired or lifetime invalid');
  if (claims.nbf && claims.nbf > now) throw new Error('Token is not yet valid');
  const actual = tokenOperation(claims);
  if (operation && actual !== operation) throw new Error(`Wrong token scope: expected a ${operation} token, got ${actual}`);
  return { kid: header.kid, operation: actual };
}

async function main() {
  const flags = parseArgs();
  const [backend, web] = flags._;
  // The SD-JWT issuer service publishes did.json and jwt-vc-issuer, not a Partner JWT JWKS route.
  const jwksUrl = flags['jwks-url'] || (web ? `${web.replace(/\/$/, '')}/api/.well-known/jwks` : null);
  if (!jwksUrl) throw new Error('Usage: preflight.sh <backend-origin> [web-origin] [--jwks-url <registered-url>] [--token-file <file>] [--operation issue|verify] [--kid <kid>]. A backend-only issuer must pass the registered --jwks-url.');
  const url = new URL(jwksUrl);
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Live readiness requires a public HTTPS JWKS URL');
  const response = await fetch(jwksUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`JWKS returned HTTP ${response.status}`);
  const jwks = await response.json();
  if (!Array.isArray(jwks.keys) || !jwks.keys.length) throw new Error('JWKS has no keys');
  for (const key of jwks.keys) {
    if (!key.kid || ['d', 'p', 'q', 'dp', 'dq', 'qi'].some(field => field in key)) throw new Error('JWKS must contain identified public keys only');
    createPublicKey({ key, format: 'jwk' });
  }
  console.log('Public JWKS is reachable and contains parseable public keys.');
  if (flags['token-file']) {
    const raw = fs.readFileSync(flags['token-file'], 'utf8').trim();
    const token = raw.startsWith('{') ? JSON.parse(raw).token : raw;
    const result = verifyToken(token, jwks, { partnerId: flags['partner-id'], operation: flags.operation || flags.scope });
    console.log(`JWT signature, kid, claims and expiry verified (${result.operation} token).`);
  } else console.log('JWT validation not run: supply --token-file with a token obtained through the authenticated app.');
  if (backend) {
    if (!backend.startsWith('https://')) throw new Error('Live issuance requires a public HTTPS backend');
    const origin = backend.replace(/\/+$/, '');
    const did = deriveIssuerDid(origin);
    const didResponse = await fetch(`${origin}/.well-known/did.json`, { signal: AbortSignal.timeout(10000) });
    if (!didResponse.ok) throw new Error(`DID document returned HTTP ${didResponse.status}`);
    const problems = checkDidDocument(await didResponse.json(), { did, kid: flags.kid });
    if (problems.length) throw new Error(`DID document check failed: ${problems.join('; ')}`);
    console.log(`DID document served for ${did}${flags.kid ? ` with signing key ${did}#${flags.kid}` : ''}.`);
    const response = await fetch(`${origin}/revocation-status/preflight-probe`, { signal: AbortSignal.timeout(10000) });
    if (response.status >= 500) throw new Error(`Revocation status probe returned HTTP ${response.status}`);
    console.log(`Backend reachable (revocation-status probe HTTP ${response.status}); this does not validate an actual credential status.`);
  }
  console.log('Dashboard registration (issuer DID, endpoint URLs, API key, JWKS URL), domain registration and end-to-end issuance/verification still require separate confirmation.');
}
if (process.argv[1]?.endsWith('/preflight.mjs')) main().catch(error => { console.error(error.message); process.exitCode = 1; });
