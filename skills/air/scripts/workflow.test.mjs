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
import { tokenOperation, verifyToken } from './preflight.mjs';
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
  assert.equal(env(root, 'clients/portal/.env.local').API_KEY, undefined);
  assert.ok(env(root, 'clients/portal/.env.local').PARTNER_JWKS);
  assert.ok(env(root, 'services/issuer/.env').PARTNER_JWKS);
  run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--issue-program-id', 'program-from-dashboard']);
  assert.equal(env(root, 'clients/portal/.env.local').NEXT_PUBLIC_ISSUE_PROGRAM_ID, 'program-from-dashboard');
  assert.equal(fs.existsSync(path.join(root, '.env.local')), false);
  write(root, 'clients/portal/package.json', '{}'); write(root, 'clients/portal/app/page.tsx', '');
  run(root, 'jwks', ['emit', '--target', path.join(root, 'clients/portal')]);
  assert.ok(env(root, 'clients/portal/.env.local').PARTNER_PRIVATE_KEY_DER);
  assert.equal(collectSignals(root).scan.hasJwksRoute, true);
});

test('provision refuses to overwrite a partner ID changed in an env file', t => {
  const root = workspace(t); init(root, 'issuer', ['--frontend', 'next']); backend(root); run(root, 'keys', ['--env', 'sandbox']);
  const changed = '22222222-2222-4222-8222-222222222222';
  const backendEnv = path.join(root, 'apps/backend/.env');
  fs.writeFileSync(backendEnv, upsertEnv(fs.readFileSync(backendEnv, 'utf8'), { PARTNER_ID: changed }));
  const webBefore = fs.readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8');
  const result = run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--issue-program-id', 'p-1'], false);
  assert.match(result.stderr, /Partner ID mismatch/);
  assert.match(result.stderr, new RegExp(`PARTNER_ID=${changed}`));
  assert.equal(fs.readFileSync(path.join(root, 'apps/web/.env.local'), 'utf8'), webBefore);
  assert.equal(loadPartner(root).fields['Issuance program IDs'] || '', '');
});

test('verifier flow creates signing keys, scopes tokens and records registration without issuer secrets', t => {
  const root = workspace(t); init(root, 'verifier', ['--frontend', 'next']);
  run(root, 'keys', ['--env', 'sandbox']);
  const keys = env(root, 'apps/web/.env.local');
  assert.ok(keys.PARTNER_PRIVATE_KEY_DER); assert.equal(keys.SEED, undefined); assert.equal(keys.API_KEY, undefined);
  assert.ok(keys.PARTNER_JWKS);
  assert.equal(fs.existsSync(path.join(root, 'apps/backend')), false);
  const result = JSON.parse(run(root, 'jwt', ['--operation', 'verify']).stdout);
  assert.equal(verifyToken(result.token, JSON.parse(keys.PARTNER_JWKS), { partnerId: id, operation: 'verify' }).operation, 'verify');
  assert.equal(result.claims.scope, 'verify');
  run(root, 'verify', ['--check'], false);
  run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--verify-program-id', 'actual-program', '--jwks-url', 'https://app.example.com/api/.well-known/jwks', '--jwks-registered', 'yes',
    '--trusted-issuer', 'did:web:issuer.example.com', '--vct', 'urn:example:member:v1']);
  run(root, 'verify', ['--check'], false);
  write(root, 'apps/web/package.json', '{}'); write(root, 'apps/web/app/page.tsx', '');
  run(root, 'jwks', ['emit', '--target', path.join(root, 'apps/web')]);
  assert.ok(fs.existsSync(path.join(root, 'apps/web/app/api/air/verify-presentation/verify-air-sd-jwt.ts')));
  assert.match(fs.readFileSync(path.join(root, 'apps/web/app/api/air/verify-presentation/route.ts'), 'utf8'), /from "\.\.\/\.\.\/partner-jwt\/air-token-auth"/);
  run(root, 'verify', ['--check']);
  const web = env(root, 'apps/web/.env.local');
  assert.equal(web.AIR_TRUSTED_ISSUERS, 'did:web:issuer.example.com'); assert.equal(web.AIR_EXPECTED_VCT, 'urn:example:member:v1'); assert.equal(web.AIR_VERIFY_PROGRAM_ID, 'actual-program');
  assert.equal(loadPartner(root).fields['Issuer registered'], 'no');
  run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--trusted-issuer', 'did:air:id:legacy'], false);
});

test('account-only BYO auth creates signing keys and dedicated trusted login claims', t => {
  const root = workspace(t); init(root, 'account-only', ['--auth', 'byo']); run(root, 'keys', ['--env', 'sandbox']);
  const result = signPartnerToken(env(root, '.env.local'), { operation: 'login', user: { email: 'verified@example.com' } });
  assert.equal(result.claims.scope, undefined); assert.equal(result.claims.email, 'verified@example.com'); assert.equal(result.claims.partnerUserId, undefined);
  assert.throws(() => signPartnerToken(env(root, '.env.local'), { operation: 'login' }), /authenticated/);
});

