import fs from 'node:fs';
import path from 'node:path';

// Issuer routes AIR calls, as registered in Dashboard → Issuer → Settings. Paths follow
// air-issuer-service@main_sd-jwt-vc and are confirmed against the checked-out backend source.
export const ISSUER_ENDPOINTS = [
  { label: 'Available Credentials API', field: 'availableVcApiUrl', method: 'Post', route: 'available-vc' },
  { label: 'Issue Credential API', field: 'issueVcApiUrl', method: 'Post', route: 'issue-vc' },
  { label: 'Revocation Status API', field: 'revocationStatusApiUrl', method: 'Get', route: 'revocation-status/:nonce' },
];

function sources(dir) {
  const out = [];
  const walk = current => {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); } else if (/\.controller\.ts$|^main\.ts$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.map(file => ({ file, text: fs.readFileSync(file, 'utf8') }));
}

const join = (...parts) => parts.map(part => String(part || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');

/** Resolves each issuer endpoint path from the backend source (global prefix, controller prefix, route). */
export function discoverIssuerRoutes(backend) {
  const files = sources(path.join(backend, 'src'));
  const prefix = files.map(({ text }) => text.match(/setGlobalPrefix\(\s*['"`]([^'"`]*)['"`]/)?.[1]).find(value => value !== undefined) || '';
  return ISSUER_ENDPOINTS.map(endpoint => {
    for (const { file, text } of files) {
      const decorator = new RegExp(`@${endpoint.method}\\(\\s*['"\`]/?${endpoint.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\s*\\)`);
      if (!decorator.test(text)) continue;
      const controller = text.match(/@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/)?.[1] || '';
      return { ...endpoint, path: `/${join(prefix, controller, endpoint.route)}`, file: path.relative(backend, file), verified: true };
    }
    return { ...endpoint, path: `/${join(prefix, endpoint.route)}`, verified: false };
  });
}

/** Full Dashboard URLs for the issuer endpoints under ISSUER_ORIGIN. */
export function issuerEndpointUrls(origin, routes) {
  const base = String(origin).trim().replace(/\/+$/, '');
  return routes.map(route => ({ ...route, url: `${base}${route.path}` }));
}
