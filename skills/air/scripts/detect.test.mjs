import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { detect } from './detect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('detect', () => {
  it('flags P0 integration failures in the planted fixture', () => {
    const findings = detect(path.join(here, 'fixtures', 'detect-p0'));
    const ids = new Set(findings.map((f) => f.id));
    assert.ok(ids.has('public-secret-prefix'));
    assert.ok(ids.has('jwks-url-field') || ids.has('jwks-localhost') || ids.has('jwks-http'));
    assert.ok(ids.has('issuer-origin-not-https'));
    assert.equal(findings.find((f) => f.id === 'issuer-origin-not-https')?.severity, 'P1');
    assert.ok(ids.has('wrong-header-air-api'));
    assert.ok(ids.has('wrong-header-issuer'));
    assert.ok(ids.has('raw-pii-claim') || ids.has('email-as-claim'));
    assert.ok(ids.has('missing-issue-scope'));
    assert.ok(ids.has('jwt-exp-too-long'));
    assert.ok(ids.has('air-md-network'));
    assert.ok(ids.has('kid-mismatch'));
    assert.equal(findings.find((f) => f.id === 'issuer-did-origin-mismatch')?.severity, 'P0');
    assert.ok(ids.has('verify-without-nonce'));
    assert.ok(ids.has('removed-offchain-option'));
    assert.ok(ids.has('deprecated-verification-fields'));
    assert.ok(findings.some((f) => f.severity === 'P0'));
  });

  it('accepts a clean sandbox issuer fixture', () => {
    const findings = detect(path.join(here, 'fixtures', 'detect-clean'));
    assert.deepEqual(findings, []);
  });
});
