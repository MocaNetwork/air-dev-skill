#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadPartner, needsIssuer, roleOf, updatePartnerFields } from './lib/partner.mjs';
import { backendDir, hasIssuerBackend } from './lib/layout.mjs';
import { assertSandbox } from './lib/environment.mjs';
import { ASSETS, parseArgs, projectRoot, readText, writeText } from './lib/project.mjs';
import { parseEnvFile } from './lib/secrets.mjs';
import { metadataFile, normalizeSpec, registerSchema, registerVctController, schemaClass, typeMetadata, vctFor } from './lib/vct.mjs';

function usage(code = 2) {
  process.stderr.write(`Usage:
  node vct.mjs plan --spec air/credentials/<name>.json [--replace] [--json]
      Writes the Type Metadata, serves it from the issuer backend (vctHosting "issuer"),
      and prints the Dashboard "SD-JWT VCT details" values: Title, Description, VCT, VCT JSON.
  node vct.mjs schema --spec air/credentials/<name>.json --schema-id <dashboard-schema-id> [--rehost]
      Writes and registers the issuer backend schema class and records the IDs. --rehost rewrites the vct
      of an existing class and PARTNER.md after ISSUER_ORIGIN moved to a new host.
  node vct.mjs --check <vct-url> [--spec <file>]
      Confirms the vct URL serves matching Type Metadata.
`);
  process.exit(code);
}

function load(root, flags) {
  if (!flags.spec) usage(2);
  const specFile = path.relative(root, path.resolve(root, String(flags.spec)));
  const raw = readText(path.join(root, specFile));
  if (!raw) throw new Error(`Credential spec ${specFile} not found.`);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${specFile} is not valid JSON.`); }
  const spec = normalizeSpec(parsed);
  const backend = backendDir(root);
  const backendEnv = parseEnvFile(readText(path.join(backend, '.env')));
  assertSandbox(root, 'sandbox', backendEnv);
  const vct = vctFor(spec, backendEnv.ISSUER_ORIGIN);
  return { spec, specFile, backend, vct, metadata: typeMetadata(spec, vct) };
}

function listField(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(item => item && !/^(pending|none|unknown)$/i.test(item));
}

function plan(root, flags) {
  const partner = loadPartner(root);
  if (!partner.exists) throw new Error('Run /air init first.');
  if (!needsIssuer(roleOf(partner.fields))) throw new Error('Credential types are created by issuer roles.');
  const { spec, specFile, backend, vct, metadata } = load(root, flags);
  const published = listField(partner.fields['Credential types (vct)']).includes(vct);
  const notes = [];

  const target = spec.vctHosting === 'issuer'
    ? path.join(backend, metadataFile(spec))
    : path.join(root, 'air', metadataFile(spec));
  if (spec.vctHosting === 'issuer' && !hasIssuerBackend(root)) throw new Error('Issuer-hosted vct URLs need the issuer backend; run /air issue first.');
  const existing = readText(target);
  if (existing && !isDeepStrictEqual(JSON.parse(existing), metadata)) {
    if (published) throw new Error(`${vct} is already published in the Dashboard; its Type Metadata cannot change. Increase "version" in ${specFile} for a new credential type.`);
    if (!flags.replace) throw new Error(`${path.relative(root, target)} already exists with different content. Pass --replace if it was never published.`);
  }
  writeText(target, `${JSON.stringify(metadata, null, 2)}\n`);

  if (spec.vctHosting === 'issuer') {
    const controller = path.join(backend, 'src', 'vct.controller.ts');
    if (!fs.existsSync(controller)) writeText(controller, fs.readFileSync(path.join(ASSETS, 'vct.controller.ts'), 'utf8'));
    const moduleFile = path.join(backend, 'src', 'app.module.ts');
    const updated = registerVctController(readText(moduleFile) || '');
    if (updated === null) notes.push('Register VctController from src/vct.controller.ts in the backend AppModule controllers; the module did not match the reference layout.');
    else writeText(moduleFile, updated);
    notes.push(`Restart the issuer backend, then run: node <skill-base-dir>/scripts/vct.mjs --check ${vct} --spec ${specFile}`);
    notes.push('Commit the vct/ directory with the backend; the vct URL is permanent once credentials are issued.');
  } else if (spec.vctHosting === 'url') {
    notes.push(`Publish ${path.relative(root, target)} so that GET ${vct} returns it as JSON, then run vct.mjs --check.`);
  } else {
    notes.push('A URN vct is an identifier only; verifiers cannot fetch its Type Metadata. Paste the VCT JSON so the Dashboard can show the claims.');
  }

  const dashboard = { title: spec.title, description: spec.description, vct, vctJson: JSON.stringify(metadata) };
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ specFile, metadataFile: path.relative(root, target), dashboard, notes }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Wrote ${path.relative(root, target)}\n\n`);
  process.stdout.write('Dashboard → Issuer → Schemas → SD-JWT VCT details\n');
  process.stdout.write(`  Title: ${dashboard.title}\n  Description: ${dashboard.description}\n  VCT: ${dashboard.vct}\n  VCT JSON:\n${dashboard.vctJson}\n\n`);
  process.stdout.write(`After Publish, copy the schema ID and run: node <skill-base-dir>/scripts/vct.mjs schema --spec ${specFile} --schema-id <id>\n`);
  for (const note of notes) process.stdout.write(`${note}\n`);
}

