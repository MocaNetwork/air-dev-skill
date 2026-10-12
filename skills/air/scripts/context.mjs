#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadAir, loadPartner, needsIssuer, needsVerifier, presentId, roleOf } from './lib/partner.mjs';
import { backendEnvPath, existingPartner, hasIssuerBackend, backendInstalled, webEnvPath } from './lib/layout.mjs';
import { parseArgs, projectRoot, readText, rel, walkFiles } from './lib/project.mjs';
import { legacyIden3Keys, parseEnvFile, secretPresence } from './lib/secrets.mjs';
import { isLegacyIden3Did } from './lib/did.mjs';

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

export function collectSignals(root) {
  const partner = loadPartner(root);
  const air = loadAir(root);
  if (!partner.exists) {
    return { ok: false, code: 'NO_PARTNER_MD', root, partner, air };
  }

  const role = roleOf(partner.fields);
  const files = walkFiles(root, { exts: SOURCE_EXTS });
  const envLocal = parseEnvFile(readText(webEnvPath(root)));
  const backendEnv = parseEnvFile(readText(backendEnvPath(root)));
  const env = {
    ...parseEnvFile(readText(path.join(root, '.env'))),
    ...backendEnv,
    ...envLocal,
  };
  const secrets = secretPresence(env);

  const joined = files.map((file) => {
    try {
      return { file, text: fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') };
    } catch {
      return null;
    }
  }).filter(Boolean);

  const hasJwksRoute = joined.some(({ text, file }) =>
    /(?:well-known[\\/]|jwks)/i.test(rel(root, file)) && /export.*(?:GET|handler)|@Get/.test(text));
  const hasIssueCall = joined.some(({ text }) => /\.\s*issueCredential\s*\(/.test(text));
  const hasVerifyCall = joined.some(({ text }) => /\.\s*verifyCredential\s*\(/.test(text));
  const envSplitOk = !joined.some(({ text }) =>
    /NEXT_PUBLIC_(PARTNER_PRIVATE_KEY|SEED|API_KEY|ADMIN_API_KEY)/.test(text));
  const hasPartnerJwtRoute = joined.some(({ file, text }) => /partner-jwt/.test(file) && /export.*POST/.test(text));
  const hasPresentationCheck = joined.some(({ text }) => /\bverifyAirSdJwt\s*\(|\bSDJwtVcInstance\b/.test(text));
  const legacyIden3 = isLegacyIden3Did(partner.fields['Issuer DID'])
    || (legacyIden3Keys(backendEnv).length > 0 && !backendEnv.PARTNER_JWKS);

  return {
    ok: true,
    coverage: 'Source matches suggest implementation; they do not prove runtime readiness.',
    root,
    partner: {
      exists: true,
      role,
      partnerId: presentId(partner.fields, 'Partner ID'),
      issuerDid: presentId(partner.fields, 'Issuer DID'),
      jwksUrl: presentId(partner.fields, 'JWKS URL'),
      issuerRegistered: /^(yes|true|done)$/i.test(partner.fields['Issuer registered'] || partner.fields['Issuer activated'] || ''),
      issuerOriginPublic: /^https:\/\//.test(backendEnv.ISSUER_ORIGIN || '') && !/localhost|127\.0\.0\.1/.test(backendEnv.ISSUER_ORIGIN || ''),
      legacyIden3,
      jwksRegistered: /^(yes|true|done)$/i.test(partner.fields['JWKS registered'] || ''),
      issuerBackend: partner.fields['Issuer backend'] || '',
      authModel: partner.fields['Auth model'] || air.fields.Model || '',
      existing: existingPartner(partner.fields),
      database: partner.fields.Database || 'none',
      frontend: partner.fields.Frontend || 'none',
      issuanceTrigger: partner.fields['Issuance trigger'] || 'unknown',
    },
    air: { exists: air.exists, buildEnv: air.fields.BUILD_ENV || '' },
    scan: {
      hasJwksRoute,
      hasIssueCall,
      hasVerifyCall,
      hasPartnerJwtRoute,
      hasPresentationCheck,
      envSplitOk,
      hasIssuerBackend: hasIssuerBackend(root),
      backendInstalled: backendInstalled(root),
      hasBackendEnv: Boolean(readText(backendEnvPath(root))),
      fileCount: files.length,
    },
    secrets: {
      present: secrets.present,
      missing: secrets.missing.filter(key => needsIssuer(role) || key === 'PARTNER_PRIVATE_KEY_DER'),
    },
    needs: {
      issuer: needsIssuer(role),
      verifier: needsVerifier(role),
    },
  };
}

export function recommend(signals) {
  if (!signals.ok) return [{ cmd: '/air init', reason: 'No PARTNER.md — capture partner identity first.' }];
  const picks = [];
  const { partner, scan, needs } = signals;
  if (partner.legacyIden3) {
    return [{ cmd: '/air audit', reason: 'Iden3-era configuration (SEED or did:air) detected. The helpers target the SD-JWT issuer service and will not convert it; see https://docs.air3.com/products/identity/iden3/issuing or plan a separate did:web issuer.' }];
  }
  if (needs.issuer && !partner.partnerId && !partner.existing) {
    picks.push({ cmd: '/air init', reason: 'Issuer role but Partner ID is missing. Paste it from the Dashboard.' });
  }
  if (needs.issuer && !scan.hasIssuerBackend) {
    picks.push({ cmd: '/air issue', reason: 'Clone air-issuer-service before generating or importing keys.' });
  }
  if (needs.issuer && scan.hasIssuerBackend && !scan.backendInstalled) picks.push({ cmd: '/air issue', reason: 'Install dependencies in the existing issuer backend before configuring keys.' });
  const hasSigningKey = !signals.secrets.missing.includes('PARTNER_PRIVATE_KEY_DER');
  if (needs.issuer && scan.hasIssuerBackend && scan.backendInstalled && partner.existing && !hasSigningKey) {
    picks.push({ cmd: '/air keys --import', reason: 'Import the existing partner signing configuration.' });
  }
  if (needs.issuer && scan.hasIssuerBackend && scan.backendInstalled && !partner.existing && !hasSigningKey) {
    picks.push({ cmd: '/air keys', reason: 'Backend is cloned; generate the partner keypair and issuer API keys next.' });
  }
  if (needs.issuer && hasSigningKey && !partner.issuerDid) {
    picks.push({ cmd: '/air issuer-did', reason: partner.issuerOriginPublic
      ? 'Keys exist; derive and check the did:web issuer DID from ISSUER_ORIGIN.'
      : 'Keys exist; set ISSUER_ORIGIN to the stable public HTTPS origin, then derive the did:web issuer DID.' });
  }
  if (needs.issuer && partner.issuerDid && !scan.hasJwksRoute && partner.frontend !== 'none') {
    picks.push({ cmd: '/air issue', reason: 'No JWKS route in the repo. Emit stubs after the frontend exists.' });
  }
  if (needs.issuer && partner.issuerDid && !partner.issuerRegistered) {
    picks.push({ cmd: '/air register', reason: 'did:web issuer DID is known; issuer registration is not confirmed.' });
  }
  if (needs.issuer && partner.issuerRegistered && partner.issuanceTrigger !== 'direct' && partner.frontend !== 'none' && !scan.hasIssueCall) {
    picks.push({ cmd: '/air issue', reason: 'Issuer is registered but there is no issue call yet.' });
  }
  if (!needs.issuer && ['verifier', 'account-only'].includes(partner.role) && signals.secrets.missing.includes('PARTNER_PRIVATE_KEY_DER') && (needs.verifier || partner.authModel === 'byo')) {
    picks.push({ cmd: '/air keys', reason: 'Configure server signing keys for this app.' });
  }
  if ((needs.verifier || needs.issuer) && !partner.jwksRegistered) picks.push({ cmd: '/air register', reason: 'Public JWKS registration is not yet confirmed.' });
  if ((needs.verifier || scan.hasIssueCall) && !scan.hasVerifyCall && needs.verifier) {
    picks.push({ cmd: '/air verify', reason: 'Issue exists or role is verifier; verification is missing.' });
  }
  if (needs.verifier && scan.hasVerifyCall && !scan.hasPresentationCheck) {
    picks.push({ cmd: '/air verify', reason: 'verifyCredential results are not checked on a backend; verify the SD-JWT presentation server-side.' });
  }
  if (scan.hasIssueCall || scan.hasVerifyCall || scan.hasJwksRoute) {
    picks.push({ cmd: '/air audit then /air polish', reason: 'Code is present — run detectors, then last-mile hardening.' });
  }
  if (roleOf(signals.partner) === 'account-only') {
    picks.push({ cmd: '/air account', reason: 'Account-only role: embed AirService login.' });
  }
  if (roleOf(signals.partner) === 'agentic') {
    picks.push({ cmd: '/air agent', reason: 'Install air-agentic-wallet-skill; do not call Privy.' });
  }
  const seen = new Set();
  return picks.filter((p) => {
    if (seen.has(p.cmd)) return false;
    seen.add(p.cmd);
    return true;
  }).slice(0, 3);
}

function main() {
  const flags = parseArgs();
  const root = path.resolve(flags.project || projectRoot());
  const signals = collectSignals(root);
  const recs = recommend(signals);

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ signals, recommendations: recs }, null, 2)}\n`);
    process.exit(signals.ok ? 0 : 2);
  }

  if (!signals.ok) {
    process.stdout.write(`NO_PARTNER_MD: no PARTNER.md under ${root}\n`);
    process.stdout.write('Setup inputs are missing; use /air init for commands that need partner context.\n');
    process.exit(2);
  }

  process.stdout.write(`# AIR context\n\n`);
  process.stdout.write(`Root: ${root}\n`);
  process.stdout.write(`Role: ${signals.partner.role || '(unset)'}\n`);
  process.stdout.write(`Existing partner: ${signals.partner.existing ? 'yes' : 'no'}\n`);
  process.stdout.write(`Partner ID: ${signals.partner.partnerId ? 'set' : 'missing'}\n`);
  process.stdout.write(`Issuer DID: ${signals.partner.issuerDid ? 'set' : 'missing'}\n`);
  process.stdout.write(`Backend: ${signals.scan.hasIssuerBackend}\n`);
  process.stdout.write(`JWKS route: ${signals.scan.hasJwksRoute}\n`);
  process.stdout.write(`Issue call: ${signals.scan.hasIssueCall}\n`);
  process.stdout.write(`Verify call: ${signals.scan.hasVerifyCall}\n`);
  process.stdout.write(`Env split ok: ${signals.scan.envSplitOk}\n`);
  process.stdout.write(`Secrets present: ${signals.secrets.present.join(', ') || '(none)'}\n`);
  process.stdout.write(`\n## Recommended next\n`);
  for (const rec of recs) {
    process.stdout.write(`- ${rec.cmd} — ${rec.reason}\n`);
  }
}

const invoked = process.argv[1] && path.basename(process.argv[1]) === 'context.mjs';
if (invoked) main();
