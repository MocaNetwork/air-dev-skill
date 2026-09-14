import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSETS = path.join(SKILL_ROOT, 'assets');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  'coverage',
  'skills',
  'fixtures',
  '__tests__',
  'test',
  'tests',
  'examples',
  '.impeccable',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      flags._.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
      continue;
    }
    flags._.push(token);
  }
  return flags;
}

export function projectRoot(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  let packageRoot;
  while (true) {
    if (fs.existsSync(path.join(dir, 'PARTNER.md'))) return dir;
    if (!packageRoot && fs.existsSync(path.join(dir, 'package.json'))) packageRoot = dir;
    const parent = path.dirname(dir);
    if (parent === dir) return packageRoot || path.resolve(cwd);
    dir = parent;
  }
}

export function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

export function writeText(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents.endsWith('\n') ? contents : `${contents}\n`);
}

export function ensureGitignore(root, entries) {
  const file = path.join(root, '.gitignore');
  const existing = readText(file) ?? '';
  const lines = new Set(existing.split(/\r?\n/).filter(Boolean));
  let changed = false;
  for (const entry of entries) {
    if (!lines.has(entry)) {
      lines.add(entry);
      changed = true;
    }
  }
  if (changed) {
    writeText(file, `${[...lines].join('\n')}\n`);
  }
  return changed;
}

export function walkFiles(root, { exts, maxFiles = 4000 } = {}) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.env.local' && entry.name !== '.env.example') {
        if (entry.isDirectory()) continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) stack.push(full);
        continue;
      }
      if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      if (exts && !exts.some((ext) => entry.name.endsWith(ext))) continue;
      out.push(full);
    }
  }
  return out;
}

export function rel(root, file) {
  return path.relative(root, file) || file;
}

export function isPlaceholder(value) {
  if (!value) return true;
  const v = String(value).trim();
  return v === '' || v === '-' || v === 'pending' || v.startsWith('(') || v.startsWith('{{') || v.includes('REPLACE') || v.includes('your-');
}
