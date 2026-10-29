#!/usr/bin/env node
import path from 'node:path';
import { loadPartner, updatePartnerFields } from './lib/partner.mjs';
import { ensureGitignore, parseArgs, projectRoot, readText, writeText } from './lib/project.mjs';
import { webEnvPath, wantsFrontend, backendEnvPath } from './lib/layout.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { UUID_RE, parseEnvFile, upsertEnv } from './lib/secrets.mjs';

const ENVS = ['sandbox'];
const PHASE2 = new Set(['createPartner', 'createIssuerDid', 'createApiKeys', 'createProgram', 'registerJwksUrl', 'registerIssuer', 'activateIssuer']);

function usage(code = 2) {
  process.stderr.write(`Usage: node provision.mjs --env sandbox <action> [options]

v1 actions:
  write-ids              update PARTNER.md IDs and public env (never secrets)

Phase 2 stubs (throw):
  createPartner createIssuerDid createApiKeys createProgram registerJwksUrl registerIssuer

Options:
  --partner-id --issuer-did --verifier-did --jwks-url
  --issue-program-id --verify-program-id --schema-id
  --vct <credential type>          registered SD-JWT credential type
  --trusted-issuer <did:web:...>   issuer accepted by the backend presentation check
  --did-host-saved yes|no          Dashboard Issuer → Settings → did:web Host saved (every role;
                                   no schema or program can be created before it)
  --issuer-registered yes|no       (alias: --activated) Dashboard Issuer → Settings saved; yes implies --did-host-saved yes
  --jwks-registered yes|no --domain-whitelisted yes|no
  --project <dir>
`);
  process.exit(code);
}

function phase2Stub(action) {
  throw new Error(`${action} is not implemented. Use the current Dashboard workflow in /air register; no remote request was made.`);
}

