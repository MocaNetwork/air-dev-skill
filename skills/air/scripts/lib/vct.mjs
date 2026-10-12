// SD-JWT VC credential types: a project spec (air/credentials/<name>.json) becomes
// the Dashboard "SD-JWT VCT details" values, IETF SD-JWT VC Type Metadata, and an
// air-issuer-service@main_sd-jwt-vc schema class.

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CLAIM_SEGMENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const TYPES = ['string', 'number', 'boolean'];
// Set by the issuer service; never part of credential claims.
export const RESERVED_CLAIMS = ['cnf', 'exp', 'iat', 'id', 'iss', 'nonce', 'status', 'sub', 'vct', 'vct#integrity', 'nbf', '_sd', '_sd_alg'];
export const VCT_JSON_MAX_BYTES = 65536; // Dashboard limit
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 500;

/** Validates a credential spec and returns a normalized copy. Throws with every problem found. */
export function normalizeSpec(spec) {
  const problems = [];
  const s = spec && typeof spec === 'object' ? spec : {};
  const name = String(s.name ?? '');
  if (!NAME_RE.test(name)) problems.push('name must be lowercase letters, digits and hyphens (for example "membership")');
  const version = Number(s.version ?? 1);
  if (!Number.isInteger(version) || version < 1 || version > 9999) problems.push('version must be a positive integer');
  const title = String(s.title ?? '').trim();
  if (!title || title.length > TITLE_MAX) problems.push(`title is required, at most ${TITLE_MAX} characters`);
  const description = String(s.description ?? '').trim();
  if (!description || description.length > DESCRIPTION_MAX) problems.push(`description is required, at most ${DESCRIPTION_MAX} characters`);
  const locale = String(s.locale ?? 'en-US');
  const hosting = String(s.vctHosting ?? 'issuer');
  if (!['issuer', 'url', 'urn'].includes(hosting)) problems.push('vctHosting must be issuer, url or urn');
  if (hosting === 'url' && !/^https:\/\/[^\s/]+\/\S+$/.test(String(s.vct ?? ''))) problems.push('vctHosting "url" needs vct set to the HTTPS URL that will serve the Type Metadata');
  if (hosting === 'urn' && !/^urn:[A-Za-z0-9][A-Za-z0-9-]{0,31}:\S+$/.test(String(s.vct ?? ''))) problems.push('vctHosting "urn" needs vct set to a collision-resistant URN, for example urn:example:credential:membership:v1');
  const expiryDays = Number(s.expiryDays ?? 365);
  if (!Number.isInteger(expiryDays) || expiryDays < 1) problems.push('expiryDays must be a positive integer');

  const claims = [];
  const seen = new Set();
  if (!Array.isArray(s.claims) || !s.claims.length) problems.push('claims must list at least one claim');
  for (const [index, raw] of (Array.isArray(s.claims) ? s.claims : []).entries()) {
    const where = `claims[${index}]`;
    const path = String(raw?.path ?? '');
    const segments = path.split('.');
    if (!path || segments.some(segment => !CLAIM_SEGMENT_RE.test(segment))) { problems.push(`${where}.path must be a claim name or dotted path such as address.city`); continue; }
    if (RESERVED_CLAIMS.includes(segments[0])) problems.push(`${where}.path "${path}" is reserved; the issuer service sets it`);
    if (seen.has(path)) problems.push(`${where}.path "${path}" is duplicated`);
    for (let i = 1; i < segments.length; i++) {
      if (seen.has(segments.slice(0, i).join('.'))) problems.push(`${where}.path "${path}" is nested under a claim that is already a value`);
    }
    seen.add(path);
    const type = String(raw?.type ?? 'string');
    if (!TYPES.includes(type)) problems.push(`${where}.type must be one of ${TYPES.join(', ')}`);
    const label = String(raw?.label ?? '').trim();
    if (!label) problems.push(`${where}.label is required; wallets and the Dashboard show it`);
    const sd = String(raw?.sd ?? 'always');
    if (!['always', 'never'].includes(sd)) problems.push(`${where}.sd must be "always" (holder may disclose it on its own) or "never" (always visible)`);
    claims.push({ path, segments, type, label, description: raw?.description ? String(raw.description) : undefined, sd, mandatory: raw?.mandatory !== false });
  }
  for (const claim of claims) {
    if (claims.some(other => other.path.startsWith(`${claim.path}.`))) problems.push(`claim "${claim.path}" is both a value and a parent object`);
  }
  if (problems.length) throw new Error(`Invalid credential spec:\n  - ${problems.join('\n  - ')}`);
  return { name, version, title, description, locale, vctHosting: hosting, vct: s.vct ? String(s.vct) : undefined, expiryDays, claims };
}

/** The vct claim value. With issuer hosting it is the HTTPS URL served by the issuer backend. */
export function vctFor(spec, issuerOrigin) {
  if (spec.vctHosting !== 'issuer') return spec.vct;
  const origin = String(issuerOrigin || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(origin)) throw new Error('Issuer-hosted vct URLs need the backend ISSUER_ORIGIN set to its public HTTPS origin.');
  return `${origin}/vct/${spec.name}/v${spec.version}`;
}