test('registered identity cannot rotate via --force or a different key import', t => {
  const root = workspace(t); init(root, 'issuer'); backend(root); run(root, 'keys', ['--env', 'sandbox']);
  run(root, 'provision', ['--env', 'sandbox', 'write-ids', '--activated', 'yes']);
  assert.equal(loadPartner(root).fields['Issuer registered'], 'yes');
  const before = fs.readFileSync(path.join(root, 'apps/backend/.env'), 'utf8');
  run(root, 'keys', ['--env', 'sandbox', '--force'], false);
  const replacement = { ...env(root, 'apps/backend/.env'), ...generateSecrets({ kid: id }) };
  write(root, 'replacement.env', upsertEnv('', replacement));
  run(root, 'keys', ['--env', 'sandbox', '--force', '--import', 'replacement.env'], false);
  assert.equal(fs.readFileSync(path.join(root, 'apps/backend/.env'), 'utf8'), before);
  run(root, 'keys', ['--env', 'sandbox', '--import', 'apps/backend/.env']);
  assert.equal(env(root, 'apps/backend/.env').PARTNER_PRIVATE_KEY_DER, parseEnvFile(before).PARTNER_PRIVATE_KEY_DER);
});

test('issuer DID is derived from a public ISSUER_ORIGIN and cannot silently change', t => {
  const root = workspace(t); init(root, 'issuer', ['--frontend', 'next']); backend(root); run(root, 'keys', ['--env', 'sandbox']);
  run(root, 'issuer-did', [], false);
  const backendEnv = path.join(root, 'apps/backend/.env');
  fs.writeFileSync(backendEnv, upsertEnv(fs.readFileSync(backendEnv, 'utf8'), { ISSUER_ORIGIN: 'https://issuer.example.com:8443' }));
  run(root, 'issuer-did');
  assert.equal(loadPartner(root).fields['Issuer DID'], 'did:web:issuer.example.com%3A8443');
  assert.equal(env(root, 'apps/web/.env.local').NEXT_PUBLIC_ISSUER_DID, 'did:web:issuer.example.com%3A8443');
  const recorded = loadPartner(root).fields;
  assert.equal(recorded['Available Credentials API'], 'https://issuer.example.com:8443/available-vc');
  assert.equal(recorded['Issue Credential API'], 'https://issuer.example.com:8443/issue-vc');
  assert.equal(recorded['Revocation Status API'], 'https://issuer.example.com:8443/revocation-status/:nonce');
  assert.deepEqual(detect(root).filter(item => item.severity === 'P0'), []);
  fs.writeFileSync(backendEnv, upsertEnv(fs.readFileSync(backendEnv, 'utf8'), { ISSUER_ORIGIN: 'https://new-tunnel.example.com' }));
  assert.match(run(root, 'issuer-did', [], false).stderr, /mismatch/);
  assert.equal(detect(root).some(item => item.id === 'issuer-did-origin-mismatch'), true);
  assert.equal(detect(root).some(item => item.id === 'issuer-endpoint-mismatch'), true);
  updatePartnerFields(root, { 'Issuer registered': 'yes' });
  run(root, 'issuer-did', ['--rehost']);
  const moved = loadPartner(root).fields;
  assert.equal(moved['Issuer DID'], 'did:web:new-tunnel.example.com');
  assert.equal(moved['Issue Credential API'], 'https://new-tunnel.example.com/issue-vc');
  assert.equal(moved['Issuer registered'], 'no');
  assert.equal(env(root, 'apps/web/.env.local').NEXT_PUBLIC_ISSUER_DID, 'did:web:new-tunnel.example.com');
  assert.deepEqual(detect(root).filter(item => item.severity === 'P0'), []);
});

