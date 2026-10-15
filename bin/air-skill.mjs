#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(root, 'skills', 'air', 'scripts');

const aliases = {
  detect: 'detect.mjs',
  jwt: 'jwt.mjs',
  keys: 'keys.mjs',
  jwks: 'jwks.mjs',
  init: 'init.mjs',
  context: 'context.mjs',
  provision: 'provision.mjs',
  issue: 'issue.mjs',
  verify: 'verify.mjs',
  'issuer-did': 'issuer-did.mjs',
  vct: 'vct.mjs',
  'sd-jwt': 'sd-jwt.mjs',
};

const installCmds = new Set(['install', 'update', 'uninstall', 'list']);
const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  process.stdout.write(`air-dev-skill <command> [args]

Install:
  npx air-dev-skill install
  npx air-dev-skill install -y
  npx air-dev-skill install --providers=cursor,claude --scope global
  npx air-dev-skill update
  npx air-dev-skill uninstall
  npx air-dev-skill list

Commands:
  detect [--json] [paths...]
  jwt --operation issue|verify [--exp 300]
  keys --env sandbox [--partner-id <uuid>] [--import <env>]
  issuer-did [--check] [--backend <dir>]   derive did:web from ISSUER_ORIGIN
  vct plan --spec <file> | schema --spec <file> --schema-id <id> | --check <url>
  jwks emit [--target <dir>] | --check <url>
  init --role <role> [--partner-id <uuid>] [--existing] [--db docker|external|none] [--frontend none|next|existing] [--issuance sdk|direct|both] [--web-dir <dir>] [--backend-dir <dir>]
  context [--json]
  provision --env sandbox <action>
  issue [--clone-backend] [--yes] [--install]
  verify [--check]
  sd-jwt inspect <file|-> [--verify] [--nonce <n>] [--program-id <id>] [--vct <vct>] [--did-doc <file|url>]

Also:
  npx skills add MocaNetwork/air-sdk-ai
  /plugin marketplace add MocaNetwork/air-sdk-ai
`);
  process.exit(cmd ? 0 : 2);
}

const target = installCmds.has(cmd)
  ? path.join(root, 'bin', 'install.mjs')
  : aliases[cmd]
    ? path.join(scripts, aliases[cmd])
    : null;

if (!target) {
  process.stderr.write(`Unknown command: ${cmd}\n`);
  process.exit(2);
}

const child = spawn(
  process.execPath,
  installCmds.has(cmd) ? [target, cmd, ...rest] : [target, ...rest],
  {
    stdio: 'inherit',
    cwd: process.cwd(),
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});