function schema(root, flags) {
  const partner = loadPartner(root);
  if (!partner.exists) throw new Error('Run /air init first.');
  const schemaId = String(flags['schema-id'] || '').trim();
  if (!schemaId) usage(2);
  const { spec, specFile, backend, vct } = load(root, flags);
  if (!hasIssuerBackend(root)) throw new Error('No issuer backend at the recorded directory; run /air issue first.');
  const dir = path.join(backend, 'src', 'issuer', 'sd-jwt-vc-schemas');
  const classFile = path.join(dir, `schema_${schemaId}.ts`);
  const written = [];
  const typePath = `/vct/${spec.name}/v${spec.version}`;
  if (fs.existsSync(classFile) && flags.rehost) {
    const text = readText(classFile);
    const updated = text.replace(/public readonly vct = '[^']*';/, `public readonly vct = '${vct}';`);
    if (updated === text && !text.includes(`public readonly vct = '${vct}';`)) throw new Error(`Could not find the vct line in ${path.relative(root, classFile)}; update it to ${vct} manually.`);
    if (updated !== text) { writeText(classFile, updated); written.push(classFile); }
  } else if (fs.existsSync(classFile)) process.stdout.write(`Preserved ${path.relative(root, classFile)}\n`);
  else { writeText(classFile, schemaClass(spec, { schemaId, vct, specFile })); written.push(classFile); }
  const indexFile = path.join(dir, 'index.ts');
  const registered = registerSchema(readText(indexFile) || '', schemaId);
  if (registered === null) process.stdout.write(`Register schema_${schemaId} in ${path.relative(root, indexFile)} manually; it did not match the reference layout.\n`);
  else if (registered !== readText(indexFile)) { writeText(indexFile, registered); written.push(indexFile); }

  const keep = label => listField(partner.fields[label]).filter(item => !(flags.rehost && label === 'Credential types (vct)' && item.endsWith(typePath) && item !== vct));
  const add = (label, value) => [...new Set([...keep(label), value])].join(', ');
  updatePartnerFields(root, { 'Schema IDs': add('Schema IDs', schemaId), 'Credential types (vct)': add('Credential types (vct)', vct) });
  for (const file of written) process.stdout.write(`Wrote ${path.relative(root, file)}\n`);
  process.stdout.write(`Recorded schema ${schemaId} with vct ${vct} in PARTNER.md.\n`);
  process.stdout.write('Next: implement generateCredentialData with the real data source (it fails closed until then), then create the issuance program with the SD_JWT_VC proof type.\n');
}

async function check(root, flags) {
  const url = String(flags.check);
  if (!/^https:\/\//.test(url)) throw new Error('vct URLs must use HTTPS.');
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}.`);
  const document = await response.json().catch(() => null);
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error(`${url} did not return a JSON object.`);
  if (document.vct !== url) throw new Error(`Type Metadata vct is ${document.vct ?? '(missing)'}, expected ${url}.`);
  if (flags.spec) {
    const { metadata } = load(root, flags);
    if (!isDeepStrictEqual(document, metadata)) throw new Error('Served Type Metadata differs from the credential spec; restart or redeploy the backend.');
  }
  process.stdout.write(`${url} serves Type Metadata with ${Array.isArray(document.claims) ? document.claims.length : 0} claims.\n`);
}

async function main() {
  const flags = parseArgs();
  if (flags.help) usage(0);
  const root = path.resolve(flags.project || projectRoot());
  if (flags.check) return check(root, flags);
  if (flags._[0] === 'plan') return plan(root, flags);
  if (flags._[0] === 'schema') return schema(root, flags);
  usage(2);
}

const invoked = process.argv[1] && path.basename(process.argv[1]) === 'vct.mjs';
if (invoked) main().catch(error => { console.error(error.message); process.exitCode = 2; });
