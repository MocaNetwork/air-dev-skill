#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadPartner, needsIssuer, roleOf, updatePartnerFields } from './lib/partner.mjs';
import { backendDir, wantsFrontend, hasIssuerBackend } from './lib/layout.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { parseArgs, projectRoot } from './lib/project.mjs';

const REPO = 'https://github.com/MocaNetwork/air-issuer-service.git';

function usage(code = 2) {
  process.stderr.write(`Usage: node issue.mjs [--clone-backend] [--yes] [--install] [--dir apps/backend] [--project <dir>]

Dry-run prints the issuer scaffold plan. --clone-backend --yes clones air-issuer-service.
--install runs pnpm install in the clone.
`);
  process.exit(code);
}

function main() {
  const flags = parseArgs();
  if (flags.help) usage(0);
  const root = path.resolve(flags.project || projectRoot());
  const partner = loadPartner(root);
  if (!partner.exists) {
    process.stderr.write('NO_PARTNER_MD: run init first.\n');
    process.exit(2);
  }
  const role = roleOf(partner.fields);
  if (!needsIssuer(role)) {
    process.stderr.write(`Role is ${role || 'unset'}. /air issue is for issuer or both.\n`);
    process.exit(2);
  }

  const dest = backendDir(root, flags.dir);
  const frontend = partner.fields.Frontend || 'none';
  process.stdout.write(`Issuer scaffold plan\n`);
  process.stdout.write(`  Role: ${role}\n`);
  process.stdout.write(`  Issuance trigger: ${partner.fields['Issuance trigger'] || 'unknown'}\n`);
  process.stdout.write(`  Auth: ${partner.fields['Auth model'] || 'air-login'}\n`);
  process.stdout.write(`  Database: ${partner.fields.Database || 'none'}\n`);
  process.stdout.write(`  Frontend: ${frontend}\n`);
  process.stdout.write(`  Backend dest: ${dest}\n`);
  process.stdout.write(`  Clone: git clone --depth 1 ${REPO} ${dest}\n`);
  process.stdout.write(`  Install: pnpm install (in ${dest})\n`);
  if (wantsFrontend(partner.fields) && partner.fields['Issuance trigger'] !== 'direct') {
    process.stdout.write(`  Frontend: ${frontend === 'next' ? 'create-next-app or' : ''} existing app + skill JWKS/JWT stubs + AirService.issueCredential\n`);
  } else {
    process.stdout.write(`  Frontend: skipped (Frontend: none)\n`);
  }

  process.stdout.write(`  Custom-auth: ${partner.fields['Custom auth'] === 'yes' ? 'opt-in — docs /recipes/custom-auth-integration' : 'no — use AIR Kit login'}\n`);


  if (!flags['clone-backend'] && flags.install) {
    assertSandbox(root);
    if (!flags.yes) throw new Error('Pass --yes to install backend dependencies.');
    if (!hasIssuerBackend(root)) throw new Error('No issuer backend exists at the recorded directory.');
    const install = spawnSync('pnpm', ['install'], { cwd: dest, stdio: 'inherit' });
    process.exit(install.status ?? 1);
  }
  if (!flags['clone-backend']) {
    process.stdout.write('\nDry-run only. Re-run with --clone-backend --yes [--install] to clone the backend.\n');
    return;
  }
  if (!flags.yes) {
    process.stderr.write('Pass --yes to clone the issuer backend.\n');
    process.exit(2);
  }
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) {
    process.stderr.write(`${dest} is not empty.\n`);
    process.exit(2);
  }
  assertSandbox(root);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const result = spawnSync('git', ['clone', '--depth', '1', REPO, dest], { stdio: 'inherit' });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
  updatePartnerFields(root, { 'Backend directory': path.relative(root, dest) || '.' });
  if (flags.install) {
    const install = spawnSync('pnpm', ['install'], { cwd: dest, stdio: 'inherit' });
    process.exit(install.status ?? 1);
  }
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
