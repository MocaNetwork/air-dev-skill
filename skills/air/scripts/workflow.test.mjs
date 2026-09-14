import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as module from 'node:module';
import { test } from 'node:test';
import { collectSignals, recommend } from './context.mjs';
import { detect } from './detect.mjs';
import { projectRoot } from './lib/project.mjs';
import { loadPartner, updatePartnerFields } from './lib/partner.mjs';
import { generateSecrets, importPartnerEnv, parseEnvFile, upsertEnv } from './lib/secrets.mjs';
import { signPartnerToken } from './lib/jwt-sign.mjs';
import { verifyToken } from './preflight.mjs';
import { copySkill } from '../../../bin/install.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, '..');
const id = '11111111-1111-4111-8111-111111111111';
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-flow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, name, value) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function run(root, name, args = [], success = true) {
  const result = spawnSync(process.execPath, [path.join(here, `${name}.mjs`), ...args, '--project', root], { encoding: 'utf8', cwd: root });
  if (success) assert.equal(result.status, 0, result.stderr);
  else assert.notEqual(result.status, 0, result.stdout);
  return result;
}
function init(root, role, args = []) { run(root, 'init', ['--role', role, '--partner-id', id, ...args]); }
function backend(root, name = 'apps/backend') { write(root, `${name}/src/issuer/index.ts`, ''); fs.mkdirSync(path.join(root, name, 'node_modules'), { recursive: true }); }
function env(root, name) { return parseEnvFile(fs.readFileSync(path.join(root, name), 'utf8')); }
function snapshot(root) {
  return fs.readdirSync(root, { recursive: true }).filter(name => fs.statSync(path.join(root, name)).isFile()).map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]);
}

test('fresh init does not report generated documentation as broken live configuration', t => {
  const root = workspace(t); init(root, 'issuer');
  assert.deepEqual(detect(root), []);
});

test('issuer SDK and direct triggers persist independently of frontend choice', t => {
  for (const trigger of ['sdk', 'direct', 'both']) {
    const root = path.join(workspace(t), trigger); fs.mkdirSync(root);
    init(root, 'issuer', ['--issuance', trigger, '--frontend', 'none']);
    assert.equal(loadPartner(root).fields['Issuance trigger'], trigger);
    assert.match(fs.readFileSync(path.join(root, 'AIR.md'), 'utf8'), new RegExp(`${trigger} trigger`));
  }
});

test('issuer keys require an installed issuer backend and do not create one', t => {
  const root = workspace(t); init(root, 'issuer'); const before = snapshot(root);
  run(root, 'keys', ['--env', 'sandbox'], false);
  assert.deepEqual(snapshot(root), before);
});

test('SDK issuer writes keys and program IDs to planned web directory before scaffolding', t => {
  const root = workspace(t); init(root, 'issuer', ['--frontend', 'next', '--web-dir', 'clients/portal', '--backend-dir', 'services/issuer']);
  backend(root, 'services/issuer'); run(root, 'keys', ['--env', 'sandbox']);
  assert.ok(env(root, 'clients/portal/.env.local').PARTNER_PRIVATE_KEY_DER);
  assert.equal(env(root, 'clients/portal/.env.local').SEED, undefined);
  run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--issue-program-id', 'program-from-dashboard']);
  assert.equal(env(root, 'clients/portal/.env.local').NEXT_PUBLIC_ISSUE_PROGRAM_ID, 'program-from-dashboard');
  assert.equal(fs.existsSync(path.join(root, '.env.local')), false);
  write(root, 'clients/portal/package.json', '{}'); write(root, 'clients/portal/app/page.tsx', '');
  run(root, 'jwks', ['emit', '--target', path.join(root, 'clients/portal')]);
  assert.ok(env(root, 'clients/portal/.env.local').PARTNER_PRIVATE_KEY_DER);
});

