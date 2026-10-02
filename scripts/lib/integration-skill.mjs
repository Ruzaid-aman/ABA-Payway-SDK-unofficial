import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const hash = content => createHash('sha256').update(content).digest('hex').slice(0, 16);
export const RECIPE_FILES = ['service.ts', 'sqlite-store.ts', 'payway-gateway.ts', 'express.ts', 'next.ts', 'money.ts', 'customer-state.ts', 'settlement.ts', 'evidence.ts'];

// Called only after the public-source provenance gate in sync-knowledge.
// References share canonical public sources with knowledge/docs-packaged.
export function generateIntegrationSkill(root, topics) {
  const base = path.resolve(root, 'skills/aba-payway-integration');
  const references = path.join(base, 'references');
  const assets = path.join(base, 'assets');
  if (path.dirname(references) !== base || path.dirname(assets) !== base) throw new Error('Unsafe skill resource root');
  for (const dir of [references, assets]) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); }
  const names = new Set(topics.map(entry => entry.file));
  const entries = [];
  for (const topic of topics) {
    const sourceContent = readFileSync(path.join(root, 'knowledge', topic.file), 'utf8');
    const content = sourceContent.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (full, label, target) => {
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) return full;
      const [local, anchor] = target.split('#');
      const name = path.posix.basename(local);
      return names.has(name) ? `[${label}](${name}${anchor ? '#' + anchor : ''})` : label;
    });
    const file = 'skills/aba-payway-integration/references/' + topic.file;
    writeFileSync(path.join(root, file), content);
    entries.push({ file, source: topic.source, sourceSha256: topic.sourceSha256, sha256: hash(content) });
  }
  for (const name of RECIPE_FILES) {
    const source = 'examples/integration-recipes/' + name;
    const file = 'skills/aba-payway-integration/assets/' + name;
    const content = readFileSync(path.join(root, source));
    writeFileSync(path.join(root, file), content);
    entries.push({ file, source, sourceSha256: hash(content), sha256: hash(content) });
  }
  const provenance = { schema: 'payway-integration-resources/v1', generator: 'scripts/sync-knowledge.mjs',
    resources: entries.map(entry => ({ ...entry, file: entry.file.replace('skills/aba-payway-integration/', '') })) };
  const manifestFile = 'skills/aba-payway-integration/references/MANIFEST.json';
  const content = JSON.stringify(provenance, null, 2) + '\n';
  writeFileSync(path.join(root, manifestFile), content);
  entries.push({ file: manifestFile, sha256: hash(content) });
  return entries;
}
