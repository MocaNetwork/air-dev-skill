#!/usr/bin/env node
import path from 'node:path';
import { backendEnvPath, webEnvPath } from './lib/layout.mjs';
import { parseArgs, projectRoot, readText } from './lib/project.mjs';
import { parseEnvFile } from './lib/secrets.mjs';
import { signPartnerToken } from './lib/jwt-sign.mjs';

try {
  const flags = parseArgs();
  if (flags.help) console.log('jwt --operation issue|verify [--exp 300] [--env-file <file>] [--project <dir>]\nLocal diagnostic tokens only. Issuance tokens carry scope "issue"; verification tokens carry scope "verify". --scope is accepted as an alias. Custom login tokens belong in an authenticated server endpoint.');
  else {
    const root = path.resolve(flags.project || projectRoot());
    const env = flags['env-file'] ? parseEnvFile(readText(path.resolve(root, flags['env-file']))) : {
      ...parseEnvFile(readText(backendEnvPath(root))),
      ...parseEnvFile(readText(webEnvPath(root))),
    };
    const operation = flags.operation || flags.scope;
    if (!['issue', 'verify'].includes(operation)) throw new Error('--operation issue|verify is required.');
    console.log(JSON.stringify(signPartnerToken(env, { operation, expiresIn: Number(flags.exp || 300) }), null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 2; }
