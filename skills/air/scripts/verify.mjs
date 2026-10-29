#!/usr/bin/env node
import path from 'node:path';
import { loadPartner, needsVerifier, roleOf } from './lib/partner.mjs';
import { parseArgs, projectRoot } from './lib/project.mjs';
import { collectSignals } from './context.mjs';

function main() {
  const flags = parseArgs();
  const root = path.resolve(flags.project || projectRoot());
  const partner = loadPartner(root);
  if (!partner.exists) {
    process.stderr.write('NO_PARTNER_MD: run init first.\n');
    process.exit(2);
  }

  const role = roleOf(partner.fields);
  const f = partner.fields;
  const presentationCheck = collectSignals(root).scan.hasPresentationCheck;
  process.stdout.write(`Configuration checklist only; this does not test live verification.\n`);
  process.stdout.write(`Verification checklist (${role || 'unset'})\n`);
  process.stdout.write(`- Partner ID present: ${Boolean(f['Partner ID'])}\n`);
  process.stdout.write(`- did:web Host saved (Issuer → Settings): ${f['DID host saved'] === 'yes' || f['Issuer registered'] === 'yes' ? 'yes' : '(not confirmed — a new account cannot create a verification program until it is saved; verifier-only uses the app domain)'}\n`);
  process.stdout.write(`- Verification program IDs: ${f['Verification program IDs'] || '(missing — Dashboard → Verifier → Programs)'}\n`);
  process.stdout.write(`- JWKS URL: ${f['JWKS URL'] || '(needed: AIR validates the verify-scoped Partner JWT against it)'}\n`);
  process.stdout.write(`- Trusted issuers: ${f['Trusted issuers'] || '(missing — did:web issuer DIDs your backend accepts)'}\n`);
  process.stdout.write(`- Expected credential type (vct): ${f['Credential types (vct)'] || '(missing)'}\n`);
  process.stdout.write(`- Backend SD-JWT presentation check: ${presentationCheck ? 'present' : '(missing — jwks.mjs emit writes verify-air-sd-jwt.ts and the verify-presentation route)'}\n`);
  process.stdout.write(`- No issuer backend required for verifier-only\n`);
  process.stdout.write(`- SDK path: airService.verifyCredential({ authToken, programId, fieldsToDisclose, nonce }); token carries scope "verify"; nonce comes from your backend\n`);
  process.stdout.write(`- Then POST result.verifiablePresentation to your backend, verify issuer signature, disclosures, vct, KB-JWT nonce/aud/iat, and consume the nonce\n`);
  process.stdout.write(`- Agent path: POST /credentials/verify-by-agent — use air-agentic-wallet-skill scripts\n`);
  process.stdout.write(`- Same network as the issuer: sandbox credentials are invisible on mainnet\n`);

  const incomplete = !f['Partner ID'] || !f['Verification program IDs'] || !/^https:\/\//.test(f['JWKS URL'] || '')
    || f['JWKS registered'] !== 'yes' || !presentationCheck;
  if (flags.check && needsVerifier(role) && incomplete) process.exit(1);
}

main();
