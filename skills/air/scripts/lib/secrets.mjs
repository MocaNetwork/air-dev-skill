import { createPrivateKey, generateKeyPairSync, randomBytes } from 'node:crypto';

export const SECRET_KEYS = [
  'PARTNER_PRIVATE_KEY_DER',
  'API_KEY',
  'ADMIN_API_KEY',
];

export const BACKEND_ENV_KEYS = [
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
];

// Iden3-era settings. The SD-JWT issuer service (main_sd-jwt-vc) ignores them; the
// helpers detect them but never generate, convert, or remove them.
export const LEGACY_IDEN3_KEYS = ['SEED', 'IDEN3_METHOD'];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMPORT_REQUIRED = [
  'PARTNER_ID',
  'PARTNER_PRIVATE_KEY_KID',
  'PARTNER_PRIVATE_KEY_DER',
  'API_KEY',
  'ADMIN_API_KEY',
];

export function generateSecrets({ kid, alg = 'ES256', issuer = true } = {}) {
  if (alg !== 'ES256') {
    throw new Error('keys.mjs generates ES256 (P-256) only, matching air-issuer-service bin/generate-secrets; import an existing RSA key instead.');
  }
  if (!kid) {
    throw new Error('kid is required');
  }
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const der = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const { d: _d, ...jwk } = privateKey.export({ format: 'jwk' });
  const jwks = { keys: [{ ...jwk, use: 'sig', alg: 'ES256', kid }] };

  return {
    PARTNER_PRIVATE_KEY_KID: kid,
    PARTNER_PRIVATE_KEY_ALG: 'ES256',
    PARTNER_PRIVATE_KEY_DER: der,
    PARTNER_JWKS: JSON.stringify(jwks),
    ...(issuer ? { API_KEY: randomBytes(32).toString('hex'), ADMIN_API_KEY: randomBytes(32).toString('hex') } : {}),
  };
}

export function jwksFromDer(der, kid) {
  const key = createPrivateKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'pkcs8' });
  const jwk = key.export({ format: 'jwk' });
  delete jwk.d;
  delete jwk.p;
  delete jwk.q;
  delete jwk.dp;
  delete jwk.dq;
  delete jwk.qi;
  if (jwk.kty !== 'RSA' && !(jwk.kty === 'EC' && jwk.crv === 'P-256')) throw new Error('Only RSA and P-256 partner keys are supported.');
  const alg = jwk.kty === 'RSA' ? 'RS256' : 'ES256';
  return JSON.stringify({ keys: [{ ...jwk, use: 'sig', alg, kid }] });
}

export function algFromDer(der, kid = 'kid') {
  return JSON.parse(jwksFromDer(der, kid)).keys[0].alg;
}

/** Public JWKS from either the current or the fallback variable name. */
export function partnerJwks(env = {}) {
  return env.PARTNER_JWKS || env.SD_JWT_JWKS || '';
}

export function legacyIden3Keys(env = {}) {
  return LEGACY_IDEN3_KEYS.filter(key => env[key] && !String(env[key]).startsWith('{{'));
}

export function algFromJwks(jwks) {
  try {
    const parsed = typeof jwks === 'string' ? JSON.parse(unwrapQuotes(jwks)) : jwks;
    return parsed?.keys?.[0]?.alg || 'ES256';
  } catch {
    return 'ES256';
  }
}

export function unwrapQuotes(value) {
  const s = String(value ?? '');
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

export function formatEnvValue(key, value) {
  if (value == null) return '';
  const raw = String(value);
  if (key === 'PARTNER_JWKS' || key === 'SD_JWT_JWKS') {
    const unquoted = unwrapQuotes(raw);
    return `'${unquoted}'`;
  }
  return raw;
}

export function parseEnvFile(text) {
  const out = {};
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq)] = unwrapQuotes(line.slice(eq + 1));
  }
  return out;
}

export function upsertEnv(text, values) {
  const lines = text ? text.split(/\r?\n/) : [];
  const seen = new Set();
  const next = lines.map((line) => {
    const eq = line.indexOf('=');
    if (eq === -1 || line.trimStart().startsWith('#')) return line;
    const key = line.slice(0, eq);
    if (!(key in values)) return line;
    seen.add(key);
    return `${key}=${formatEnvValue(key, values[key])}`;
  });
  for (const [key, value] of Object.entries(values)) {
    if (seen.has(key)) continue;
    next.push(`${key}=${formatEnvValue(key, value)}`);
  }
  return `${next.filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n').replace(/\n*$/, '')}\n`;
}

