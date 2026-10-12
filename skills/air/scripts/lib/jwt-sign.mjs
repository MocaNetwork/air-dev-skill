import { createPrivateKey, sign } from 'node:crypto';
import { importPartnerEnv, jwksFromDer } from './secrets.mjs';

export function signPartnerToken(env, { operation, user, expiresIn = 300, now = Math.floor(Date.now() / 1000) }) {
  if (!['issue', 'verify', 'login'].includes(operation)) throw new Error('Operation must be issue, verify or login.');
  if (!Number.isInteger(expiresIn) || expiresIn <= 0 || expiresIn > 900) throw new Error('Token lifetime must be 1–900 seconds.');
  const config = importPartnerEnv({ ...env, PARTNER_ID: env.PARTNER_ID || env.NEXT_PUBLIC_PARTNER_ID }, { issuer: false });
  const alg = JSON.parse(jwksFromDer(config.PARTNER_PRIVATE_KEY_DER, config.PARTNER_PRIVATE_KEY_KID)).keys[0].alg;
  const claims = { partnerId: config.PARTNER_ID, iat: now, exp: now + expiresIn };
  // Issuance tokens carry scope "issue", verification tokens scope "verify"; only login tokens carry email.
  if (operation === 'login') {
    if (!user?.email) throw new Error('Custom login requires an authenticated user email.');
    claims.email = user.email;
  } else claims.scope = operation;
  const header = { alg, kid: config.PARTNER_PRIVATE_KEY_KID, typ: 'JWT' };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode(header)}.${encode(claims)}`;
  const key = createPrivateKey({ key: Buffer.from(config.PARTNER_PRIVATE_KEY_DER, 'base64'), type: 'pkcs8', format: 'der' });
  const signature = sign('sha256', Buffer.from(data), { key, ...(alg === 'ES256' ? { dsaEncoding: 'ieee-p1363' } : {}) });
  return { token: `${data}.${signature.toString('base64url')}`, header, claims };
}
