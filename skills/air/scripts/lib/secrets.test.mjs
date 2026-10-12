import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  generateSecrets,
  importPartnerEnv,
  jwksFromDer,
  parseEnvFile,
  renderBackendEnv,
  SECRET_KEYS,
} from './secrets.mjs';

const kid = '11111111-1111-4111-8111-111111111111';

describe('secrets', () => {
  it('generateSecrets returns only SD-JWT issuer service names', () => {
    const secrets = generateSecrets({ kid });
    assert.deepEqual(Object.keys(secrets).sort(), [
      'ADMIN_API_KEY',
      'API_KEY',
      'PARTNER_JWKS',
      'PARTNER_PRIVATE_KEY_ALG',
      'PARTNER_PRIVATE_KEY_DER',
      'PARTNER_PRIVATE_KEY_KID',
    ]);
    assert.equal(secrets.PARTNER_PRIVATE_KEY_KID, kid);
    assert.equal(secrets.PARTNER_PRIVATE_KEY_ALG, 'ES256');
    const jwks = JSON.parse(secrets.PARTNER_JWKS);
    assert.equal(jwks.keys[0].kid, kid);
    assert.equal(jwks.keys[0].alg, 'ES256');
    assert.ok(!('d' in jwks.keys[0]));
    for (const gone of ['SEED', 'SD_JWT_JWKS', 'PARTNER_PRIVATE_KEY', 'PARTNER_PUBLIC_KEY', 'SIGNING_ALGORITHM']) {
      assert.equal(secrets[gone], undefined);
    }
  });

  it('parseEnvFile unwraps quoted JWKS values', () => {
    const env = parseEnvFile("PARTNER_JWKS='{\"keys\":[{\"kid\":\"x\"}]}'\nSD_JWT_JWKS='{\"keys\":[]}'\n");
    assert.equal(JSON.parse(env.PARTNER_JWKS).keys[0].kid, 'x');
    assert.deepEqual(JSON.parse(env.SD_JWT_JWKS).keys, []);
  });

  it('renderBackendEnv matches the main_sd-jwt-vc key list', () => {
    const text = renderBackendEnv({
      NODE_ENV: 'sandbox',
      DATABASE_URL: '',
      ISSUER_ORIGIN: 'https://issuer.example.com',
      PARTNER_ID: 'p',
      PARTNER_PRIVATE_KEY_KID: 'k',
      PARTNER_PRIVATE_KEY_ALG: 'RS256',
      PARTNER_PRIVATE_KEY_DER: 'd',
      PARTNER_JWKS: '{"keys":[]}',
      API_KEY: 'a',
      ADMIN_API_KEY: 'b',
    });
    for (const name of [
      'NODE_ENV',
      'DATABASE_URL',
      'ISSUER_ORIGIN',
      'PARTNER_ID',
      'PARTNER_PRIVATE_KEY_KID',
      'PARTNER_PRIVATE_KEY_ALG',
      'PARTNER_PRIVATE_KEY_DER',
      'PARTNER_JWKS',
      'API_KEY',
      'ADMIN_API_KEY',
    ]) {
      assert.match(text, new RegExp(`^${name}=`, 'm'));
    }
    assert.match(text, /^PARTNER_PRIVATE_KEY_ALG=RS256$/m);
    assert.match(text, /^PARTNER_JWKS='\{"keys":\[\]\}'$/m);
    for (const gone of [/^SEED=/m, /^SD_JWT_JWKS=/m, /IDEN3_METHOD/, /PARTNER_PUBLIC_KEY/, /SIGNING_ALGORITHM/, /^AIR_API_ORIGIN=/m]) {
      assert.doesNotMatch(text, gone);
    }
    assert.match(text, /#SD_JWT_TSL_PARTITION_SIZE=80000/);
  });

  it('importPartnerEnv derives JWKS and algorithm when omitted', () => {
    const generated = generateSecrets({ kid });
    const imported = importPartnerEnv({
      PARTNER_ID: kid,
      PARTNER_PRIVATE_KEY_KID: kid,
      PARTNER_PRIVATE_KEY_DER: generated.PARTNER_PRIVATE_KEY_DER,
      API_KEY: generated.API_KEY,
      ADMIN_API_KEY: generated.ADMIN_API_KEY,
    });
    assert.equal(JSON.parse(imported.PARTNER_JWKS).keys[0].kid, kid);
    assert.equal(jwksFromDer(generated.PARTNER_PRIVATE_KEY_DER, kid), imported.PARTNER_JWKS);
    assert.equal(imported.PARTNER_PRIVATE_KEY_ALG, 'ES256');
    assert.deepEqual(imported.ignoredLegacy, []);
  });

  it('importPartnerEnv accepts the SD_JWT_JWKS fallback and reports RSA keys as RS256', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    const imported = importPartnerEnv({
      PARTNER_ID: kid,
      PARTNER_PRIVATE_KEY_KID: 'rsa-1',
      PARTNER_PRIVATE_KEY_DER: der,
      SD_JWT_JWKS: jwksFromDer(der, 'rsa-1'),
    }, { issuer: false });
    assert.equal(imported.PARTNER_PRIVATE_KEY_ALG, 'RS256');
    assert.equal(JSON.parse(imported.PARTNER_JWKS).keys[0].kid, 'rsa-1');
    assert.throws(() => importPartnerEnv({
      PARTNER_ID: kid, PARTNER_PRIVATE_KEY_KID: 'rsa-1', PARTNER_PRIVATE_KEY_DER: der, PARTNER_PRIVATE_KEY_ALG: 'ES256',
    }, { issuer: false }), /PARTNER_PRIVATE_KEY_ALG/);
  });

  it('importPartnerEnv ignores Iden3 settings and reports them', () => {
    const generated = generateSecrets({ kid });
    const imported = importPartnerEnv({ ...generated, PARTNER_ID: kid, SEED: '0x11' });
    assert.equal(imported.SEED, undefined);
    assert.deepEqual(imported.ignoredLegacy, ['SEED']);
  });

  it('SECRET_KEYS lists the SD-JWT issuer secrets', () => {
    assert.deepEqual(SECRET_KEYS, ['PARTNER_PRIVATE_KEY_DER', 'API_KEY', 'ADMIN_API_KEY']);
  });
});