test('verifier flow creates signing keys, scopes tokens and records registration without issuer secrets', t => {
  const root = workspace(t); init(root, 'verifier', ['--frontend', 'next']);
  run(root, 'keys', ['--env', 'sandbox']);
  const keys = env(root, 'apps/web/.env.local');
  assert.ok(keys.PARTNER_PRIVATE_KEY_DER); assert.equal(keys.SEED, undefined); assert.equal(keys.API_KEY, undefined);
  assert.equal(fs.existsSync(path.join(root, 'apps/backend')), false);
  const result = JSON.parse(run(root, 'jwt', ['--scope', 'verify']).stdout);
  assert.equal(verifyToken(result.token, JSON.parse(keys.SD_JWT_JWKS), { partnerId: id, scope: 'verify' }).scope, 'verify');
  run(root, 'verify', ['--check'], false);
  run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--verify-program-id', 'actual-program', '--jwks-url', 'https://app.example.com/api/.well-known/jwks', '--jwks-registered', 'yes']);
  run(root, 'verify', ['--check']);
  assert.equal(loadPartner(root).fields['Issuer activated'], 'no');
});

test('account-only BYO auth creates signing keys and dedicated trusted login claims', t => {
  const root = workspace(t); init(root, 'account-only', ['--auth', 'byo']); run(root, 'keys', ['--env', 'sandbox']);
  const result = signPartnerToken(env(root, '.env.local'), { operation: 'login', user: { email: 'verified@example.com' } });
  assert.equal(result.claims.scope, undefined); assert.equal(result.claims.email, 'verified@example.com'); assert.equal(result.claims.partnerUserId, undefined);
  assert.throws(() => signPartnerToken(env(root, '.env.local'), { operation: 'login' }), /authenticated/);
});

test('registered identity cannot rotate via --force or a different seed import', t => {
  const root = workspace(t); init(root, 'issuer'); backend(root); run(root, 'keys', ['--env', 'sandbox']);
  run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--activated', 'yes']);
  const before = fs.readFileSync(path.join(root, 'apps/backend/.env'), 'utf8');
  run(root, 'keys', ['--env', 'sandbox', '--force'], false);
  const replacement = { ...env(root, 'apps/backend/.env'), ...generateSecrets({ kid: id }) };
  write(root, 'replacement.env', upsertEnv('', replacement));
  run(root, 'keys', ['--env', 'sandbox', '--force', '--import', 'replacement.env'], false);
  assert.equal(fs.readFileSync(path.join(root, 'apps/backend/.env'), 'utf8'), before);
  run(root, 'keys', ['--env', 'sandbox', '--import', 'apps/backend/.env']);
  assert.equal(env(root, 'apps/backend/.env').SEED, parseEnvFile(before).SEED);
});

test('production flag and imported production settings are rejected without writes', t => {
  const root = workspace(t); init(root, 'verifier');
  const before = snapshot(root);
  run(root, 'keys', ['--env', 'production'], false);
  run(root, 'provision', ['--env', 'production', 'write-ids'], false);
  assert.deepEqual(snapshot(root), before);
  write(root, 'production.env', upsertEnv('', { PARTNER_ID: id, NODE_ENV: 'production', ...generateSecrets({ kid: id, issuer: false }) }));
  const importedBefore = snapshot(root);
  run(root, 'keys', ['--env', 'sandbox', '--import', 'production.env'], false);
  assert.deepEqual(snapshot(root), importedBefore);
});

test('RSA partner import preserves algorithm and non-Partner-ID kid', t => {
  const root = workspace(t); init(root, 'verifier', ['--existing']);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  write(root, 'import.env', upsertEnv('', { PARTNER_ID: id, PARTNER_PRIVATE_KEY_KID: 'existing-key-2026', PARTNER_PRIVATE_KEY_DER: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') }));
  run(root, 'keys', ['--env', 'sandbox', '--import', 'import.env']);
  assert.equal(loadPartner(root).fields['Signing algorithm'], 'RS256');
  const config = env(root, '.env.local'); const signed = signPartnerToken(config, { operation: 'verify' });
  assert.equal(verifyToken(signed.token, JSON.parse(config.SD_JWT_JWKS)).kid, 'existing-key-2026');
});

test('mismatched or private JWKS is rejected on import', () => {
  const a = generateSecrets({ kid: id, issuer: false }), b = generateSecrets({ kid: id, issuer: false });
  assert.throws(() => importPartnerEnv({ ...a, PARTNER_ID: id, SD_JWT_JWKS: b.SD_JWT_JWKS }, { issuer: false }), /does not match/);
  const document = JSON.parse(a.SD_JWT_JWKS); document.keys[0].d = 'private';
  assert.throws(() => importPartnerEnv({ ...a, PARTNER_ID: id, SD_JWT_JWKS: JSON.stringify(document) }, { issuer: false }), /public keys only/);
});

test('preflight verifies signatures, scope and expiry rather than only kid', () => {
  const config = { ...generateSecrets({ kid: id, issuer: false }), PARTNER_ID: id };
  const signed = signPartnerToken(config, { operation: 'issue', now: 1000 });
  const jwks = JSON.parse(config.SD_JWT_JWKS);
  verifyToken(signed.token, jwks, { scope: 'issue', now: 1100 });
  assert.throws(() => verifyToken(signed.token, jwks, { scope: 'verify', now: 1100 }), /scope/);
  assert.throws(() => verifyToken(signed.token, jwks, { now: 1400 }), /expired/);
  const parts = signed.token.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...signed.claims, scope: 'verify' })).toString('base64url');
  assert.throws(() => verifyToken(parts.join('.'), jwks, { now: 1100 }), /signature/);
});

