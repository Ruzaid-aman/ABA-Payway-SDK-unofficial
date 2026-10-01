import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /(?:^|\/)(?:test-logs|test-output|payway-output|payway-data|webhook_data|node_modules|\.next|\.release-audit)\/|(?:^|\/)\.env(?:\.(?!example$)[^/]*)?$|(?:^|\/)profiles\.json$/;
const failures = tracked.filter(file => forbidden.test(file)).map(file => `Captured/generated/private file tracked: ${file}`);

// `payway-sdk docs <topic>` link destinations are resolved at runtime by the
// docs command, not by the filesystem — validate the topic against the
// generated knowledge manifest instead of treating them as paths (audit R01).
let knowledgeTopics = null;
try {
  const manifest = JSON.parse(readFileSync(path.join(root, 'knowledge', 'MANIFEST.json'), 'utf8'));
  knowledgeTopics = new Set(manifest.topics.map((topic) => topic.topic));
} catch {
  failures.push('knowledge/MANIFEST.json missing or unparseable — run `npm run sync:knowledge`');
}

// Canonical entry-point registry (2026-09 docs reorganization layout:
// docs/guides, docs/reference, docs/recipes, docs/project). When a document
// moves, update this registry — the check validates the CURRENT paths (audit
// R01: the pre-reorganization paths here threw ENOENT and killed the gate).
const docs = [
  'README.md',
  'QUICKSTART.md',
  'CONTRIBUTING.md',
  'SUPPORT.md',
  'SECURITY.md',
  'docs/README.md',
  'docs/project/RELEASE_CHECKLIST.md',
  'docs/project/RELEASE-READINESS.md',
  'docs/project/HISTORY-SECRET-TRIAGE.md',
  'docs/reference/SDK-AND-CLI-REFERENCE.md',
  'docs/guides/FIRST-PAYMENT-WALKTHROUGH.md',
];
for (const file of docs) {
  let content;
  try {
    content = readFileSync(path.join(root, file), 'utf8');
  } catch {
    // Verify every required entry document — collect all missing inputs as
    // actionable failures instead of stopping at the first missing file.
    failures.push(
      `${file}: required entry document missing — move it back or update the docs registry in scripts/check-repository.mjs`,
    );
    continue;
  }
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    let target = match[1].replace(/^<|>$/g, '').split('#')[0].split('?')[0];
    if (!target) continue;
    if (target.startsWith('payway-sdk ')) {
      const docsLink = target.match(/^payway-sdk docs\s+(.+)$/);
      if (docsLink && knowledgeTopics) {
        const rest = docsLink[1].trim();
        if (/^list\b/.test(rest)) continue;
        if (/^search\b/.test(rest)) continue;
        if (/--search/.test(rest)) {
          failures.push(`${file}: docs link uses unsupported --search syntax — use "payway-sdk docs search <terms>"`);
          continue;
        }
        const topic = rest.split(/\s+/)[0];
        if (!knowledgeTopics.has(topic)) failures.push(`${file}: docs link targets unknown knowledge topic "${topic}"`);
      } else if (!docsLink) {
        failures.push(`${file}: unvalidated CLI command used as link destination: ${target}`);
      }
      continue;
    }
    const github = target.match(/^https:\/\/github\.com\/antigravity-google\/aba-payway-ts\/(?:blob|tree)\/([^/]+)\/(.+)$/);
    if (github) {
      if (github[1] !== 'main') {
        try { execFileSync('git', ['rev-parse', '--verify', `refs/tags/${github[1]}`], { cwd: root, stdio: 'pipe' }); }
        catch { failures.push(`${file}: link targets missing local tag ${github[1]}`); }
      }
      target = path.resolve(root, decodeURIComponent(github[2]));
    } else if (/^[a-z]+:/i.test(target)) continue;
    else target = path.resolve(root, path.dirname(file), decodeURIComponent(target));
    if (!existsSync(target)) failures.push(`${file}: missing link target ${path.relative(root, target)}`);
  }
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Repository boundary passed: ${tracked.length} tracked paths and ${docs.length} entry-point documents. History, secret content, external URLs, and redistribution rights require separate review.`);