/** Relative file that the issuer route serves for this spec. */
export function metadataFile(spec) {
  return `vct/${spec.name}/v${spec.version}.json`;
}

/** IETF SD-JWT VC Type Metadata (draft-ietf-oauth-sd-jwt-vc, "Type Metadata"). */
export function typeMetadata(spec, vct) {
  const metadata = {
    vct,
    name: spec.title,
    description: spec.description,
    display: [{ locale: spec.locale, name: spec.title, description: spec.description }],
    claims: spec.claims.map(claim => ({
      path: claim.segments,
      display: [{ locale: spec.locale, label: claim.label, ...(claim.description ? { description: claim.description } : {}) }],
      sd: claim.sd,
      mandatory: claim.mandatory,
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(metadata)).length;
  if (bytes > VCT_JSON_MAX_BYTES) throw new Error(`Type Metadata is ${bytes} bytes; the Dashboard accepts at most ${VCT_JSON_MAX_BYTES}.`);
  return metadata;
}

/** @sd-jwt/core DisclosureFrame: "always" claims are selectively disclosable, "never" claims stay visible. */
export function disclosureFrame(spec) {
  const frame = {};
  for (const claim of spec.claims.filter(item => item.sd === 'always')) {
    let level = frame;
    for (const segment of claim.segments.slice(0, -1)) level = level[segment] ??= {};
    (level._sd ??= []).push(claim.segments.at(-1));
  }
  return frame;
}

function claimType(spec) {
  const tree = {};
  for (const claim of spec.claims) {
    let level = tree;
    for (const segment of claim.segments.slice(0, -1)) level = level[segment] ??= {};
    level[`${claim.segments.at(-1)}${claim.mandatory ? '' : '?'}`] = claim.type;
  }
  const render = (node, depth) => {
    const pad = '  '.repeat(depth);
    return `{\n${Object.entries(node).map(([key, value]) => `${pad}  ${key}: ${typeof value === 'string' ? value : render(value, depth + 1)};`).join('\n')}\n${pad}}`;
  };
  return render(tree, 0);
}

export function schemaClassName(schemaId) {
  if (!/^[A-Za-z0-9]{1,64}$/.test(schemaId)) throw new Error('Schema ID must be the alphanumeric ID shown by the Dashboard after publishing.');
  return `Schema_${schemaId}`;
}

/** air-issuer-service@main_sd-jwt-vc schema class. Claims loading is left to the integrator and fails closed. */
export function schemaClass(spec, { schemaId, vct, specFile }) {
  const className = schemaClassName(schemaId);
  return `import { DisclosureFrame } from '@sd-jwt/core';
import { BaseSchema } from './base-schema';

// Generated by the AIR skill from ${specFile}.
// Dashboard schema ${schemaId}; vct ${vct}.
type Claim = ${claimType(spec)};

class ${className} extends BaseSchema<Claim> {
  public readonly ['vct#integrity'] = undefined;
  public readonly schemaId = '${schemaId}';
  public readonly vct = '${vct}';
  public readonly disclosureFrame: DisclosureFrame<Claim> = ${JSON.stringify(disclosureFrame(spec))};
  public readonly expirySec = ${spec.expiryDays} * 24 * 60 * 60;

  async generateCredentialData(userId: string): Promise<{ credentialSubject: Claim; expiration: number }> {
    // Load these claims for userId (the partner identifier AIR resolved for the holder)
    // from your own data source, and validate them. Never use browser-supplied values.
    throw new Error(\`${className}: credential data source not implemented for user \${userId}\`);
  }
}

export default new ${className}();
`;
}

/** Adds a schema import and array entry to src/issuer/sd-jwt-vc-schemas/index.ts. Returns null if the file shape is unrecognized. */
export function registerSchema(indexText, schemaId) {
  const className = schemaClassName(schemaId);
  const importLine = `import ${className} from './schema_${schemaId}';`;
  if (indexText.includes(importLine)) return indexText;
  const array = indexText.match(/const schemas: BaseSchema<any>\[\] = \[([^\]]*)\];/);
  if (!array) return null;
  const entries = array[1].split(',').map(entry => entry.trim()).filter(Boolean);
  const lastImport = [...indexText.matchAll(/^import .*;$/gm)].at(-1);
  if (!lastImport) return null;
  const at = lastImport.index + lastImport[0].length;
  const withImport = `${indexText.slice(0, at)}\n${importLine}${indexText.slice(at)}`;
  return withImport.replace(array[0], `const schemas: BaseSchema<any>[] = [${[...entries, className].join(', ')}];`);
}

/** Registers VctController in src/app.module.ts. Returns null if the file shape is unrecognized. */
export function registerVctController(moduleText) {
  if (moduleText.includes('VctController')) return moduleText;
  const controllers = moduleText.match(/controllers: \[([^\]]*)\]/);
  const anchor = "import { WellKnownController } from './well-known.controller';";
  if (!controllers || !moduleText.includes(anchor)) return null;
  const entries = controllers[1].split(',').map(entry => entry.trim()).filter(Boolean);
  return moduleText
    .replace(anchor, `${anchor}\nimport { VctController } from './vct.controller';`)
    .replace(controllers[0], `controllers: [${[...entries, 'VctController'].join(', ')}]`);
}