export function renderBackendEnv(values) {
  const v = values || {};
  return [
    `NODE_ENV=${v.NODE_ENV || 'sandbox'}`,
    '',
    '# Optional in sandbox; required for revocation, issuance history and the token status list',
    `DATABASE_URL=${v.DATABASE_URL ?? ''}`,
    '# Stable public HTTPS origin. The issuer DID is did:web:<host of this origin>.',
    `ISSUER_ORIGIN=${v.ISSUER_ORIGIN || 'http://localhost:3000'}`,
    '',
    `PARTNER_ID=${v.PARTNER_ID || ''}`,
    `PARTNER_PRIVATE_KEY_KID=${v.PARTNER_PRIVATE_KEY_KID || ''}`,
    `PARTNER_PRIVATE_KEY_ALG=${v.PARTNER_PRIVATE_KEY_ALG || 'ES256'}`,
    `PARTNER_PRIVATE_KEY_DER=${v.PARTNER_PRIVATE_KEY_DER || ''}`,
    `PARTNER_JWKS=${formatEnvValue('PARTNER_JWKS', v.PARTNER_JWKS || '')}`,
    '#SD_JWT_TSL_PARTITION_SIZE=80000',
    '',
    `API_KEY=${v.API_KEY || ''}`,
    `ADMIN_API_KEY=${v.ADMIN_API_KEY || ''}`,
    '',
    '# AIR_API_ORIGIN and MOCA_CHAIN_API_ORIGIN default per NODE_ENV',
    '',
  ].join('\n');
}

export function pickBackendEnv(values) {
  const out = {};
  for (const key of BACKEND_ENV_KEYS) {
    if (values[key] !== undefined) out[key] = values[key];
  }
  return out;
}

export function importPartnerEnv(env, { issuer = true } = {}) {
  const required = issuer ? IMPORT_REQUIRED : ['PARTNER_ID', 'PARTNER_PRIVATE_KEY_KID', 'PARTNER_PRIVATE_KEY_DER'];
  const missing = required.filter((key) => !env[key] || String(env[key]).startsWith('{{'));
  if (missing.length) {
    throw new Error(`Imported env is missing: ${missing.join(', ')}`);
  }
  if (!UUID_RE.test(String(env.PARTNER_ID).trim())) {
    throw new Error('PARTNER_ID must be the Dashboard UUID');
  }
  if (!String(env.PARTNER_PRIVATE_KEY_DER).trim()) {
    throw new Error('PARTNER_PRIVATE_KEY_DER is empty');
  }

  let jwks = partnerJwks(env) ? unwrapQuotes(partnerJwks(env)) : '';
  if (!jwks) {
    jwks = jwksFromDer(env.PARTNER_PRIVATE_KEY_DER, env.PARTNER_PRIVATE_KEY_KID);
  } else {
    const published = JSON.parse(jwks);
    const expected = JSON.parse(jwksFromDer(env.PARTNER_PRIVATE_KEY_DER, env.PARTNER_PRIVATE_KEY_KID)).keys[0];
    const actual = published.keys?.find(key => key.kid === expected.kid);
    if (!actual || ['kty', 'crv', 'x', 'y', 'n', 'e'].some(field => actual[field] !== expected[field])
      || (actual.alg && actual.alg !== expected.alg)) throw new Error('Imported JWKS does not match the signing key and kid.');
    if (published.keys.some(key => ['d', 'p', 'q', 'dp', 'dq', 'qi'].some(field => field in key))) throw new Error('JWKS must contain public keys only.');
  }

  const alg = algFromDer(String(env.PARTNER_PRIVATE_KEY_DER).trim());
  if (env.PARTNER_PRIVATE_KEY_ALG && env.PARTNER_PRIVATE_KEY_ALG !== alg) {
    throw new Error(`PARTNER_PRIVATE_KEY_ALG is ${env.PARTNER_PRIVATE_KEY_ALG}, but the private key is ${alg}.`);
  }

  return {
    PARTNER_ID: String(env.PARTNER_ID).trim(),
    PARTNER_PRIVATE_KEY_KID: String(env.PARTNER_PRIVATE_KEY_KID).trim(),
    PARTNER_PRIVATE_KEY_ALG: alg,
    PARTNER_PRIVATE_KEY_DER: String(env.PARTNER_PRIVATE_KEY_DER).trim(),
    PARTNER_JWKS: jwks,
    API_KEY: env.API_KEY,
    ADMIN_API_KEY: env.ADMIN_API_KEY,
    DATABASE_URL: env.DATABASE_URL,
    ISSUER_ORIGIN: env.ISSUER_ORIGIN,
    NODE_ENV: env.NODE_ENV,
    ignoredLegacy: legacyIden3Keys(env),
  };
}

export function secretPresence(env) {
  const present = [];
  const missing = [];
  for (const key of SECRET_KEYS) {
    if (env[key] && !String(env[key]).startsWith('{{')) present.push(key);
    else missing.push(key);
  }
  return { present, missing };
}

export function redact(value) {
  if (!value) return '(missing)';
  const s = String(value);
  if (s.length <= 8) return '********';
  return `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`;
}