function writeIds(root, envName, flags) {
  const partner = loadPartner(root);
  if (!partner.exists) {
    process.stderr.write('NO_PARTNER_MD: run init first.\n');
    process.exit(2);
  }

  const envFile = webEnvPath(root);
  assertSandbox(root, envName, { ...parseEnvFile(readText(envFile)), NODE_ENV: undefined });
  assertSandbox(root, envName, parseEnvFile(readText(backendEnvPath(root))));
  if (flags['partner-id'] && !UUID_RE.test(flags['partner-id'])) throw new Error('Partner ID must be the Dashboard UUID.');
  if (flags['partner-id'] && partner.fields['Partner ID'] && flags['partner-id'] !== partner.fields['Partner ID']) throw new Error('Partner identity cannot be replaced; use a separate project.');
  if (flags['issuer-did'] && partner.fields['Issuer DID'] && flags['issuer-did'] !== partner.fields['Issuer DID']) throw new Error('Issuer DID cannot be replaced; investigate the identity mismatch.');
  for (const flag of ['issuer-did', 'trusted-issuer']) {
    if (flags[flag] && !/^did:web:[^\s]+$/.test(flags[flag])) throw new Error(`--${flag} must be a did:web DID. Iden3 (did:air) issuers are configured with the AIR team.`);
  }
  if (flags['jwks-url']) {
    const url = new URL(flags['jwks-url']);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('JWKS URL must use public HTTPS.');
  }
  const updates = {};
  if (flags['partner-id']) updates['Partner ID'] = flags['partner-id'];
  if (flags['issuer-did']) updates['Issuer DID'] = flags['issuer-did'];
  if (flags['verifier-did']) updates['Verifier DID'] = flags['verifier-did'];
  if (flags['jwks-url']) updates['JWKS URL'] = flags['jwks-url'];
  if (flags['issue-program-id']) updates['Issuance program IDs'] = flags['issue-program-id'];
  if (flags['verify-program-id']) updates['Verification program IDs'] = flags['verify-program-id'];
  if (flags['schema-id']) updates['Schema IDs'] = flags['schema-id'];
  if (flags.vct) updates['Credential types (vct)'] = flags.vct;
  if (flags['trusted-issuer']) updates['Trusted issuers'] = flags['trusted-issuer'];
  if (flags.activated && !flags['issuer-registered']) flags['issuer-registered'] = flags.activated;
  if (flags['issuer-registered'] === 'yes' && !flags['did-host-saved']) flags['did-host-saved'] = 'yes';
  for (const [flag, label] of [['did-host-saved', 'DID host saved'], ['issuer-registered', 'Issuer registered'], ['jwks-registered', 'JWKS registered'], ['domain-whitelisted', 'Domain whitelisted']]) {
    if (['yes', 'no'].includes(flags[flag])) updates[label] = flags[flag];
  }

  // Never overwrite a partner ID the user changed in an env file: stop and name the mismatch.
  const recordedPartner = updates['Partner ID'] || partner.fields['Partner ID'];
  if (recordedPartner) {
    const sources = [
      [path.relative(root, envFile), parseEnvFile(readText(envFile)), ['PARTNER_ID', 'NEXT_PUBLIC_PARTNER_ID']],
      [path.relative(root, backendEnvPath(root)), parseEnvFile(readText(backendEnvPath(root))), ['PARTNER_ID']],
    ];
    const mismatches = sources.flatMap(([file, env, keys]) => keys
      .filter(key => env[key] && env[key] !== recordedPartner)
      .map(key => `${file} ${key}=${env[key]}`));
    if (mismatches.length) {
      throw new Error(`Partner ID mismatch: PARTNER.md has ${recordedPartner}, but\n  ${mismatches.join('\n  ')}\nNothing was written. If the partner changed, set the same Partner ID in PARTNER.md and every env file, then rerun; otherwise restore the env files.`);
    }
  }

  if (Object.keys(updates).length) updatePartnerFields(root, updates);

  const publicEnv = {};
  const after = loadPartner(root).fields;
  if (after['Partner ID']) {
    publicEnv.NEXT_PUBLIC_PARTNER_ID = after['Partner ID'];
    publicEnv.PARTNER_ID = after['Partner ID'];

  }
  if (after['Issuer DID']) publicEnv.NEXT_PUBLIC_ISSUER_DID = after['Issuer DID'];
  if (after['Issuance program IDs']) publicEnv.NEXT_PUBLIC_ISSUE_PROGRAM_ID = after['Issuance program IDs'];
  if (after['Verification program IDs']) {
    publicEnv.NEXT_PUBLIC_VERIFY_PROGRAM_ID = after['Verification program IDs'];
    publicEnv.AIR_VERIFY_PROGRAM_ID = after['Verification program IDs'];
  }
  // Server-side inputs of the SD-JWT presentation check. Public identifiers, not secrets.
  if (flags['trusted-issuer']) publicEnv.AIR_TRUSTED_ISSUERS = after['Trusted issuers'];
  if (flags.vct) publicEnv.AIR_EXPECTED_VCT = after['Credential types (vct)'];
  publicEnv.NEXT_PUBLIC_BUILD_ENV = 'sandbox';

  ensureGitignore(root, ['.env', '.env.local']);
  const wroteEnv = wantsFrontend(partner.fields) || Boolean(readText(envFile));
  if (wroteEnv) writeText(envFile, upsertEnv(readText(envFile) ?? '', publicEnv));

  process.stdout.write(`Updated PARTNER.md identity and registration fields (${envName}). Secrets were not written.\n`);
  if (wroteEnv) process.stdout.write(`Public env names updated in ${envFile}\n`);
}

function main() {
  const flags = parseArgs();
  if (flags.help) usage(0);
  const envName = String(flags.env || '').toLowerCase();
  const action = String(flags._[0] || flags.action || '');
  if (!ENVS.includes(envName)) throw new Error('Automated provisioning supports --env sandbox only. Production requires a separate integration.');
  if (!action) usage(2);

  if (PHASE2.has(action)) phase2Stub(action, envName);

  const root = path.resolve(flags.project || projectRoot());
  if (action === 'write-ids') {
    writeIds(root, envName, flags);
    return;
  }
  usage(2);
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
