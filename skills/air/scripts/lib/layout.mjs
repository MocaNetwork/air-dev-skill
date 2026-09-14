import fs from 'node:fs';
import path from 'node:path';
import { loadPartner } from './partner.mjs';

export function backendDir(root, explicit) {
  if (explicit) return path.resolve(root, explicit);
  const configured = loadPartner(root).fields['Backend directory'];
  if (configured && configured !== 'none') return path.resolve(root, configured);
  const apps = path.join(root, 'apps', 'backend');
  if (fs.existsSync(path.join(apps, 'package.json')) || fs.existsSync(path.join(apps, 'src', 'issuer'))) {
    return apps;
  }
  if (
    fs.existsSync(path.join(root, 'src', 'issuer'))
    || fs.existsSync(path.join(root, 'src', 'mikro-orm.config.ts'))
    || fs.existsSync(path.join(root, 'mikro-orm.config.ts'))
  ) {
    return root;
  }
  return apps;
}

export function hasIssuerBackend(root) {
  const dir = backendDir(root);
  return (
    fs.existsSync(path.join(dir, 'src', 'issuer'))
    || fs.existsSync(path.join(root, 'src', 'issuer'))
  );
}

export function backendEnvPath(root, explicit) {
  return path.join(backendDir(root, explicit), '.env');
}

export function backendInstalled(root, explicit) {
  return fs.existsSync(path.join(backendDir(root, explicit), 'node_modules'));
}

export function webDir(root) {
  const configured = loadPartner(root).fields['Web directory'];
  if (configured && configured !== 'none') return path.resolve(root, configured);
  const appsWeb = path.join(root, 'apps', 'web');
  if (fs.existsSync(path.join(appsWeb, 'package.json'))) return appsWeb;
  for (const name of ['next.config.ts', 'next.config.js', 'next.config.mjs']) {
    if (fs.existsSync(path.join(root, name))) return root;
  }
  if (fs.existsSync(path.join(root, 'src', 'app')) || fs.existsSync(path.join(root, 'app'))) {
    return root;
  }
  return null;
}

export function webEnvPath(root) {
  const web = webDir(root);
  return web ? path.join(web, '.env.local') : path.join(root, '.env.local');
}

export function wantsFrontend(fields = {}) {
  const value = String(fields.Frontend || '').toLowerCase();
  return value !== 'none';
}

export function existingPartner(fields = {}) {
  return /^(yes|true|done)$/i.test(fields['Existing partner'] || '');
}

export function databaseChoice(fields = {}) {
  const value = String(fields.Database || 'none').toLowerCase();
  if (value === 'docker' || value === 'external' || value === 'none') return value;
  return 'none';
}
