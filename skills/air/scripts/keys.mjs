#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadPartner, needsIssuer, roleOf, updatePartnerFields } from './lib/partner.mjs';
import { backendEnvPath, backendInstalled, databaseChoice, existingPartner, hasIssuerBackend, wantsFrontend, webEnvPath } from './lib/layout.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { ensureGitignore, parseArgs, projectRoot, readText, writeText } from './lib/project.mjs';
import { generateSecrets, importPartnerEnv, legacyIden3Keys, parseEnvFile, renderBackendEnv, upsertEnv, UUID_RE } from './lib/secrets.mjs';

const LEGACY_HELP = 'Iden3 credentials are enabled by the AIR team: https://docs.air3.com/products/identity/iden3/issuing';

function main() {
  const flags = parseArgs();
  if (flags.help) {
    console.log('keys --env sandbox [--import <env>] [--project <dir>]\nIssuer: backend must be installed first. Verifier/account: signing keys only. Existing keys are preserved.');
    return;
  }
  const root = path.resolve(flags.project || projectRoot());
  const partner = loadPartner(root);
  if (!partner.exists) throw new Error('Run /air init to record the project role and paths.');
  assertSandbox(root, flags.env);
  if (!flags.env) throw new Error('--env sandbox is required.');
  const issuer = needsIssuer(roleOf(partner.fields));
  if (!['issuer', 'both', 'verifier', 'account-only'].includes(roleOf(partner.fields))) throw new Error('Use the wallet skill for agentic keys.');
  if (issuer && (!hasIssuerBackend(root) || !backendInstalled(root))) throw new Error('Clone and install the issuer backend before generating or importing its keys.');
  const target = issuer ? backendEnvPath(root) : webEnvPath(root);
  const existing = {
    ...parseEnvFile(readText(path.join(root, '.env'))),
    ...parseEnvFile(readText(target)),
  };
  assertSandbox(root, 'sandbox', { ...existing, NODE_ENV: issuer ? existing.NODE_ENV : undefined });
  const source = flags.import ? parseEnvFile(readText(path.resolve(root, flags.import))) : null;
  if (source) assertSandbox(root, 'sandbox', source);
  if (existingPartner(partner.fields) && !source) throw new Error('Import the existing partner signing configuration with --import <env>.');
  if (issuer && !source && legacyIden3Keys(existing).length && !existing.PARTNER_JWKS) {
    throw new Error(`This backend configuration carries Iden3 settings (${legacyIden3Keys(existing).join(', ')}). The helpers configure the SD-JWT issuer service only and did not change it. ${LEGACY_HELP}`);
  }
  const registered = /^(yes|true|done)$/i.test(partner.fields['Issuer registered'] || partner.fields['Issuer activated'] || '') || Boolean(partner.fields['Issuer DID']);
  if (!source && (existing.PARTNER_PRIVATE_KEY_DER || registered)) {
    throw new Error('Identity or signing keys already exist. They were preserved. Use --import with the same keys to synchronize configuration; key rotation is not supported.');
  }
  const partnerId = String(flags['partner-id'] || source?.PARTNER_ID || partner.fields['Partner ID'] || '').trim();
  if (!UUID_RE.test(partnerId)) throw new Error('Partner ID must be the Dashboard UUID.');
  if ((partner.fields['Partner ID'] && partner.fields['Partner ID'] !== partnerId)
    || (source?.PARTNER_ID && source.PARTNER_ID !== partnerId)
    || (existing.PARTNER_ID && existing.PARTNER_ID !== partnerId)) throw new Error('Partner ID mismatch; use a separate project for another partner.');
  const secrets = source ? importPartnerEnv(source, { issuer }) : generateSecrets({ kid: partnerId, issuer });
  for (const key of ['PARTNER_PRIVATE_KEY_DER', 'PARTNER_PRIVATE_KEY_KID', 'API_KEY', 'ADMIN_API_KEY']) {
    if (existing[key] && secrets[key] && existing[key] !== secrets[key]) throw new Error(`Existing ${key} differs from import; rotation is not supported.`);
  }
  const signing = {
    PARTNER_ID: partnerId,
    PARTNER_PRIVATE_KEY_KID: secrets.PARTNER_PRIVATE_KEY_KID,
    PARTNER_PRIVATE_KEY_DER: secrets.PARTNER_PRIVATE_KEY_DER,
    PARTNER_JWKS: secrets.PARTNER_JWKS,
  };
  const db = databaseChoice(partner.fields);
  const databaseUrl = db === 'none' ? '' : flags['database-url'] || source?.DATABASE_URL || existing.DATABASE_URL || (db === 'docker' ? 'postgres://postgres:postgres@127.0.0.1/issuer-backend' : '');
  if (issuer && db === 'external' && !databaseUrl) throw new Error('External database selected; supply --database-url or import DATABASE_URL.');
  const backendValues = { NODE_ENV: 'sandbox', DATABASE_URL: databaseUrl, ISSUER_ORIGIN: source?.ISSUER_ORIGIN || existing.ISSUER_ORIGIN || 'http://localhost:3000', ...signing, PARTNER_PRIVATE_KEY_ALG: secrets.PARTNER_PRIVATE_KEY_ALG, API_KEY: secrets.API_KEY, ADMIN_API_KEY: secrets.ADMIN_API_KEY };
  const webValues = { ...signing, NEXT_PUBLIC_PARTNER_ID: partnerId, NEXT_PUBLIC_BUILD_ENV: 'sandbox' };
  const writes = new Map();
  if (issuer) writes.set(target, readText(target) ? upsertEnv(readText(target), backendValues) : renderBackendEnv(backendValues));
  if (!issuer || wantsFrontend(partner.fields)) {
    const webFile = webEnvPath(root);
    const current = parseEnvFile(readText(webFile));
    assertSandbox(root, 'sandbox', { ...current, NODE_ENV: undefined });
    for (const key of ['PARTNER_ID', 'PARTNER_PRIVATE_KEY_DER', 'PARTNER_PRIVATE_KEY_KID']) {
      if (current[key] && current[key] !== webValues[key]) throw new Error(`Web ${key} differs; no files changed.`);
    }
    writes.set(webFile, upsertEnv(writes.get(webFile) || readText(webFile) || '', webValues));
  }
  ensureGitignore(root, ['.env', '.env.local', '.env.*.local', ...[...writes.keys()].map(file => path.relative(root, file))]);
  for (const [file, contents] of writes) { writeText(file, contents); fs.chmodSync(file, 0o600); }
  updatePartnerFields(root, { 'Partner ID': partnerId, kid: signing.PARTNER_PRIVATE_KEY_KID, 'Signing algorithm': secrets.PARTNER_PRIVATE_KEY_ALG });
  console.log(`Wrote ${issuer ? 'issuer and signing' : 'signing'} configuration to:\n${[...writes.keys()].join('\n')}`);
  if (secrets.ignoredLegacy?.length) console.log(`Ignored Iden3 settings in the import (${secrets.ignoredLegacy.join(', ')}); the SD-JWT issuer service does not use them. ${LEGACY_HELP}`);
  if (issuer) console.log('Next: run configured database migrations if needed, set ISSUER_ORIGIN to the stable public HTTPS origin (it defines the did:web issuer DID), start the backend, then /air issuer-did.');
  if (issuer && !wantsFrontend(partner.fields)) console.log('The issuer service publishes no JWKS route. Host PARTNER_JWKS at a public HTTPS URL for Partner JWT validation; see /air register.');
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
