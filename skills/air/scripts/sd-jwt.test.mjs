import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePresentation, didDocumentUrl, extractCompact, verifyPresentation } from './lib/sd-jwt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DID = 'did:web:issuer.example.com%3A8443';
const VCT = 'https://issuer.example.com:8443/vct/membership/v1';
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const digest = text => createHash('sha256').update(text).digest('base64url');
const jws = (header, payload, key) => {
  const data = `${b64(header)}.${b64(payload)}`;
  return `${data}.${sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
};

function fixture({ nonce = 'n-1', aud = 'prog-1', withKb = true } = {}) {
  const issuer = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const holder = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const disclosures = Object.fromEntries([['tier', 'gold'], ['member_since', '2024-01-01'], ['over_18', true]]
    .map(([name, value]) => [name, b64([`salt-${name}`, name, value])]));
  const { kty, crv, x, y } = holder.publicKey.export({ format: 'jwk' });
  const now = Math.floor(Date.now() / 1000);
  const issuerJwt = jws({ alg: 'ES256', typ: 'dc+sd-jwt', kid: `${DID}#key-1` }, {
    iss: DID, sub: 'did:air:holder', vct: VCT, iat: now, exp: now + 3600, nonce: '42', cnf: { jwk: { kty, crv, x, y } },
    _sd_alg: 'sha-256', _sd: Object.values(disclosures).map(digest),
  }, issuer.privateKey);
  const presented = `${issuerJwt}~${disclosures.tier}~${disclosures.over_18}~`;
  const kb = jws({ alg: 'ES256', typ: 'kb+jwt' }, { nonce, aud, iat: now, sd_hash: digest(presented) }, holder.privateKey);
  const compact = withKb ? `${presented}${kb}` : presented;
  const issuerJwk = issuer.publicKey.export({ format: 'jwk' });
  const didDocument = {
    id: DID,
    verificationMethod: [{ id: `${DID}#key-1`, type: 'JsonWebKey2020', controller: DID, publicKeyJwk: issuerJwk }],
    assertionMethod: [`${DID}#key-1`],
  };
  const result = { status: 'Compliant', verifiablePresentation: { verifiableCredential: [{ id: `data:application/dc+sd-jwt,${compact}` }] } };
  return { compact, didDocument, result, disclosures };
}

const expect = { issuers: [DID], vct: VCT, programId: 'prog-1', nonce: 'n-1', requireHolderBinding: true };
const failed = rows => rows.filter(r => !r.ok).map(r => r.check);

test('extracts the SD-JWT from a result, a presentation, a data URL, or a compact token', () => {
  const { compact, result } = fixture();
  assert.equal(extractCompact(JSON.stringify(result)), compact);
  assert.equal(extractCompact(JSON.stringify(result.verifiablePresentation)), compact);
  assert.equal(extractCompact(`data:application/vc+sd-jwt,${compact}`), compact);
  assert.equal(extractCompact(compact), compact);
  assert.equal(extractCompact(JSON.stringify({ verifiableCredential: [compact] })), compact);
  assert.throws(() => extractCompact('{"status":"NotFound"}'), /Compliant/);
});

test('reveals only the disclosed claims and counts the hidden ones', () => {
  const decoded = decodePresentation(fixture().compact);
  assert.equal(decoded.claims.tier, 'gold');
  assert.equal(decoded.claims.over_18, true);
  assert.equal('member_since' in decoded.claims, false);
  assert.deepEqual(decoded.disclosed, ['tier', 'over_18']);
  assert.equal(decoded.hidden, 1);
  assert.equal(decoded.kb.payload.sd_hash, decoded.sdHash);
});

test('passes every check for a holder-bound presentation', () => {
  const { compact, didDocument } = fixture();
  assert.deepEqual(failed(verifyPresentation(decodePresentation(compact), didDocument, expect)), []);
});

test('rejects wrong nonce, wrong programId, stripped KB-JWT, tampered disclosure, and wrong issuer key', () => {
  const { compact, didDocument } = fixture();
  const decoded = decodePresentation(compact);
  assert.deepEqual(failed(verifyPresentation(decoded, didDocument, { ...expect, nonce: 'other' })), ['KB-JWT nonce is yours']);
  assert.deepEqual(failed(verifyPresentation(decoded, didDocument, { ...expect, programId: 'other' })), ['KB-JWT aud is your programId']);
  assert.deepEqual(failed(verifyPresentation(decoded, didDocument, { ...expect, issuers: ['did:web:other.example'] })), ['issuer is trusted']);

  const stripped = fixture({ withKb: false });
  assert.deepEqual(failed(verifyPresentation(decodePresentation(stripped.compact), stripped.didDocument, expect)), ['KB-JWT present']);

  const parts = compact.split('~');
  parts[1] = b64(['salt-tier', 'tier', 'platinum']);
  const tampered = decodePresentation(parts.join('~'));
  assert.equal('tier' in tampered.claims, false);
  assert.deepEqual(failed(verifyPresentation(tampered, didDocument, expect)), ['every disclosure is in the signed _sd', 'KB-JWT sd_hash covers these disclosures']);

  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });
  const wrongKey = { ...didDocument, verificationMethod: [{ ...didDocument.verificationMethod[0], publicKeyJwk: other }] };
  assert.deepEqual(failed(verifyPresentation(decoded, wrongKey, expect)), ['issuer signature']);
});

test('resolves did:web document URLs', () => {
  assert.equal(didDocumentUrl(DID), 'https://issuer.example.com:8443/.well-known/did.json');
  assert.equal(didDocumentUrl('did:web:example.com:issuers:a'), 'https://example.com/issuers/a/did.json');
  assert.throws(() => didDocumentUrl('did:air:x'), /did:web/);
});

test('CLI prints the revealed claims and exits non-zero when a check fails', () => {
  const { result, didDocument } = fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-sd-jwt-'));
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result));
  fs.writeFileSync(path.join(dir, 'did.json'), JSON.stringify(didDocument));
  const cli = path.join(HERE, 'sd-jwt.mjs');
  const args = ['inspect', path.join(dir, 'result.json'), '--verify', '--did-doc', path.join(dir, 'did.json'), '--program-id', 'prog-1', '--vct', VCT];
  const ok = execFileSync(process.execPath, [cli, ...args, '--nonce', 'n-1'], { encoding: 'utf8' });
  assert.match(ok, /tier: "gold"\s+\[disclosed\]/);
  assert.match(ok, /1 still hidden/);
  assert.match(ok, /Result: VERIFIED/);
  const bad = spawnSync(process.execPath, [cli, ...args, '--nonce', 'wrong'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /FAIL\s+KB-JWT nonce is yours/);
  fs.rmSync(dir, { recursive: true, force: true });
});