test('Iden3-era backend configuration is detected and left unchanged', t => {
  const root = workspace(t); init(root, 'issuer'); backend(root);
  write(root, 'apps/backend/.env', 'NODE_ENV=sandbox\nSEED=0x1111\nISSUER_ORIGIN=https://issuer.example.com\n');
  const before = snapshot(root);
  assert.match(run(root, 'keys', ['--env', 'sandbox'], false).stderr, /Iden3/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(collectSignals(root).partner.legacyIden3, true);
  assert.match(recommend(collectSignals(root))[0].reason, /Iden3/);
});

test('issuer clone is pinned to the SD-JWT reference branch', async () => {
  const { BRANCH, cloneArgs } = await import('./issue.mjs');
  assert.equal(BRANCH, 'main_sd-jwt-vc');
  assert.deepEqual(cloneArgs('apps/backend').slice(0, 5), ['clone', '--depth', '1', '--branch', 'main_sd-jwt-vc']);
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
  assert.equal(verifyToken(signed.token, JSON.parse(config.PARTNER_JWKS)).kid, 'existing-key-2026');
});

test('mismatched or private JWKS is rejected on import', () => {
  const a = generateSecrets({ kid: id, issuer: false }), b = generateSecrets({ kid: id, issuer: false });
  assert.throws(() => importPartnerEnv({ ...a, PARTNER_ID: id, PARTNER_JWKS: b.PARTNER_JWKS }, { issuer: false }), /does not match/);
  const document = JSON.parse(a.PARTNER_JWKS); document.keys[0].d = 'private';
  assert.throws(() => importPartnerEnv({ ...a, PARTNER_ID: id, PARTNER_JWKS: JSON.stringify(document) }, { issuer: false }), /public keys only/);
});

test('preflight verifies signatures, scope and expiry rather than only kid', () => {
  const config = { ...generateSecrets({ kid: id, issuer: false }), PARTNER_ID: id };
  const signed = signPartnerToken(config, { operation: 'issue', now: 1000 });
  const jwks = JSON.parse(config.PARTNER_JWKS);
  assert.equal(signed.claims.scope, 'issue');
  assert.equal(verifyToken(signed.token, jwks, { operation: 'issue', now: 1100 }).operation, 'issue');
  assert.throws(() => verifyToken(signed.token, jwks, { operation: 'verify', now: 1100 }), /scope/);
  assert.throws(() => tokenOperation({ partnerId: id }), /no scope/);
  assert.throws(() => verifyToken(signed.token, jwks, { now: 1400 }), /expired/);
  const parts = signed.token.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...signed.claims, partnerId: 'other' })).toString('base64url');
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

test('emitted routes omit runtime config when Next cacheComponents is enabled', t => {
  const root = workspace(t); init(root, 'both', ['--frontend', 'next']);
  write(root, 'apps/web/package.json', '{}'); write(root, 'apps/web/app/page.tsx', '');
  write(root, 'apps/web/next.config.ts', 'export default { cacheComponents: true };');
  run(root, 'jwks', ['emit', '--target', path.join(root, 'apps/web')]);
  for (const name of ['apps/web/app/api/partner-jwt/route.ts', 'apps/web/app/api/air/verify-presentation/route.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, name), 'utf8'), /export const runtime/);
  }
  assert.match(fs.readFileSync(path.join(root, 'apps/web/app/api/partner-jwt/air-token-auth.ts'), 'utf8'), /OPERATIONS: AirTokenUser\["operations"\] = \["issue", "verify"\]/);
  assert.match(fs.readFileSync(path.join(root, 'apps/web/app/api/.well-known/jwks/route.ts'), 'utf8'), /max-age=60/);
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
  updatePartnerFields(root, { 'Issuer DID': 'did:web:issuer.example.com', 'Issuer registered': 'yes', 'JWKS registered': 'yes' });
  assert.equal(recommend(collectSignals(root)).some(item => item.reason.includes('issue call')), false);
});

test('project root remains partner root from inside a package workspace', t => {
  const root = workspace(t); init(root, 'issuer'); write(root, 'apps/web/package.json', '{}');
  assert.equal(projectRoot(path.join(root, 'apps/web')), root);
});

test('copied standalone JWT helper signs without project dependencies', t => {
  const root = workspace(t); init(root, 'verifier'); run(root, 'keys', ['--env', 'sandbox']);
  const installed = path.join(root, '.agents/skills/air'); copySkill(skill, installed);
  const result = spawnSync(process.execPath, [path.join(installed, 'scripts/jwt.mjs'), '--scope', 'verify'], { cwd: root, encoding: 'utf8' }); // legacy alias
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
  let index = 0; let nonceStore = true;
  async function route(user) {
    const contents = base.replace('import { authorizeAirToken, storeVerificationNonce } from "./air-token-auth";',
      `const authorizeAirToken = async () => (${JSON.stringify(user)}); const storeVerificationNonce = async (_user, nonce) => { globalThis.storedNonce = nonce; return ${nonceStore}; };`);
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
    Object.assign(process.env, { PARTNER_ID: id, PARTNER_PRIVATE_KEY_DER: signing.PARTNER_PRIVATE_KEY_DER, PARTNER_PRIVATE_KEY_KID: signing.PARTNER_PRIVATE_KEY_KID, PARTNER_JWKS: signing.PARTNER_JWKS });
    for (const operation of ['issue', 'verify']) {
      const response = await handler(request(operation)); assert.equal(response.status, 200);
      const { token, nonce } = await response.json(); assert.equal(verifyToken(token, JSON.parse(signing.PARTNER_JWKS), { partnerId: id, operation }).operation, operation);
      assert.equal(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).scope, operation);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      if (operation === 'verify') { assert.ok(Buffer.from(nonce, 'base64url').length >= 16); assert.equal(globalThis.storedNonce, nonce); } else assert.equal(nonce, undefined);
    }
  }
  nonceStore = false;
  const unstored = await route({ id: 'server-user', operations: ['verify'] });
  assert.equal((await unstored(request('verify'))).status, 500);
  const login = await handler(request('login', { email: 'spoofed@example.com', partnerUserId: 'attacker' }));
  assert.equal(login.status, 200);
  const { token } = await login.json(); const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  assert.equal(claims.email, 'server@example.com'); assert.equal(claims.partnerUserId, undefined); assert.equal(claims.scope, undefined);
  assert.equal((await handler(request('arbitrary'))).status, 400);
});

