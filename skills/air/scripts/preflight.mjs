#!/usr/bin/env node
import fs from 'node:fs';
import { createPublicKey, verify } from 'node:crypto';
import { parseArgs } from './lib/project.mjs';

export function verifyToken(token, jwks, { partnerId, scope, now = Math.floor(Date.now() / 1000) } = {}) {
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
  if (!['issue', 'verify'].includes(claims.scope) || (scope && claims.scope !== scope)) throw new Error('Wrong token scope');
  return { kid: header.kid, scope: claims.scope };
}

async function main() {
  const flags = parseArgs();
  const [backend, web] = flags._;
  const jwksUrl = flags['jwks-url'] || (web ? `${web.replace(/\/$/, '')}/api/.well-known/jwks` : backend ? `${backend.replace(/\/$/, '')}/.well-known/jwks` : null);
  if (!jwksUrl) throw new Error('Usage: preflight.sh <backend-origin> [web-origin] [--token-file <file>] [--scope issue|verify], or node preflight.mjs --jwks-url <url>');
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
    const result = verifyToken(token, jwks, { partnerId: flags['partner-id'], scope: flags.scope });
    console.log(`JWT signature, kid, claims and expiry verified (${result.scope}).`);
  } else console.log('JWT validation not run: supply --token-file with a token obtained through the authenticated app.');
  if (backend) {
    if (!backend.startsWith('https://')) throw new Error('Live issuance requires a public HTTPS backend');
    const response = await fetch(`${backend.replace(/\/$/, '')}/credential-status/preflight-probe`, { signal: AbortSignal.timeout(10000) });
    if (response.status >= 500) throw new Error(`Status probe returned HTTP ${response.status}`);
    console.log(`Backend reachable (probe HTTP ${response.status}); this does not validate an actual credential status.`);
  }
  console.log('Dashboard registration, issuer activation, domain whitelist and end-to-end issuance/verification still require separate confirmation.');
}
if (process.argv[1]?.endsWith('/preflight.mjs')) main().catch(error => { console.error(error.message); process.exitCode = 1; });
