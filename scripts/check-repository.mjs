import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /(?:^|\/)(?:test-logs|test-output|payway-output|payway-data|webhook_data|node_modules|\.next|\.release-audit)\/|(?:^|\/)\.env(?:\.(?!example$)[^/]*)?$|(?:^|\/)profiles\.json$/;
const failures = tracked.filter(file => forbidden.test(file)).map(file => `Captured/generated/private file tracked: ${file}`);
const docs = ['README.md', 'QUICKSTART.md', 'CONTRIBUTING.md', 'SUPPORT.md', 'SECURITY.md', 'docs/README.md', 'docs/RELEASE_CHECKLIST.md', 'docs/SDK-AND-CLI-REFERENCE.md', 'docs/FIRST-PAYMENT-WALKTHROUGH.md', 'docs/HISTORY-SECRET-TRIAGE.md', 'docs/RELEASE-READINESS.md'];
for (const file of docs) {
  const content = readFileSync(path.join(root, file), 'utf8');
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    let target = match[1].replace(/^<|>$/g, '').split('#')[0].split('?')[0];
    if (!target) continue;
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
