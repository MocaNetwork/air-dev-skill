import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { disclosureFrame, normalizeSpec, registerSchema, registerVctController, schemaClass, typeMetadata, vctFor } from './lib/vct.mjs';
import { loadPartner } from './lib/partner.mjs';
import { upsertEnv } from './lib/secrets.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = {
  name: 'membership',
  title: 'Gold membership',
  description: 'Membership tier held by a customer',
  claims: [
    { path: 'tier', label: 'Membership tier' },
    { path: 'points', type: 'number', label: 'Points balance', sd: 'never' },
    { path: 'address.city', label: 'City', mandatory: false },
  ],
};

// Shapes copied from air-issuer-service@main_sd-jwt-vc (1a7cf6b).
const INDEX = `import { BaseSchema } from './base-schema';

import Schema1 from './schema_01KXF7F6Z5XGHXRJY37JEK';

const schemas: BaseSchema<any>[] = [Schema1];

export { BaseSchema, schemas };

export default schemas;
`;
const MODULE = `import { AppController } from './app.controller';
import { WellKnownController } from './well-known.controller';

@Module({
  controllers: [AppController, WellKnownController],
  providers: [DidService],
})
export class AppModule {}
`;

describe('vct', () => {
  it('builds an issuer-hosted vct URL, Type Metadata and disclosure frame', () => {
    const normalized = normalizeSpec(spec);
    const vct = vctFor(normalized, 'https://issuer.example.com/');
    assert.equal(vct, 'https://issuer.example.com/vct/membership/v1');
    const metadata = typeMetadata(normalized, vct);
    assert.equal(metadata.vct, vct);
    assert.deepEqual(metadata.claims.map(claim => claim.path), [['tier'], ['points'], ['address', 'city']]);
    assert.deepEqual(metadata.claims[0].display, [{ locale: 'en-US', label: 'Membership tier' }]);
    assert.deepEqual(disclosureFrame(normalized), { _sd: ['tier'], address: { _sd: ['city'] } });
    assert.throws(() => vctFor(normalized, 'http://localhost:3000'), /HTTPS/);
  });

  it('rejects reserved, duplicate and malformed claims', () => {
    assert.throws(() => normalizeSpec({ ...spec, claims: [{ path: 'sub', label: 'x' }] }), /reserved/);
    assert.throws(() => normalizeSpec({ ...spec, claims: [{ path: 'tier', label: 'a' }, { path: 'tier', label: 'b' }] }), /duplicated/);
    assert.throws(() => normalizeSpec({ ...spec, claims: [{ path: 'a', label: 'a' }, { path: 'a.b', label: 'b' }] }), /value and a parent|nested/);
    assert.throws(() => normalizeSpec({ ...spec, claims: [{ path: 'bad name', label: 'x' }] }), /path/);
    assert.throws(() => normalizeSpec({ ...spec, vctHosting: 'url', vct: 'http://x' }), /HTTPS URL/);
    assert.equal(vctFor(normalizeSpec({ ...spec, vctHosting: 'urn', vct: 'urn:example:credential:membership:v1' })), 'urn:example:credential:membership:v1');
  });

  it('generates a fail-closed schema class and registers it in the reference layout', () => {
    const source = schemaClass(normalizeSpec(spec), { schemaId: 'ABC123', vct: 'https://issuer.example.com/vct/membership/v1', specFile: 'air/credentials/membership.json' });
    assert.match(source, /class Schema_ABC123 extends BaseSchema<Claim>/);
    assert.match(source, /public readonly vct = 'https:\/\/issuer\.example\.com\/vct\/membership\/v1';/);
    assert.match(source, /city\?: string;/);
    assert.match(source, /throw new Error/);
    const registered = registerSchema(INDEX, 'ABC123');
    assert.match(registered, /import Schema_ABC123 from '.\/schema_ABC123';/);
    assert.match(registered, /\[Schema1, Schema_ABC123\]/);
    assert.equal(registerSchema(registered, 'ABC123'), registered);
    assert.equal(registerSchema('export default [];', 'ABC123'), null);
    const module = registerVctController(MODULE);
    assert.match(module, /controllers: \[AppController, WellKnownController, VctController\]/);
    assert.equal(registerVctController(module), module);
  });

  it('plans, hosts and records a credential type end to end', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-vct-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const run = (name, args, ok = true) => {
      const result = spawnSync(process.execPath, [path.join(here, `${name}.mjs`), ...args, '--project', root], { encoding: 'utf8', cwd: root });
      assert.equal(result.status === 0, ok, result.stderr || result.stdout);
      return result;
    };
    const write = (name, text) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };
    run('init', ['--role', 'issuer', '--partner-id', '11111111-1111-4111-8111-111111111111']);
    write('apps/backend/src/issuer/sd-jwt-vc-schemas/index.ts', INDEX);
    write('apps/backend/src/app.module.ts', MODULE);
    fs.mkdirSync(path.join(root, 'apps/backend/node_modules'));
    run('keys', ['--env', 'sandbox']);
    write('air/credentials/membership.json', JSON.stringify(spec));
    run('vct', ['plan', '--spec', 'air/credentials/membership.json'], false); // ISSUER_ORIGIN is still localhost
    const envFile = path.join(root, 'apps/backend/.env');
    fs.writeFileSync(envFile, upsertEnv(fs.readFileSync(envFile, 'utf8'), { ISSUER_ORIGIN: 'https://issuer.example.com' }));

    const planned = JSON.parse(run('vct', ['plan', '--spec', 'air/credentials/membership.json', '--json']).stdout);
    assert.equal(planned.dashboard.vct, 'https://issuer.example.com/vct/membership/v1');
    assert.equal(JSON.parse(planned.dashboard.vctJson).vct, planned.dashboard.vct);
    assert.ok(fs.existsSync(path.join(root, 'apps/backend/vct/membership/v1.json')));
    assert.ok(fs.existsSync(path.join(root, 'apps/backend/src/vct.controller.ts')));
    assert.match(fs.readFileSync(path.join(root, 'apps/backend/src/app.module.ts'), 'utf8'), /VctController\]/);

    run('vct', ['schema', '--spec', 'air/credentials/membership.json', '--schema-id', 'ABC123']);
    assert.ok(fs.existsSync(path.join(root, 'apps/backend/src/issuer/sd-jwt-vc-schemas/schema_ABC123.ts')));
    const fields = loadPartner(root).fields;
    assert.equal(fields['Schema IDs'], 'ABC123');
    assert.equal(fields['Credential types (vct)'], 'https://issuer.example.com/vct/membership/v1');

    // The issuer host moved (dead tunnel): new vct for the same type path.
    fs.writeFileSync(envFile, upsertEnv(fs.readFileSync(envFile, 'utf8'), { ISSUER_ORIGIN: 'https://moved.example.com' }));
    run('vct', ['plan', '--spec', 'air/credentials/membership.json'], false);
    run('vct', ['plan', '--spec', 'air/credentials/membership.json', '--replace']);
    run('vct', ['schema', '--spec', 'air/credentials/membership.json', '--schema-id', 'ABC123', '--rehost']);
    assert.match(fs.readFileSync(path.join(root, 'apps/backend/src/issuer/sd-jwt-vc-schemas/schema_ABC123.ts'), 'utf8'), /vct = 'https:\/\/moved\.example\.com\/vct\/membership\/v1'/);
    assert.equal(loadPartner(root).fields['Credential types (vct)'], 'https://moved.example.com/vct/membership/v1');

    write('air/credentials/membership.json', JSON.stringify({ ...spec, title: 'Changed' }));
    assert.match(run('vct', ['plan', '--spec', 'air/credentials/membership.json', '--replace'], false).stderr, /already published/);
    write('air/credentials/membership.json', JSON.stringify({ ...spec, title: 'Changed', version: 2 }));
    run('vct', ['plan', '--spec', 'air/credentials/membership.json']);
    assert.ok(fs.existsSync(path.join(root, 'apps/backend/vct/membership/v2.json')));
  });
});
