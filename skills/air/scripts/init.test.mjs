import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseLabeledMarkdown } from './lib/partner.mjs';
import { parseEnvFile } from './lib/secrets.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'init.mjs');

function run(args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd });
}

describe('init.mjs', () => {
  it('writes existing / database / frontend fields', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-init-'));
    const result = run([
      '--role', 'issuer',
      '--partner-id', '11111111-1111-4111-8111-111111111111',
      '--db', 'none',
      '--frontend', 'none',
      '--project', dir,
    ], dir);
    assert.equal(result.status, 0, result.stderr);
    const fields = parseLabeledMarkdown(fs.readFileSync(path.join(dir, 'PARTNER.md'), 'utf8'));
    assert.equal(fields.Role, 'issuer');
    assert.equal(fields['Existing partner'], 'no');
    assert.equal(fields.Database, 'none');
    assert.equal(fields.Frontend, 'none');
    const example = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
    assert.match(example, /^NODE_ENV=sandbox/m);
    assert.equal(example.includes('AIR_API_ORIGIN'), false);
    assert.equal(example.includes('IDEN3_METHOD'), false);
    assert.doesNotMatch(example, /^SEED=/m);
    assert.match(example, /^PARTNER_JWKS=/m);
    assert.equal(fields['Credential format'], 'SD_JWT_VC');
    assert.equal(fields['Backend branch'], 'main_sd-jwt-vc');
    assert.equal(fields['Issuer registered'], 'no');
  });

  it('allows --existing without --partner-id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-init-ex-'));
    const result = run([
      '--role', 'issuer',
      '--existing',
      '--db', 'docker',
      '--frontend', 'next',
      '--project', dir,
    ], dir);
    assert.equal(result.status, 0, result.stderr);
    const fields = parseLabeledMarkdown(fs.readFileSync(path.join(dir, 'PARTNER.md'), 'utf8'));
    assert.equal(fields['Existing partner'], 'yes');
    assert.equal(fields.Database, 'docker');
    assert.equal(fields.Frontend, 'next');
  });
});

describe('keys.mjs issuer prerequisites', () => {
  it('writes SD-JWT backend env after installation and does not print secrets', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-keys-'));
    const init = run([
      '--role', 'issuer',
      '--partner-id', '11111111-1111-4111-8111-111111111111',
      '--db', 'none',
      '--frontend', 'none',
      '--project', dir,
    ], dir);
    assert.equal(init.status, 0, init.stderr);
    fs.mkdirSync(path.join(dir, 'apps/backend/src/issuer'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'apps/backend/node_modules'), { recursive: true });
    const keys = path.join(path.dirname(fileURLToPath(import.meta.url)), 'keys.mjs');
    const result = spawnSync(process.execPath, [
      keys, '--env', 'sandbox', '--project', dir,
    ], { encoding: 'utf8', cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    const env = parseEnvFile(fs.readFileSync(path.join(dir, 'apps', 'backend', '.env'), 'utf8'));
    for (const secret of [env.PARTNER_PRIVATE_KEY_DER, env.API_KEY, env.ADMIN_API_KEY]) assert.equal(result.stdout.includes(secret), false);
    assert.equal(env.NODE_ENV, 'sandbox');
    assert.equal(env.DATABASE_URL, '');
    assert.equal(env.ISSUER_ORIGIN, 'http://localhost:3000');
    assert.equal(env.SEED, undefined);
    assert.ok(env.PARTNER_PRIVATE_KEY_DER);
    assert.equal(env.PARTNER_PRIVATE_KEY_ALG, 'ES256');
    assert.ok(env.PARTNER_JWKS);
    assert.equal(env.SD_JWT_JWKS, undefined);
    assert.equal(env.PARTNER_PUBLIC_KEY, undefined);
    assert.equal(env.AIR_API_ORIGIN, undefined);
    assert.match(result.stdout, /issuer-did/);
    assert.match(result.stdout, /ISSUER_ORIGIN/);
  });

  it('refuses generate when Existing partner is yes, even with --force', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-keys-ex-'));
    const init = run([
      '--role', 'issuer',
      '--existing',
      '--db', 'none',
      '--frontend', 'none',
      '--project', dir,
    ], dir);
    assert.equal(init.status, 0, init.stderr);
    fs.mkdirSync(path.join(dir, 'apps/backend/src/issuer'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'apps/backend/node_modules'), { recursive: true });
    const keys = path.join(path.dirname(fileURLToPath(import.meta.url)), 'keys.mjs');
    const result = spawnSync(process.execPath, [
      keys, '--env', 'sandbox', '--force', '--project', dir,
    ], { encoding: 'utf8', cwd: dir });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Import the existing partner/);
    assert.equal(result.stderr.includes('0x'), false);
  });
});
