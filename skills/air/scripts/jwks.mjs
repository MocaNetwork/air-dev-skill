#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadPartner, needsIssuer, needsVerifier, roleOf, updatePartnerFields } from './lib/partner.mjs';
import { webDir } from './lib/layout.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { ASSETS, parseArgs, projectRoot, writeText } from './lib/project.mjs';

function usage(code = 2) {
  process.stderr.write(`Usage:
  node jwks.mjs emit [--target <project>] [--route <relpath>]
  node jwks.mjs --check <url>
`);
  process.exit(code);
}

function defaultRoutes(target) {
  const base = fs.existsSync(path.join(target, 'src', 'app'))
    ? path.join(target, 'src', 'app', 'api')
    : path.join(target, 'app', 'api');
  return {
    jwks: path.join(base, '.well-known', 'jwks', 'route.ts'),
    jwt: path.join(base, 'partner-jwt', 'route.ts'),
  };
}

async function checkUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    process.stderr.write(`Invalid URL: ${url}\n`);
    process.exit(2);
  }
  const findings = [];
  if (parsed.protocol !== 'https:') {
    findings.push({ severity: 'P0', id: 'jwks-not-https', message: `JWKS URL is ${parsed.protocol}// — AIR requires public HTTPS` });
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') {
    findings.push({ severity: 'P0', id: 'jwks-localhost', message: 'JWKS URL is localhost. AIR cannot fetch it.' });
  }
  if (findings.length) {
    process.stdout.write(`${JSON.stringify({ ok: false, findings }, null, 2)}\n`);
    process.exit(1);
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const body = await res.json().catch(() => null);
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const kids = keys.map(k => k.kid).filter(Boolean);
  if (!res.ok || !Array.isArray(body?.keys) || kids.length === 0 || keys.some(k => ['d', 'p', 'q', 'dp', 'dq', 'qi'].some(field => field in k))) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      findings: [{ severity: 'P0', id: 'jwks-empty', message: `GET ${url} did not return keys[].kid` }],
    }, null, 2)}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, status: res.status, kids }, null, 2)}\n`);
}

function emit(flags) {
  const project = path.resolve(flags.project || projectRoot());
  assertSandbox(project);
  const partner = loadPartner(project);
  if (!partner.exists) throw new Error('Run init before emitting application routes.');
  const root = path.resolve(flags.target || webDir(project) || project);
  if (!fs.existsSync(path.join(root, 'package.json'))) throw new Error('Create the web app before emitting routes.');
  if (!fs.existsSync(path.join(root, 'src', 'app')) && !fs.existsSync(path.join(root, 'app'))) {
    throw new Error('The bundled routes require Next App Router. Adapt them to the existing server framework instead.');
  }
  const configuredWeb = webDir(project);
  if (configuredWeb && configuredWeb !== root) throw new Error('Target differs from recorded Web directory. Update the project path and synchronize its signing configuration before emitting routes.');
  const defaults = defaultRoutes(root);
  const dest = path.resolve(root, flags.route || defaults.jwks);
  const jwtDest = path.resolve(root, flags['jwt-route'] || defaults.jwt);
  const authDest = path.join(path.dirname(jwtDest), 'air-token-auth.ts');
  const operations = [];
  const role = roleOf(partner.fields);
  if (needsIssuer(role)) operations.push('issue');
  if (needsVerifier(role)) operations.push('verify');
  if (partner.fields['Custom auth'] === 'yes') operations.push('login');
  const files = [
    [dest, fs.readFileSync(path.join(ASSETS, 'next-jwks-route.ts'), 'utf8')],
    [jwtDest, fs.readFileSync(path.join(ASSETS, 'next-partner-jwt-route.ts'), 'utf8').replace('/* AIR_ALLOWED_OPERATIONS */', operations.map(value => JSON.stringify(value)).join(', '))],
    [authDest, fs.readFileSync(path.join(ASSETS, 'air-token-auth.ts'), 'utf8')],
  ];
  for (const [file, contents] of files) {
    if (fs.existsSync(file)) console.log(`Preserved ${file}`);
    else { writeText(file, contents); console.log(`Wrote ${file}`); }
  }
  updatePartnerFields(project, { 'Web directory': path.relative(project, root) || '.' });
  console.log('Connect air-token-auth.ts to verified authentication and authorization, then test anonymous and authorized requests before exposing the app.');
}

async function main() {
  const flags = parseArgs();
  if (flags.help) usage(0);
  if (flags.check) {
    await checkUrl(String(flags.check));
    return;
  }
  if (flags._[0] === 'emit' || flags.emit) {
    emit(flags);
    return;
  }
  usage(2);
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
