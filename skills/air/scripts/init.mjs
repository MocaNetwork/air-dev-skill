#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { airPath, partnerPath, renderAirTemplate, renderPartnerTemplate } from './lib/partner.mjs';
import { ASSETS, parseArgs, projectRoot, writeText, readText, ensureGitignore } from './lib/project.mjs';
import { webDir, backendDir } from './lib/layout.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { UUID_RE, upsertEnv, parseEnvFile } from './lib/secrets.mjs';

const ROLES = ['issuer', 'verifier', 'both', 'account-only', 'agentic'];
const DBS = ['docker', 'external', 'none'];
const FRONTENDS = ['none', 'next', 'existing'];

const ISSUANCE_BY_ROLE = {
  issuer: 'issueCredential + air-issuer-service',
  both: 'issueCredential + air-issuer-service',
  verifier: 'none',
  'account-only': 'none',
  agentic: 'none',
};

const VERIFY_BY_ROLE = {
  issuer: 'none yet',
  both: 'verifyCredential',
  verifier: 'verifyCredential',
  'account-only': 'none',
  agentic: 'verify-by-agent (wallet skill)',
};

function usage(code = 2) {
  process.stderr.write(`Usage: node init.mjs --role <${ROLES.join('|')}> [options]

Options:
  --partner-id <uuid>      required unless --existing
  --existing               partner already has SEED / keys / DID
  --auth air-login|byo     default: air-login
  --vertical <name>        loyalty|gaming|fintech|events|ads|agents|other
  --custom-auth            BYO auth (issuer/both only)
  --db docker|external|none
  --database-url <url>     required when --db external
  --frontend none|next|existing
  --issuance sdk|direct|both  issuer trigger (default: sdk)
  --backend-dir <dir>      existing or planned issuer directory
  --web-dir <dir>          existing or planned web directory
  --sdk-version <ver>      installed version, if known
  --force                  overwrite existing PARTNER.md / AIR.md
  --project <dir>
`);
  process.exit(code);
}

