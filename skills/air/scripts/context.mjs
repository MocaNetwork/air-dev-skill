#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadAir, loadPartner, needsIssuer, needsVerifier, presentId, roleOf } from './lib/partner.mjs';
import { backendEnvPath, existingPartner, hasIssuerBackend, backendInstalled, webEnvPath } from './lib/layout.mjs';
import { parseArgs, projectRoot, readText, rel, walkFiles } from './lib/project.mjs';
import { parseEnvFile, secretPresence } from './lib/secrets.mjs';

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
  const env = {
    ...parseEnvFile(readText(path.join(root, '.env'))),
    ...parseEnvFile(readText(backendEnvPath(root))),
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
      issuerActivated: /^(yes|true|done)$/i.test(partner.fields['Issuer activated'] || ''),
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
  if (needs.issuer && !partner.partnerId && !partner.existing) {
    picks.push({ cmd: '/air init', reason: 'Issuer role but Partner ID is missing. Paste it from the Dashboard.' });
  }
  if (needs.issuer && !scan.hasIssuerBackend) {
    picks.push({ cmd: '/air issue', reason: 'Clone air-issuer-service before generating or importing keys.' });
  }
  if (needs.issuer && scan.hasIssuerBackend && !scan.backendInstalled) picks.push({ cmd: '/air issue', reason: 'Install dependencies in the existing issuer backend before configuring keys.' });
  if (needs.issuer && scan.hasIssuerBackend && scan.backendInstalled && partner.existing && signals.secrets.missing.includes('SEED')) {
    picks.push({ cmd: '/air keys --import', reason: 'Import the existing issuer configuration.' });
  }
  if (needs.issuer && scan.hasIssuerBackend && scan.backendInstalled && !partner.existing && signals.secrets.missing.includes('SEED')) {
    picks.push({ cmd: '/air keys', reason: 'Backend is cloned; generate the seed and partner keypair next.' });
  }
  if (needs.issuer && !signals.secrets.missing.includes('SEED') && !partner.issuerDid) {
    picks.push({ cmd: '/air issuer-did', reason: 'Keys exist; extract the issuer DID from the backend repl.' });
  }
  if (needs.issuer && partner.issuerDid && !scan.hasJwksRoute && partner.frontend !== 'none') {
    picks.push({ cmd: '/air issue', reason: 'No JWKS route in the repo. Emit stubs after the frontend exists.' });
  }
  if (needs.issuer && partner.issuerDid && !partner.issuerActivated) {
    picks.push({ cmd: '/air register', reason: 'DID is known; issuer is not marked activated.' });
  }
  if (needs.issuer && partner.issuerActivated && partner.issuanceTrigger !== 'direct' && partner.frontend !== 'none' && !scan.hasIssueCall) {
    picks.push({ cmd: '/air issue', reason: 'Issuer is activated but there is no issue call yet.' });
  }
  if (!needs.issuer && ['verifier', 'account-only'].includes(partner.role) && signals.secrets.missing.includes('PARTNER_PRIVATE_KEY_DER') && (needs.verifier || partner.authModel === 'byo')) {
    picks.push({ cmd: '/air keys', reason: 'Configure server signing keys for this app.' });
  }
  if ((needs.verifier || needs.issuer) && !partner.jwksRegistered) picks.push({ cmd: '/air register', reason: 'Public JWKS registration is not yet confirmed.' });
  if ((needs.verifier || scan.hasIssueCall) && !scan.hasVerifyCall && needs.verifier) {
    picks.push({ cmd: '/air verify', reason: 'Issue exists or role is verifier; verification is missing.' });
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
