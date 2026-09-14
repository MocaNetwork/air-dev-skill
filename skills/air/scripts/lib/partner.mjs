import fs from 'node:fs';
import path from 'node:path';
import { ASSETS, isPlaceholder, readText, writeText } from './project.mjs';

const LABEL_RE = /^([-*]\s+)([^:]+):\s*(.*)$/;

export function parseLabeledMarkdown(text) {
  const fields = {};
  if (!text) return fields;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(LABEL_RE);
    if (!match) continue;
    fields[match[2].trim()] = stripTicks(match[3]);
  }
  return fields;
}

export function stripTicks(value) {
  return String(value ?? '').replace(/`/g, '').trim();
}

export function setLabeledField(text, label, value) {
  const lines = text.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    const match = line.match(LABEL_RE);
    if (!match || match[2].trim() !== label) return line;
    found = true;
    return `${match[1]}${label}: ${value}`;
  });
  if (!found) {
    throw new Error(`No "${label}" field in markdown`);
  }
  return next.join('\n');
}

export function fillTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

export function partnerPath(root) {
  return path.join(root, 'PARTNER.md');
}

export function airPath(root) {
  return path.join(root, 'AIR.md');
}

export function loadPartner(root) {
  const file = partnerPath(root);
  const text = readText(file);
  return {
    file,
    exists: Boolean(text),
    text: text ?? '',
    fields: parseLabeledMarkdown(text),
  };
}

export function loadAir(root) {
  const file = airPath(root);
  const text = readText(file);
  return {
    file,
    exists: Boolean(text),
    text: text ?? '',
    fields: parseLabeledMarkdown(text),
  };
}

export function updatePartnerFields(root, updates) {
  const current = loadPartner(root);
  if (!current.exists) {
    throw new Error('PARTNER.md is missing. Run /air init first.');
  }
  let text = current.text;
  for (const [label, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    try {
      text = setLabeledField(text, label, value);
    } catch {
      // Add newly introduced context fields to projects initialized by older versions.
      text = `${text.trimEnd()}\n- ${label}: ${value}\n`;
    }
  }
  writeText(current.file, text);
  return loadPartner(root);
}

export function renderPartnerTemplate(values) {
  const template = fs.readFileSync(path.join(ASSETS, 'PARTNER.md.template'), 'utf8');
  return fillTemplate(template, values);
}

export function renderAirTemplate(values) {
  const template = fs.readFileSync(path.join(ASSETS, 'AIR.md.template'), 'utf8');
  return fillTemplate(template, values);
}

export function roleOf(fields) {
  return (fields.Role || fields.role || '').toLowerCase();
}

export function needsIssuer(role) {
  return role === 'issuer' || role === 'both';
}

export function needsVerifier(role) {
  return role === 'verifier' || role === 'both';
}

export function presentId(fields, label) {
  return !isPlaceholder(fields[label]);
}