function main() {
  const flags = parseArgs();
  if (flags.help) usage(0);
  const role = String(flags.role || '').toLowerCase();
  const existing = Boolean(flags.existing);
  const partnerId = String(flags['partner-id'] || flags.partnerId || '').trim();
  if (!ROLES.includes(role)) usage(2);
  if (!existing && !partnerId) usage(2);
  if (partnerId && !UUID_RE.test(partnerId)) {
    process.stderr.write('Partner ID must be the UUID from Dashboard → Account → General.\n');
    process.exit(2);
  }

  const db = String(flags.db || 'none').toLowerCase();
  if (!DBS.includes(db)) usage(2);
  if (db === 'external' && !flags['database-url']) {
    process.stderr.write('--database-url is required when --db external.\n');
    process.exit(2);
  }

  if (!['issuer', 'both'].includes(role) && db !== 'none') throw new Error('Database setup applies to issuer roles only.');
  const frontend = String(flags.frontend || 'none').toLowerCase();
  if (!FRONTENDS.includes(frontend)) usage(2);

  const root = path.resolve(flags.project || projectRoot());
  const rootEnv = parseEnvFile(readText(path.join(root, '.env')));
  assertSandbox(root, flags.env || 'sandbox', { ...rootEnv, NODE_ENV: ['issuer', 'both'].includes(role) ? rootEnv.NODE_ENV : undefined });
  if (!['issuer', 'both'].includes(role) && flags.issuance) throw new Error('--issuance applies to issuer roles only.');
  if (flags.auth && !['air-login', 'byo'].includes(flags.auth)) usage(2);
  const issuer = role === 'issuer' || role === 'both';
  const issuance = issuer ? String(flags.issuance || 'sdk') : 'none';
  if (issuer && !['sdk', 'direct', 'both'].includes(issuance)) usage(2);
  const backend = issuer ? path.relative(root, backendDir(root, flags['backend-dir'])) || '.' : 'none';
  const detectedWeb = webDir(root);
  if (frontend === 'existing' && !flags['web-dir'] && !detectedWeb) {
    throw new Error('Set --web-dir to the existing app directory.');
  }
  const web = flags['web-dir'] || (frontend === 'next' ? 'apps/web' : frontend === 'existing' ? path.relative(root, detectedWeb) || '.' : 'none');
  const force = Boolean(flags.force);
  const authModel = flags['custom-auth'] || flags.auth === 'byo' ? 'byo' : 'air-login';
  const vertical = flags.vertical || 'unspecified';
  const customAuth = authModel === 'byo' ? 'yes' : 'no';

  const partnerFile = partnerPath(root);
  const airFile = airPath(root);
  if (!force && (fs.existsSync(partnerFile) || fs.existsSync(airFile))) {
    process.stderr.write('PARTNER.md or AIR.md already exists. Pass --force to overwrite.\n');
    process.exit(2);
  }

  const issuerBackend = role === 'issuer' || role === 'both' ? 'air-issuer-service' : 'none';
  const notes = [
    'Init wrote sandbox defaults. Production is a separate partner / DID / program set.',
    existing ? 'Existing partner: import current signing configuration; issuer roles also preserve the issuer SEED.' : '',
    db === 'external' ? 'External database connection is stored in the gitignored root .env for the keys step.' : '',
  ].filter(Boolean).join(' ');

  const partner = renderPartnerTemplate({
    partnerId,
    issuerDid: '',
    verifierDid: '',
    role,
    existingPartner: existing ? 'yes' : 'no',
    authModel,
    vertical,
    networks: 'sandbox-only',
    customAuth,
    database: db,
    frontend,
    backendDirectory: backend,
    webDirectory: web,
    issuanceTrigger: issuance,
    jwksUrl: '',
    signingAlg: 'ES256',
    kid: partnerId,
    issuerBackend,
    schemaIds: '',
    issueProgramIds: '',
    verifyProgramIds: '',
    issuerActivated: 'no',
    jwksRegistered: 'no',
    domainWhitelisted: 'no',
    notes,
  });

  const air = renderAirTemplate({
    sdkVersion: flags['sdk-version'] || 'unknown — inspect installed package before coding',
    buildEnv: 'SANDBOX',
    credentialNetwork: 'testnet',
    authModel,
    issuancePath: issuer ? `${issuance} trigger; issuer backend authorizes, creates, signs, encrypts and stores credentials` : ISSUANCE_BY_ROLE[role],
    verificationPath: VERIFY_BY_ROLE[role],
    paymaster: 'unset — record if the app sponsors gas',
  });

  writeText(partnerFile, partner);
  writeText(airFile, air);
  const exampleFile = path.join(root, '.env.example');
  const createdExample = !fs.existsSync(exampleFile);
  if (createdExample) writeText(exampleFile, fs.readFileSync(path.join(ASSETS, 'env.example'), 'utf8'));
  if (db === 'external') {
    const envFile = path.join(root, '.env');
    ensureGitignore(root, ['.env', '.env.local']);
    writeText(envFile, upsertEnv(readText(envFile) || '', { DATABASE_URL: flags['database-url'] }));
    fs.chmodSync(envFile, 0o600);
  }

  process.stdout.write(`Wrote ${partnerFile}\n`);
  process.stdout.write(`Wrote ${airFile}\n`);
  process.stdout.write(`${createdExample ? 'Wrote' : 'Preserved'} ${exampleFile}\n`);
  process.stdout.write(`Existing partner: ${existing ? 'yes' : 'no'}\n`);
  process.stdout.write(`Database: ${db}\n`);
  process.stdout.write(`Frontend: ${frontend}\n`);

  if (role === 'issuer' || role === 'both') {
    if (db === 'docker') {
      process.stdout.write('\nNext (database): docker run --name air-issuer-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=issuer-backend -p 5432:5432 -d postgres:16\n');
    }
    process.stdout.write('Next: /air issue — prepare the recorded issuer backend\n');
    if (existing) {
      process.stdout.write('Then: /air keys --import <path-to-existing.env>\n');
    } else {
      process.stdout.write('Then: /air keys\n');
    }
  } else if (role === 'verifier') {
    process.stdout.write('\nVerifier path: generate JWT keys if you call AIR verify APIs, then /air verify.\n');

  } else if (role === 'account-only') {
    process.stdout.write('\nAccount-only: /air account.\n');
  } else {
    process.stdout.write('\nAgentic: /air agent — install air-agentic-wallet-skill. Do not call Privy.\n');
  }
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
