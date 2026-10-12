import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveIssuerDid } from './issuer-did.mjs';
import { assertPublicIssuerOrigin, checkDidDocument, didDocumentUrl, isLegacyIden3Did } from './lib/did.mjs';

describe('issuer-did', () => {
  it('derives did:web exactly like the SD-JWT issuer service', () => {
    assert.equal(deriveIssuerDid('https://issuer.example.com'), 'did:web:issuer.example.com');
    assert.equal(deriveIssuerDid('https://issuer.example.com/'), 'did:web:issuer.example.com');
    assert.equal(deriveIssuerDid(' https://issuer.example.com:8443 '), 'did:web:issuer.example.com%3A8443');
  });

  it('requires a public HTTPS origin without a path', () => {
    for (const origin of ['http://issuer.example.com', 'https://localhost:3000', 'https://127.0.0.1', 'https://issuer.example.com/api', '']) {
      assert.throws(() => assertPublicIssuerOrigin(origin));
    }
    assert.equal(assertPublicIssuerOrigin('https://issuer.example.com').hostname, 'issuer.example.com');
  });

  it('resolves did:web documents and checks id and kid', () => {
    assert.equal(didDocumentUrl('did:web:issuer.example.com%3A8443'), 'https://issuer.example.com:8443/.well-known/did.json');
    const did = 'did:web:issuer.example.com';
    assert.deepEqual(checkDidDocument({ id: did, assertionMethod: [`${did}#k1`] }, { did, kid: 'k1' }), []);
    assert.equal(checkDidDocument({ id: 'did:web:other', assertionMethod: [] }, { did, kid: 'k1' }).length, 2);
  });

  it('recognizes Iden3 identities as legacy', () => {
    assert.equal(isLegacyIden3Did('did:air:id:testnet:2AbC'), true);
    assert.equal(isLegacyIden3Did('did:web:issuer.example.com'), false);
  });
});
