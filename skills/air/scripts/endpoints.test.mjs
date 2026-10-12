import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { discoverIssuerRoutes, issuerEndpointUrls } from './lib/endpoints.mjs';

function backend(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-endpoints-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

describe('issuer endpoints', () => {
  it('resolves the reference routes from controller source', t => {
    const root = backend(t, {
      'src/main.ts': 'await app.listen(3000);',
      'src/app.controller.ts': "@Controller()\nexport class AppController {\n  @UseGuards(ApiKeyGuard)\n  @Post('available-vc')\n  a() {}\n  @Post('issue-vc')\n  b() {}\n  @Get('revocation-status/:nonce')\n  c() {}\n}",
    });
    const urls = issuerEndpointUrls('https://issuer.example.com/', discoverIssuerRoutes(root));
    assert.deepEqual(urls.map(item => [item.label, item.url, item.verified]), [
      ['Available Credentials API', 'https://issuer.example.com/available-vc', true],
      ['Issue Credential API', 'https://issuer.example.com/issue-vc', true],
      ['Revocation Status API', 'https://issuer.example.com/revocation-status/:nonce', true],
    ]);
  });

  it('applies global and controller prefixes, and flags missing routes', t => {
    const root = backend(t, {
      'src/main.ts': "app.setGlobalPrefix('api');",
      'src/issuer/issuer.controller.ts': "@Controller('issuer')\nclass X {\n  @Post('available-vc')\n  a() {}\n}",
    });
    const [available, issue] = issuerEndpointUrls('https://issuer.example.com', discoverIssuerRoutes(root));
    assert.equal(available.url, 'https://issuer.example.com/api/issuer/available-vc');
    assert.equal(issue.verified, false);
  });
});
