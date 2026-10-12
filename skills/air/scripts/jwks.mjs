#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadPartner, needsIssuer, needsVerifier, roleOf, updatePartnerFields } from './lib/partner.mjs';
import { webDir } from './lib/layout.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { ASSETS, parseArgs, projectRoot, writeText } from './lib/project.mjs';

function usage(code = 2) {
  process.stderr.write(`Usage:
  node jwks.mjs emit [--target <project>] [--route <relpath>] [--jwt-route <relpath>] [--verify-route <relpath>]
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
    verify: path.join(base, 'air', 'verify-presentation', 'route.ts'),
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
  // Next 16 with cacheComponents rejects route segment config such as `export const runtime`.
  const nextConfig = ['next.config.ts', 'next.config.mjs', 'next.config.js'].map(name => fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name), 'utf8') : '').join('\n');
  const cacheComponents = /cacheComponents\s*:\s*true/.test(nextConfig);
  const route = text => (cacheComponents ? text.replace(/^export const runtime = "nodejs";\n/m, '') : text);
  const tokenOperations = operations.filter(operation => operation !== 'login');
  const files = [
    [dest, fs.readFileSync(path.join(ASSETS, 'next-jwks-route.ts'), 'utf8')],
    [jwtDest, route(fs.readFileSync(path.join(ASSETS, 'next-partner-jwt-route.ts'), 'utf8').replace('/* AIR_ALLOWED_OPERATIONS */', operations.map(value => JSON.stringify(value)).join(', ')))],
    [authDest, fs.readFileSync(path.join(ASSETS, 'air-token-auth.ts'), 'utf8').replace('/* AIR_TOKEN_OPERATIONS */', tokenOperations.map(value => JSON.stringify(value)).join(', '))],
  ];
  if (needsVerifier(role)) {
    // Backend check of the SD-JWT presentation; the browser's Compliant status is not trusted on its own.
    const verifyDest = path.resolve(root, flags['verify-route'] || defaults.verify);
    let authImport = path.relative(path.dirname(verifyDest), authDest).replace(/\\/g, '/').replace(/\.ts$/, '');
    if (!authImport.startsWith('.')) authImport = `./${authImport}`;
    files.push(
      [verifyDest, route(fs.readFileSync(path.join(ASSETS, 'next-verify-presentation-route.ts'), 'utf8').replace('AIR_TOKEN_AUTH_IMPORT', authImport))],
      [path.join(path.dirname(verifyDest), 'verify-air-sd-jwt.ts'), fs.readFileSync(path.join(ASSETS, 'verify-air-sd-jwt.ts'), 'utf8')],
    );
  }
  for (const [file, contents] of files) {
    if (fs.existsSync(file)) console.log(`Preserved ${file}`);
    else { writeText(file, contents); console.log(`Wrote ${file}`); }
  }
  updatePartnerFields(project, { 'Web directory': path.relative(project, root) || '.' });
  console.log('air-token-auth.ts validates the AIR login token (Authorization: Bearer from getAccessToken()); install jose in the web app. For Custom Auth, replace it with the app session. Test anonymous, cross-site and authorized requests before exposing the app.');
  if (cacheComponents) console.log('cacheComponents is enabled: the routes were written without `export const runtime`.');
  if (needsVerifier(role)) console.log('Verification: install @sd-jwt/sd-jwt-vc@^0.20 and jose@^5 in the web app, implement the nonce store in air-token-auth.ts, and set AIR_VERIFY_PROGRAM_ID, AIR_TRUSTED_ISSUERS and AIR_EXPECTED_VCT (provision.mjs write-ids records them).');
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
