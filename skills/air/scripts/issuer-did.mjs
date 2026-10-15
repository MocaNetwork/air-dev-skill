#!/usr/bin/env node
import path from 'node:path';
import { loadPartner, updatePartnerFields } from './lib/partner.mjs';
import { backendDir, wantsFrontend, webEnvPath } from './lib/layout.mjs';
import { ensureGitignore, parseArgs, projectRoot, readText, writeText } from './lib/project.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { parseEnvFile, upsertEnv } from './lib/secrets.mjs';
import { assertPublicIssuerOrigin, checkDidDocument, deriveIssuerDid, isLegacyIden3Did } from './lib/did.mjs';
import { discoverIssuerRoutes, issuerEndpointUrls } from './lib/endpoints.mjs';

export { deriveIssuerDid };

function usage(code = 2) {
  process.stderr.write(`Usage: node issuer-did.mjs [--check] [--rehost] [--backend <dir>] [--issuer-origin <https-origin>] [--project <dir>]

Derives the did:web issuer DID and the Dashboard endpoint URLs (Available Credentials API,
Issue Credential API, Revocation Status API) from the backend ISSUER_ORIGIN and records them in PARTNER.md.
--check fetches <ISSUER_ORIGIN>/.well-known/did.json, confirms its id and signing kid, and probes the endpoints.
--rehost accepts a new issuer host (sandbox, after a dead tunnel): a new did:web and endpoint URLs, and
issuer registration is marked unconfirmed until the Dashboard is updated.
Never prints private keys or API keys.
`);
  process.exit(code);
}

async function main() {
  const flags = parseArgs();
  if (flags.help) usage(0);

  const root = path.resolve(flags.project || projectRoot());
  const partner = loadPartner(root);
  if (!partner.exists) {
    process.stderr.write('NO_PARTNER_MD: run init first.\n');
    process.exit(2);
  }

  const recorded = String(partner.fields['Issuer DID'] || '').trim();
  if (isLegacyIden3Did(recorded)) {
    throw new Error(`Recorded Issuer DID ${recorded} is an Iden3 identity. The SD-JWT issuer uses did:web; do not replace a registered identity. Iden3: https://docs.air3.com/products/identity/iden3/issuing`);
  }

  const backend = backendDir(root, flags.backend);
  const backendEnv = parseEnvFile(readText(path.join(backend, '.env')));
  assertSandbox(root, 'sandbox', backendEnv);
  const origin = String(flags['issuer-origin'] || backendEnv.ISSUER_ORIGIN || '').trim();
  assertPublicIssuerOrigin(origin);
  if (flags['issuer-origin'] && backendEnv.ISSUER_ORIGIN && flags['issuer-origin'] !== backendEnv.ISSUER_ORIGIN) {
    throw new Error('--issuer-origin differs from the backend ISSUER_ORIGIN. Update the backend configuration first.');
  }
  const did = deriveIssuerDid(origin);
  process.stdout.write(`Issuer DID: ${did}\n`);
  process.stdout.write(`Dashboard → Issuer → Settings → did:web Host: ${didWebHost}\n`);
  process.stdout.write('Enter that host in did:web Host. The field accepts a hostname and rejects a did:web: value.\n');
  process.stdout.write('Dashboard → Issuer → Settings:\n');

  const rehost = Boolean(recorded && recorded !== did);
  if (rehost && !flags.rehost) {
    throw new Error(`Issuer DID mismatch.\n  recorded: ${recorded}\n  from ISSUER_ORIGIN: ${did}\nChanging the issuer host changes the issuer identity; restore the original ISSUER_ORIGIN, or pass --rehost if the old host is gone (for example a dead quick tunnel) and credentials under it can be abandoned.`);
  }

  const endpoints = issuerEndpointUrls(origin, discoverIssuerRoutes(backend));

  if (flags.check) {
    const url = `${origin.replace(/\/+$/, '')}/.well-known/did.json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}. Start the backend and expose ISSUER_ORIGIN over HTTPS.`);
    const problems = checkDidDocument(await response.json(), { did, kid: backendEnv.PARTNER_PRIVATE_KEY_KID });
    if (problems.length) throw new Error(`DID document check failed:\n  ${problems.join('\n  ')}`);
    process.stdout.write(`Verified ${url}\n`);
    for (const endpoint of endpoints) {
      // Unauthenticated probes: guarded routes answer 401/403, a missing route answers 404.
      const probe = endpoint.method === 'Post'
        ? await fetch(endpoint.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) })
        : await fetch(endpoint.url.replace(':nonce', 'preflight-probe'), { signal: AbortSignal.timeout(10000) });
      if (probe.status === 404 || probe.status >= 500) throw new Error(`${endpoint.label} ${endpoint.url} returned HTTP ${probe.status}.`);
      process.stdout.write(`Reachable ${endpoint.label} (HTTP ${probe.status} without credentials)\n`);
    }
  }

  updatePartnerFields(root, {
    'Issuer DID': did,
    'Issuer origin': origin.replace(/\/+$/, ''),
    ...Object.fromEntries(endpoints.map(endpoint => [endpoint.label, endpoint.url])),
    ...(rehost ? { 'Issuer registered': 'no' } : {}),
  });
  ensureGitignore(root, ['.env', '.env.local', '.env.*.local', 'apps/backend/.env']);

  const written = ['PARTNER.md'];
  if (wantsFrontend(partner.fields) || readText(webEnvPath(root))) {
    const envFile = webEnvPath(root);
    writeText(envFile, upsertEnv(readText(envFile) ?? '', { NEXT_PUBLIC_ISSUER_DID: did }));
    written.push(envFile);
  }

  const didWebHost = did.slice('did:web:'.length);
  process.stdout.write(`Issuer DID: ${did}\n`);
  process.stdout.write(`Dashboard → Issuer → Settings → did:web Host: ${didWebHost}\n`);
  process.stdout.write('Enter that host in did:web Host.\n');
  process.stdout.write('Dashboard → Issuer → Settings:\n');

  for (const endpoint of endpoints) {
    process.stdout.write(`  ${endpoint.label} (${endpoint.field}): ${endpoint.url}${endpoint.verified ? '' : '  (route not found in backend source; confirm it)'}\n`);
  }
  process.stdout.write(`Wrote Issuer DID and endpoint URLs to ${written.join(' and ')}\n`);
  if (!flags.check) process.stdout.write('Run with --check once the backend is reachable to confirm /.well-known/did.json.\n');
  if (rehost) {
    process.stdout.write(`\nRehosted from ${recorded}. Issuer registration is now unconfirmed. Update together:\n`);
    process.stdout.write(`  - Dashboard → Issuer → Settings: set did:web Host to ${didWebHost} and replace the three URLs above\n`);
    process.stdout.write('  - Credential types hosted on the issuer origin: vct.mjs plan --replace, then vct.mjs schema --rehost, then register the new VCT in the Dashboard\n');
    process.stdout.write('  - If the web host changed too: provision.mjs write-ids --jwks-url <new> --jwks-registered no --domain-whitelisted no, then update the Dashboard JWKS URL and domain\n');
  }
}

const invoked = process.argv[1] && path.basename(process.argv[1]) === 'issuer-did.mjs';
if (invoked) main().catch(error => { console.error(error.message); process.exitCode = 2; });
