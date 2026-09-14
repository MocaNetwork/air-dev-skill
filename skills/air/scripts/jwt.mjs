#!/usr/bin/env node
import path from 'node:path';
import { backendEnvPath, webEnvPath } from './lib/layout.mjs';
import { parseArgs, projectRoot, readText } from './lib/project.mjs';
import { parseEnvFile } from './lib/secrets.mjs';
import { signPartnerToken } from './lib/jwt-sign.mjs';

try {
  const flags = parseArgs();
  if (flags.help) console.log('jwt --scope issue|verify [--exp 300] [--env-file <file>] [--project <dir>]\nLocal diagnostic tokens only. Custom login tokens belong in an authenticated server endpoint.');
  else {
    const root = path.resolve(flags.project || projectRoot());
    const env = flags['env-file'] ? parseEnvFile(readText(path.resolve(root, flags['env-file']))) : {
      ...parseEnvFile(readText(backendEnvPath(root))),
      ...parseEnvFile(readText(webEnvPath(root))),
    };
    if (!['issue', 'verify'].includes(flags.scope)) throw new Error('--scope issue|verify is required.');
    console.log(JSON.stringify(signPartnerToken(env, { operation: flags.scope, expiresIn: Number(flags.exp || 300) }), null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 2; }
