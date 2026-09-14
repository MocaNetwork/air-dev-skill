import { loadAir, loadPartner } from './partner.mjs';

// Automated writes currently support sandbox only. A flag must never relabel
// existing keys or IDs as belonging to a different network.
export function assertSandbox(root, requested = 'sandbox', env = {}) {
  if (requested !== 'sandbox') throw new Error('Automated setup supports sandbox only. Use a separate project and the production playbook for mainnet.');
  const partner = loadPartner(root).fields;
  const air = loadAir(root).fields;
  if (/production|mainnet/i.test(`${partner.Networks || ''} ${air.BUILD_ENV || ''} ${air.credentialNetwork || ''}`)
    || (env.NODE_ENV && env.NODE_ENV !== 'sandbox')
    || (env.NEXT_PUBLIC_BUILD_ENV && env.NEXT_PUBLIC_BUILD_ENV.toLowerCase() !== 'sandbox')) {
    throw new Error('This configuration is not sandbox. No files were changed; keep production identity and keys in a separate project.');
  }
}
