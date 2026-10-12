// Mirrors DidService.getIssuerDid() in air-issuer-service@main_sd-jwt-vc
// (src/services/did.service.ts): the issuer DID is did:web:<host of ISSUER_ORIGIN>.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function deriveIssuerDid(origin) {
  const url = new URL(String(origin || '').trim().replace(/\/+$/, ''));
  const host = url.port ? `${url.hostname}%3A${url.port}` : url.hostname;
  return `did:web:${host}`;
}

/** Throws unless the origin can serve a resolvable did:web document to AIR and verifiers. */
export function assertPublicIssuerOrigin(origin) {
  let url;
  try {
    url = new URL(String(origin || '').trim());
  } catch {
    throw new Error('ISSUER_ORIGIN is missing or not a URL.');
  }
  if (url.protocol !== 'https:' || LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`ISSUER_ORIGIN must be the stable public HTTPS origin of the issuer service (got ${url.origin}). The did:web issuer DID is derived from its host.`);
  }
  if (url.pathname.replace(/\/+$/, '') !== '') {
    throw new Error('ISSUER_ORIGIN must be an origin without a path.');
  }
  return url;
}

export function didDocumentUrl(did) {
  const [host, ...segments] = did.slice('did:web:'.length).split(':');
  const origin = `https://${host.replace(/%3A/gi, ':')}`;
  return segments.length ? `${origin}/${segments.join('/')}/did.json` : `${origin}/.well-known/did.json`;
}

export function isLegacyIden3Did(did) {
  return /^did:air:/.test(String(did || '').trim());
}

/** Checks a fetched DID document against the expected DID and signing kid. */
export function checkDidDocument(document, { did, kid }) {
  const problems = [];
  if (document?.id !== did) problems.push(`DID document id is ${document?.id ?? '(missing)'}, expected ${did}`);
  const expected = `${did}#${kid}`;
  const refs = (document?.assertionMethod ?? []).map(ref => (typeof ref === 'string' ? ref : ref?.id));
  if (kid && !refs.includes(expected)) problems.push(`assertionMethod does not include ${expected}`);
  return problems;
}