test('generated auth adapter validates AIR login tokens and same-site requests', async t => {
  if (!module.stripTypeScriptTypes) { t.skip('Needs TypeScript stripping'); return; }
  const root = workspace(t);
  // Stub jose: a token names the key set that holds its kid, or the error that set raises.
  const fakeJose = `const createRemoteJWKSet = url => url.href;
const jwtVerify = async (token, keySet) => {
  const t = JSON.parse(Buffer.from(token, 'base64url').toString());
  if (t.error) { const e = new Error(t.error); e.code = t.error; throw e; }
  if (t.keySet !== keySet) { const e = new Error('no key'); e.code = 'ERR_JWKS_NO_MATCHING_KEY'; throw e; }
  return { payload: t.payload };
};`;
  const source = fs.readFileSync(path.join(skill, 'assets/air-token-auth.ts'), 'utf8')
    .replace('import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";', fakeJose)
    .replace('/* AIR_TOKEN_OPERATIONS */', '"issue"');
  write(root, 'adapter.mjs', module.stripTypeScriptTypes(source, { mode: 'strip' }));
  const original = { ...process.env };
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); });
  Object.assign(process.env, { PARTNER_ID: id, NEXT_PUBLIC_BUILD_ENV: 'sandbox' });
  const { authorizeAirToken, isSameSiteRequest, storeVerificationNonce, consumeVerificationNonce } = await import(pathToFileURL(path.join(root, 'adapter.mjs')).href);
  const token = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accountSet = 'https://account.sandbox-testnet.air3.com/.well-known/jwks.json';
  const request = (bearer, headers = { 'sec-fetch-site': 'same-origin' }) => new Request('https://localhost:3000/api/partner-jwt', { method: 'POST', headers: { ...headers, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } });

  assert.equal(await authorizeAirToken(request()), null);
  const valid = token({ keySet: accountSet, payload: { partnerId: id, sub: 'air-user-1' } });
  assert.deepEqual(await authorizeAirToken(request(valid)), { id: 'air-user-1', operations: ['issue'] });
  assert.equal(await authorizeAirToken(request(token({ keySet: accountSet, payload: { partnerId: 'other', sub: 'u' } }))), null);
  assert.equal(await authorizeAirToken(request(token({ keySet: accountSet, payload: { partnerId: id, sub: '' } }))), null);
  assert.equal(await authorizeAirToken(request(token({ error: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' }))), null);
  assert.equal(await authorizeAirToken(request(valid, { 'sec-fetch-site': 'cross-site' })), null);

  // Behind a tunnel: request.url is localhost, the browser Origin is the public host.
  const tunnel = { origin: 'https://abc.trycloudflare.com', 'x-forwarded-host': 'abc.trycloudflare.com', host: 'localhost:3000' };
  assert.equal(isSameSiteRequest(request(null, tunnel)), true);
  assert.equal(isSameSiteRequest(request(null, { ...tunnel, origin: 'https://evil.example' })), false);
  assert.equal(isSameSiteRequest(request(null, { host: 'localhost:3000' })), false);

  const user = { id: 'u', operations: ['verify'] };
  assert.equal(await storeVerificationNonce(user, 'n'), false);
  assert.equal(await consumeVerificationNonce(user), null);
});

test('configured nonstandard app paths are included in context and audit', t => {
  const root = workspace(t); init(root, 'verifier', ['--frontend', 'next', '--web-dir', 'client/custom']); run(root, 'keys', ['--env', 'sandbox']);
  assert.deepEqual(collectSignals(root).secrets.missing, []);
  write(root, 'client/custom/.env.local', upsertEnv(fs.readFileSync(path.join(root, 'client/custom/.env.local'), 'utf8'), { NEXT_PUBLIC_API_KEY: 'test-only-value' }));
  assert.equal(detect(root).some(item => item.id === 'public-secret-prefix' && item.file === 'client/custom/.env.local'), true);
});