test('existing env example and authenticated routes survive init and repeated emission', t => {
  const root = workspace(t); write(root, '.env.example', 'CUSTOM_SETTING=keep\n');
  init(root, 'issuer', ['--frontend', 'next']);
  assert.equal(fs.readFileSync(path.join(root, '.env.example'), 'utf8'), 'CUSTOM_SETTING=keep\n');
  write(root, 'apps/web/package.json', '{}'); write(root, 'apps/web/app/page.tsx', '');
  const name = 'apps/web/app/api/partner-jwt/route.ts'; write(root, name, '// existing authenticated route\n');
  run(root, 'jwks', ['emit', '--target', path.join(root, 'apps/web')]);
  run(root, 'jwks', ['emit', '--target', path.join(root, 'apps/web')]);
  assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), '// existing authenticated route\n');
});

test('context ignores examples, tests, bundled skills and comments as implemented SDK calls', t => {
  const root = workspace(t); init(root, 'both');
  for (const name of ['examples/demo.ts', 'tests/demo.ts', 'src/demo.test.ts', 'skills/air/demo.ts']) write(root, name, 'air.issueCredential({}); air.verifyCredential({});');
  write(root, 'src/comment.ts', '// air.issueCredential({});\n/* air.verifyCredential({}); */');
  let signals = collectSignals(root); assert.equal(signals.scan.hasIssueCall, false); assert.equal(signals.scan.hasVerifyCall, false);
  write(root, 'src/page.ts', 'await air.issueCredential(config);');
  signals = collectSignals(root); assert.equal(signals.scan.hasIssueCall, true); assert.equal(signals.scan.hasVerifyCall, false);
});

test('direct-only issuer is not routed to add a local SDK call', t => {
  const root = workspace(t); init(root, 'issuer', ['--issuance', 'direct']); backend(root); run(root, 'keys', ['--env', 'sandbox']);
  updatePartnerFields(root, { 'Issuer DID': 'did:air:observed', 'Issuer activated': 'yes', 'JWKS registered': 'yes' });
  assert.equal(recommend(collectSignals(root)).some(item => item.reason.includes('issue call')), false);
});

test('project root remains partner root from inside a package workspace', t => {
  const root = workspace(t); init(root, 'issuer'); write(root, 'apps/web/package.json', '{}');
  assert.equal(projectRoot(path.join(root, 'apps/web')), root);
});

test('copied standalone JWT helper signs without project dependencies', t => {
  const root = workspace(t); init(root, 'verifier'); run(root, 'keys', ['--env', 'sandbox']);
  const installed = path.join(root, '.agents/skills/air'); copySkill(skill, installed);
  const result = spawnSync(process.execPath, [path.join(installed, 'scripts/jwt.mjs'), '--scope', 'verify'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).claims.scope, 'verify');
});

test('external database is persisted and none explicitly clears database use', t => {
  const root = workspace(t); init(root, 'issuer', ['--db', 'external', '--database-url', 'postgres://local-test/db']); backend(root);
  run(root, 'keys', ['--env', 'sandbox']); assert.equal(env(root, 'apps/backend/.env').DATABASE_URL, 'postgres://local-test/db');
  updatePartnerFields(root, { Database: 'none' });
  run(root, 'keys', ['--env', 'sandbox', '--import', 'apps/backend/.env']); assert.equal(env(root, 'apps/backend/.env').DATABASE_URL, '');
});

