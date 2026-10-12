#!/usr/bin/env node
import path from 'node:path';
import { createPublicKey } from 'node:crypto';
import { loadAir, loadPartner } from './lib/partner.mjs';
import { backendEnvPath, webEnvPath } from './lib/layout.mjs';
import { parseArgs, projectRoot, readText, rel, walkFiles } from './lib/project.mjs';
import { algFromDer, legacyIden3Keys, parseEnvFile, partnerJwks } from './lib/secrets.mjs';
import { deriveIssuerDid, isLegacyIden3Did } from './lib/did.mjs';
import { ISSUER_ENDPOINTS } from './lib/endpoints.mjs';

export function detect(root) {
  const findings = [];
  const add = (severity, id, file, message) => findings.push({ severity, id, file, message });
  const partner = loadPartner(root), air = loadAir(root);
  const files = walkFiles(root, { exts: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] });
  const sources = files.map(file => ({ file: rel(root, file), text: readText(file) || '' }));
  const envPaths = new Set([path.join(root, '.env'), backendEnvPath(root), webEnvPath(root)]);
  for (const file of envPaths) {
    const env = parseEnvFile(readText(file));
    const name = rel(root, file);
    for (const [key, value] of Object.entries(env)) {
      if (value && /^NEXT_PUBLIC_(PARTNER_PRIVATE_KEY|SEED|API_KEY|ADMIN_API_KEY)/.test(key)) add('P0', 'public-secret-prefix', name, `Secret setting ${key} is browser-visible`);
    }
    if (env.ISSUER_ORIGIN && !env.ISSUER_ORIGIN.startsWith('https://')) add('P1', 'issuer-origin-not-https', name, 'Issuer origin is local or HTTP; use public HTTPS before issuing real credentials');
    if (env.NODE_ENV && env.NEXT_PUBLIC_BUILD_ENV && env.NODE_ENV.toLowerCase() !== env.NEXT_PUBLIC_BUILD_ENV.toLowerCase()) add('P0', 'network-mismatch', name, 'Backend and web environment settings differ');
    if (env.PARTNER_PRIVATE_KEY_DER && env.PARTNER_PRIVATE_KEY_ALG) {
      try {
        if (algFromDer(env.PARTNER_PRIVATE_KEY_DER) !== env.PARTNER_PRIVATE_KEY_ALG) add('P0', 'signing-alg-mismatch', name, 'PARTNER_PRIVATE_KEY_ALG does not match the private key type');
      } catch { add('P0', 'invalid-signing-key', name, 'PARTNER_PRIVATE_KEY_DER is not a supported PKCS#8 RSA or P-256 key'); }
    }
    if (legacyIden3Keys(env).length && !env.PARTNER_JWKS) add('P1', 'legacy-iden3-config', name, 'Iden3-era settings (SEED) found; the SD-JWT issuer service ignores them and uses did:web from ISSUER_ORIGIN');
    if (env.ISSUER_ORIGIN && partner.fields['Issuer DID'] && !isLegacyIden3Did(partner.fields['Issuer DID'])) {
      try {
        if (deriveIssuerDid(env.ISSUER_ORIGIN) !== partner.fields['Issuer DID'].trim()) add('P0', 'issuer-did-origin-mismatch', name, 'ISSUER_ORIGIN host does not match the recorded did:web Issuer DID; changing the host changes issuer identity');
      } catch { add('P0', 'issuer-origin-invalid', name, 'ISSUER_ORIGIN is not a valid URL'); }
    }
    if (env.ISSUER_ORIGIN) {
      const base = `${env.ISSUER_ORIGIN.trim().replace(/\/+$/, '')}/`;
      for (const { label } of ISSUER_ENDPOINTS) {
        const recorded = partner.fields[label];
        if (recorded && /^https?:\/\//.test(recorded) && !recorded.startsWith(base)) add('P0', 'issuer-endpoint-mismatch', 'PARTNER.md', `${label} is not under ISSUER_ORIGIN; update it here and in Dashboard → Issuer → Settings`);
      }
    }
    if (partnerJwks(env)) {
      try {
        const document = JSON.parse(partnerJwks(env));
        if (!Array.isArray(document.keys) || !document.keys.length) throw new Error('Empty keys');
        for (const key of document.keys) {
          if (['d', 'p', 'q', 'dp', 'dq', 'qi'].some(field => field in key)) throw new Error('Private material');
          createPublicKey({ key, format: 'jwk' });
        }
        if (env.PARTNER_PRIVATE_KEY_KID && !document.keys.some(key => key.kid === env.PARTNER_PRIVATE_KEY_KID)) add('P0', 'kid-mismatch', name, 'Configured signing kid is absent from JWKS');
      } catch { add('P0', 'invalid-jwks', name, 'JWKS is invalid or contains private key material'); }
    }
  }
  const jwksUrl = partner.fields['JWKS URL'];
  if (jwksUrl) {
    try {
      const url = new URL(jwksUrl);
      if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Not public HTTPS');
    } catch { add('P0', 'jwks-url-field', 'PARTNER.md', 'Recorded JWKS URL is not a valid public HTTPS URL'); }
  }
  if (/SANDBOX/i.test(air.fields.BUILD_ENV || '') && /mainnet/i.test(air.fields.credentialNetwork || '')) add('P0', 'air-md-network', 'AIR.md', 'AIR.md pairs SANDBOX with mainnet');
  if (isLegacyIden3Did(partner.fields['Issuer DID'])) add('P1', 'legacy-iden3-did', 'PARTNER.md', 'Issuer DID is an Iden3 did:air identity; SD-JWT issuers use did:web. Do not replace a registered identity without a migration plan');
  // Source matches are review observations, not proof of runtime failure. Do not
  // correlate unrelated headers or identifiers across an entire file.
  const jwksKids = [], jwtKids = [];
  for (const { file, text } of sources) {
    const code = text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/process\.env\.NEXT_PUBLIC_(PARTNER_PRIVATE_KEY|SEED|API_KEY|ADMIN_API_KEY)/.test(code)) add('P1', 'public-secret-prefix', file, 'Review browser-visible secret reference');
    const requests = code.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{([\s\S]*?)\}\s*\)/g);
    for (const [, url, options] of requests) {
      if (/api\.(sandbox\.)?mocachain\.org/.test(url) && /x-api-key/.test(options)) add('P2', 'wrong-header-air-api', file, 'Review literal Moca API request using x-api-key; confirm the endpoint contract');
      if (/\/(available-vc|issue-vc)(?:[/?]|$)/.test(url) && !/\/issuer\//.test(url) && /x-partner-auth/.test(options)) add('P2', 'wrong-header-issuer', file, 'Review issuer endpoint request using x-partner-auth instead of issuer API authentication');
    }
    const subject = code.match(/credentialSubject\s*:\s*\{([^}]+)\}/)?.[1];
    if (subject && /\b(dob|dateOfBirth|ssn|fullName|email)\s*:/.test(subject)) add('P2', 'raw-pii-claim', file, 'Review whether the credential needs these personal fields or can use derived claims');
    const signsPartnerJwt = /(?:new\s+(?:\w+\.)?SignJWT\(|\bjwt\.sign\(|\bsign\()\s*\{[^}]*\bpartnerId\b/.test(code);
    if (signsPartnerJwt && /issueCredential\s*\(|initialize-user|dstorage\/vcs/.test(code) && !/scope['"]?\s*[:,]\s*['"]issue['"]/.test(code)) add('P2', 'missing-issue-scope', file, 'Partner JWT for issuance has no scope "issue"; issueCredential and direct issuance tokens need it');
    if (/setExpirationTime\(\s*60\s*\*\s*60\s*\)/.test(code)) add('P2', 'jwt-exp-too-long', file, 'Review expiry expression; setExpirationTime uses an absolute NumericDate for numbers');
    for (const [, args] of code.matchAll(/\.\s*verifyCredential\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      if (!/\bnonce\b/.test(args)) add('P2', 'verify-without-nonce', file, 'verifyCredential has no nonce; the SD-JWT presentation is a replayable bearer token without a key-binding JWT');
      if (/\boffchain\s*:/.test(args)) add('P2', 'removed-offchain-option', file, 'offchain was removed from verifyCredential; the verification program sets the mode');
    }
    if (/\.\s*(zkProofs|disclosedData|transactionHash)\b/.test(code) && /verifyCredential/.test(code)) add('P2', 'deprecated-verification-fields', file, 'zkProofs, disclosedData and transactionHash are no longer populated; read verifiablePresentation and verify it on the backend');
    const issueArgs = code.match(/\.\s*issueCredential\s*\(\s*\{([\s\S]*?)\}\s*\)/)?.[1];
    if (issueArgs && /credentialSubject\s*:\s*\{\s*[^}\s]/.test(issueArgs)) add('P2', 'client-credential-subject', file, 'Pass {} as credentialSubject; the issuer backend supplies authoritative claims');
    if (/enableCors\s*\(\s*\{[\s\S]*?origin\s*:/.test(code) && !/air3\.com/.test(code)) add('P2', 'cors-excludes-air', file, 'Issuer CORS allowlist must include *.air3.com or the holder claim flow breaks');
    const literalKid = code.match(/kid:\s*['"]([^'"]+)['"]/)?.[1];
    if (literalKid && /jwks/i.test(file)) jwksKids.push(literalKid);
    if (literalKid && /setProtectedHeader/.test(code)) jwtKids.push({ file, kid: literalKid });
  }
  for (const jwt of jwtKids) if (jwksKids.length && !jwksKids.includes(jwt.kid)) add('P2', 'kid-mismatch', jwt.file, 'Literal signing kid differs from discovered JWKS literals; confirm which routes are active');
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
}

function main() {
  const flags = parseArgs(), root = path.resolve(flags.project || flags._[0] || projectRoot());
  const findings = detect(root), counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const finding of findings) counts[finding.severity]++;
  const report = { ok: counts.P0 === 0, coverage: 'Static configuration checks and source observations only; runtime readiness and registration are not verified.', counts, findings };
  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else { console.log(report.coverage); for (const finding of findings) console.log(`${finding.severity} ${finding.id} ${finding.file}\n  ${finding.message}`); }
  process.exitCode = counts.P0 ? 1 : 0;
}
if (process.argv[1] && path.basename(process.argv[1]) === 'detect.mjs') main();
