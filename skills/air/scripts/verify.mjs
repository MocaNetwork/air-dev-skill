#!/usr/bin/env node
import path from 'node:path';
import { loadPartner, needsVerifier, roleOf } from './lib/partner.mjs';
import { parseArgs, projectRoot } from './lib/project.mjs';

function main() {
  const flags = parseArgs();
  const root = path.resolve(flags.project || projectRoot());
  const partner = loadPartner(root);
  if (!partner.exists) {
    process.stderr.write('NO_PARTNER_MD: run init first.\n');
    process.exit(2);
  }

  const role = roleOf(partner.fields);
  process.stdout.write(`Configuration checklist only; this does not test live verification.\n`);
  process.stdout.write(`Verification checklist (${role || 'unset'})\n`);
  process.stdout.write(`- Partner ID present: ${Boolean(partner.fields['Partner ID'])}\n`);
  process.stdout.write(`- Verification program IDs: ${partner.fields['Verification program IDs'] || '(missing — Dashboard → Verifier → Programs)'}\n`);
  process.stdout.write(`- JWKS URL: ${partner.fields['JWKS URL'] || '(needed if you sign Partner JWTs for verify APIs)'}\n`);
  process.stdout.write(`- No issuer backend required for verifier-only\n`);
  process.stdout.write(`- SDK path: airService.verifyCredential({ authToken, programId }); token scope is verify\n`);
  process.stdout.write(`- Agent path: POST /credentials/verify-by-agent — use air-agentic-wallet-skill scripts\n`);
  process.stdout.write(`- Same network as the issuer: sandbox credentials are invisible on mainnet\n`);

  if (flags.check && needsVerifier(role) && (!partner.fields['Partner ID'] || !partner.fields['Verification program IDs'] || !/^https:\/\//.test(partner.fields['JWKS URL'] || '') || partner.fields['JWKS registered'] !== 'yes')) {
    process.exit(1);
  }
}

main();
