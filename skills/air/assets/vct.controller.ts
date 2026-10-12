import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Serves SD-JWT VC Type Metadata at {ISSUER_ORIGIN}/vct/<name>/<version>, the HTTPS vct
// URL in issued credentials. Files live in vct/<name>/<version>.json at the service root.
// Commit them, and never change a published version: issue a new version instead.
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^v[0-9]{1,4}$/;

@Controller('vct')
export class VctController {
  @Get(':name/:version')
  @Header('cache-control', 'public, max-age=300')
  async typeMetadata(@Param('name') name: string, @Param('version') version: string): Promise<unknown> {
    if (!NAME.test(name) || !VERSION.test(version)) throw new NotFoundException();
    try {
      return JSON.parse(await readFile(join(process.cwd(), 'vct', name, `${version}.json`), 'utf8'));
    } catch {
      throw new NotFoundException();
    }
  }
}
