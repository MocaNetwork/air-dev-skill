#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './lib/project.mjs';
import { decodePresentation, didDocumentUrl, extractCompact, verifyPresentation } from './lib/sd-jwt.mjs';

function usage(code = 2) {
  process.stderr.write(`Usage: node sd-jwt.mjs inspect <file|-> [--verify] [--nonce <n>] [--program-id <id>]
                       [--vct <vct>] [--issuer <did>] [--require-holder-binding] [--did-doc <file|url>] [--json]

Shows what a verifier learns from a verifyCredential presentation: the issuer JWT, the claims the
holder disclosed, the claims still hidden, and the KB-JWT. Input: the Compliant result JSON, its
verifiablePresentation, the data: URL, or the compact SD-JWT (file, or - for stdin).
--verify runs the backend checks: issuer key from the did:web DID document, issuer signature,
disclosure digests, exp/nbf, vct, and KB-JWT signature, sd_hash, nonce, aud and age.
--did-doc reads the DID document from a file or another URL (for example a local backend).
Decoding is not verification. Disclosures are personal data: inspect sandbox presentations only.
`);
  process.exit(code);
}

const RESERVED = new Set(['iss', 'sub', 'iat', 'exp', 'nbf', 'vct', 'vct#integrity', 'cnf', 'status', 'id', 'nonce']);
const time = value => (typeof value === 'number' ? `${new Date(value * 1000).toISOString()} (${value})` : '(none)');

async function loadDidDocument(source, iss) {
  const location = source ? String(source) : didDocumentUrl(iss);
  if (!/^https?:\/\//.test(location)) return JSON.parse(fs.readFileSync(path.resolve(location), 'utf8'));
  const response = await fetch(location, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`GET ${location} returned HTTP ${response.status}.`);
  return response.json();
}

async function main() {
  const flags = parseArgs();
  if (flags.help) usage(0);
  if (flags._[0] !== 'inspect' || !flags._[1]) usage(2);
  const raw = flags._[1] === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(flags._[1]), 'utf8');
  const decoded = decodePresentation(extractCompact(raw));
  const { issuer, kb, claims } = decoded;
  const p = issuer.payload;

  let rows = null;
  if (flags.verify) {
    const didDocument = await loadDidDocument(flags['did-doc'], p.iss);
    rows = verifyPresentation(decoded, didDocument, {
      issuers: flags.issuer ? String(flags.issuer).split(',').map(s => s.trim()) : undefined,
      vct: flags.vct ? String(flags.vct) : undefined,
      programId: flags['program-id'] ? String(flags['program-id']) : undefined,
      nonce: flags.nonce ? String(flags.nonce) : undefined,
      requireHolderBinding: Boolean(flags['require-holder-binding']),
    });
  }
  const verified = rows ? rows.every(r => r.ok) : null;
  const userClaims = Object.fromEntries(Object.entries(claims).filter(([key]) => !RESERVED.has(key)));

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({
      issuerHeader: issuer.header,
      issuerPayload: p,
      claims: userClaims,
      disclosed: decoded.disclosed,
      hiddenCount: decoded.hidden,
      kb: kb ? { header: kb.header, payload: kb.payload, sdHashMatches: kb.payload.sd_hash === decoded.sdHash } : null,
      checks: rows,
      verified,
    }, null, 2)}\n`);
  } else {
    const out = [];
    out.push(verified === null ? 'SD-JWT presentation (decoded only; not trusted until --verify passes)' : 'SD-JWT presentation');
    out.push('', 'Issuer JWT (signed by the issuer)');
    out.push(`  alg/kid   ${issuer.header.alg} ${issuer.header.kid ?? '(no kid)'}`);
    out.push(`  iss       ${p.iss}`, `  sub       ${p.sub} (holder DID)`, `  vct       ${p.vct}`);
    out.push(`  iat       ${time(p.iat)}`, `  exp       ${time(p.exp)}`);
    out.push(`  cnf       ${p.cnf?.jwk ? `holder key ${p.cnf.jwk.kty}/${p.cnf.jwk.crv ?? ''}` : '(none: cannot be holder-bound)'}`);
    if (p.status) out.push(`  status    ${JSON.stringify(p.status)}`);
    out.push(`  nonce     ${p.nonce} (issuer revocation nonce, not your verification nonce)`);
    out.push('', `Claims the verifier sees (${decoded.disclosed.length} disclosed, ${decoded.hidden} still hidden behind digests)`);
    const entries = Object.entries(userClaims);
    if (!entries.length) out.push('  (none)');
    for (const [key, value] of entries) out.push(`  ${key}: ${JSON.stringify(value)}  ${key in p ? '[always visible]' : '[disclosed]'}`);
    if (decoded.unmatched.length) out.push(`  ! ${decoded.unmatched.length} disclosure(s) do not match any signed digest`);
    out.push('', kb ? 'KB-JWT (signed by the holder key in cnf.jwk)' : 'KB-JWT: none (bearer presentation; pass a nonce to verifyCredential for holder binding)');
    if (kb) {
      out.push(`  typ/alg   ${kb.header.typ} ${kb.header.alg}`);
      out.push(`  nonce     ${kb.payload.nonce}`, `  aud       ${kb.payload.aud} (programId)`, `  iat       ${time(kb.payload.iat)}`);
      out.push(`  sd_hash   ${kb.payload.sd_hash === decoded.sdHash ? 'matches the disclosures' : 'DOES NOT MATCH the disclosures'}`);
    }
    if (rows) {
      out.push('', 'Checks');
      for (const r of rows) out.push(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? `  (${r.detail})` : ''}`);
      out.push('', verified ? 'Result: VERIFIED. These claims can be trusted.' : `Result: FAILED (${rows.filter(r => !r.ok).length} check(s)). Do not trust these claims.`);
    }
    out.push('', 'Disclosures are personal data. Inspect sandbox presentations only; never log production tokens.');
    process.stdout.write(`${out.join('\n')}\n`);
  }
  if (verified === false) process.exitCode = 1;
}

const invoked = process.argv[1] && path.basename(process.argv[1]) === 'sd-jwt.mjs';
if (invoked) main().catch(error => { console.error(error.message); process.exitCode = 2; });