test('generated token route denies anonymous/unauthorized callers and signs scoped RSA/EC tokens', async t => {
  if (!module.stripTypeScriptTypes) { t.skip('Route execution test needs Node with built-in TypeScript stripping'); return; }
  const root = workspace(t); init(root, 'both', ['--auth', 'byo', '--frontend', 'next']);
  write(root, 'apps/web/package.json', '{}'); write(root, 'apps/web/app/page.tsx', '');
  run(root, 'jwks', ['emit', '--target', path.join(root, 'apps/web')]);
  const source = fs.readFileSync(path.join(root, 'apps/web/app/api/partner-jwt/route.ts'), 'utf8');
  const base = module.stripTypeScriptTypes(source, { mode: 'strip' })
    .replace('import { NextResponse } from "next/server";', 'const NextResponse = Response;');
  const original = { ...process.env };
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); });
  let index = 0;
  async function route(user) {
    const contents = base.replace('import { authorizeAirToken } from "./air-token-auth";', `const authorizeAirToken = async () => (${JSON.stringify(user)});`);
    const filename = `route-${index++}.mjs`; write(root, filename, contents);
    return (await import(pathToFileURL(path.join(root, filename)).href)).POST;
  }
  const request = (operation, extra = {}) => new Request('https://app.example.com/api/partner-jwt', { method: 'POST', body: JSON.stringify({ operation, ...extra }), headers: { 'Content-Type': 'application/json' } });
  assert.equal((await (await route(null))(request('issue'))).status, 401);
  assert.equal((await (await route({ id: 'user', operations: ['verify'] }))(request('issue'))).status, 403);
  const handler = await route({ id: 'server-user', email: 'server@example.com', operations: ['issue', 'verify', 'login'] });
  for (const alg of ['ES256', 'RS256']) {
    const signing = alg === 'ES256' ? generateSecrets({ kid: id, issuer: false }) : (() => {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      return importPartnerEnv({ PARTNER_ID: id, PARTNER_PRIVATE_KEY_KID: 'imported-rsa', PARTNER_PRIVATE_KEY_DER: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') }, { issuer: false });
    })();
    Object.assign(process.env, { PARTNER_ID: id, PARTNER_PRIVATE_KEY_DER: signing.PARTNER_PRIVATE_KEY_DER, PARTNER_PRIVATE_KEY_KID: signing.PARTNER_PRIVATE_KEY_KID, SD_JWT_JWKS: signing.SD_JWT_JWKS });
    for (const operation of ['issue', 'verify']) {
      const response = await handler(request(operation)); assert.equal(response.status, 200);
      const { token } = await response.json(); assert.equal(verifyToken(token, JSON.parse(signing.SD_JWT_JWKS), { partnerId: id, scope: operation }).scope, operation);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  const login = await handler(request('login', { email: 'spoofed@example.com', partnerUserId: 'attacker' }));
  assert.equal(login.status, 200);
  const { token } = await login.json(); const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  assert.equal(claims.email, 'server@example.com'); assert.equal(claims.partnerUserId, undefined); assert.equal(claims.scope, undefined);
  assert.equal((await handler(request('arbitrary'))).status, 400);
});

test('generated auth adapter actually denies access until integrated', async t => {
  if (!module.stripTypeScriptTypes) { t.skip('Needs TypeScript stripping'); return; }
  const root = workspace(t);
  const source = fs.readFileSync(path.join(skill, 'assets/air-token-auth.ts'), 'utf8');
  write(root, 'adapter.mjs', module.stripTypeScriptTypes(source, { mode: 'strip' }));
  const { authorizeAirToken } = await import(pathToFileURL(path.join(root, 'adapter.mjs')).href);
  assert.equal(await authorizeAirToken(new Request('https://app.example.com')), null);
});

test('configured nonstandard app paths are included in context and audit', t => {
  const root = workspace(t); init(root, 'verifier', ['--frontend', 'next', '--web-dir', 'client/custom']); run(root, 'keys', ['--env', 'sandbox']);
  assert.deepEqual(collectSignals(root).secrets.missing, []);
  write(root, 'client/custom/.env.local', upsertEnv(fs.readFileSync(path.join(root, 'client/custom/.env.local'), 'utf8'), { NEXT_PUBLIC_API_KEY: 'test-only-value' }));
  assert.equal(detect(root).some(item => item.id === 'public-secret-prefix' && item.file === 'client/custom/.env.local'), true);
});
