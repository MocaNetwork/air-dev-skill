#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadPartner, updatePartnerFields } from './lib/partner.mjs';
import { backendDir, wantsFrontend, webEnvPath } from './lib/layout.mjs';
import { ensureGitignore, parseArgs, projectRoot, readText, writeText } from './lib/project.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { parseEnvFile, upsertEnv } from './lib/secrets.mjs';

const REPL_INPUT = "console.log(get(CredentialIssuingService).issuerDID.string());\n";
const DID_RE = /did:air:[A-Za-z0-9:._-]+/;

export function parseIssuerDid(text) {
  const match = String(text || '').match(DID_RE);
  return match ? match[0] : null;
}

function usage(code = 2) {
  process.stderr.write(`Usage: node issuer-did.mjs [--backend <dir>] [--issuer-did did:air:...] [--project <dir>]

Runs the air-issuer-service repl and writes Issuer DID to PARTNER.md.
Never prints SEED or private keys.
`);
  process.exit(code);
}

function runRepl(backend) {
  const result = spawnSync('pnpm', ['run', 'repl', '-'], {
    cwd: backend,
    input: REPL_INPUT,
    encoding: 'utf8',
    timeout: 120_000,
    env: process.env,
  });
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  return { result, combined };
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

  const backend = backendDir(root, flags.backend);
  assertSandbox(root, 'sandbox', parseEnvFile(readText(path.join(backend, '.env'))));
  const { result, combined } = runRepl(backend);
  const did = parseIssuerDid(combined);

  if (!did || result.status !== 0 || result.error) {
    process.stderr.write('Could not parse issuer DID from pnpm run repl.\n');
    process.stderr.write('Confirm apps/backend has node_modules, .env (SEED + ISSUER_ORIGIN), then retry.\n');
    if (result.status) process.stderr.write(`repl exit ${result.status}\n`);
    process.exit(result.status || 1);
  }

  const expected = String(flags['issuer-did'] || partner.fields['Issuer DID'] || '').trim();
  if (expected && expected !== did) {
    process.stderr.write(`Issuer DID mismatch.\n  repl: ${did}\n  given: ${expected}\n`);
    process.exit(2);
  }

  updatePartnerFields(root, { 'Issuer DID': did });
  ensureGitignore(root, ['.env', '.env.local', '.env.*.local', 'apps/backend/.env']);

  const written = ['PARTNER.md'];
  if (wantsFrontend(partner.fields) || readText(webEnvPath(root))) {
    const envFile = webEnvPath(root);
    writeText(envFile, upsertEnv(readText(envFile) ?? '', {
      ...parseEnvFile(readText(envFile)),
      NEXT_PUBLIC_ISSUER_DID: did,
    }));
    written.push(envFile);
  }

  process.stdout.write(`Issuer DID: ${did}\n`);
  process.stdout.write(`Wrote Issuer DID to ${written.join(' and ')}\n`);
}

const invoked = process.argv[1] && path.basename(process.argv[1]) === 'issuer-did.mjs';
if (invoked) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 2; } }
