import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const oldToNew = new Map([
  ['docs/01-overview-and-concepts.md', 'docs/guides/01-overview-and-concepts.md'],
  ['docs/02-prerequisites-and-setup.md', 'docs/guides/02-prerequisites-and-setup.md'],
  ['docs/03-web-implementation.md', 'docs/guides/03-web-implementation.md'],
  ['docs/04-native-app-implementation.md', 'docs/guides/04-native-app-implementation.md'],
  ['docs/05-webview-implementation.md', 'docs/guides/05-webview-implementation.md'],
  ['docs/06-telegram-mini-app.md', 'docs/guides/06-telegram-mini-app.md'],
  ['docs/07-qr-code-handling.md', 'docs/guides/07-qr-code-handling.md'],
  ['docs/08-deep-linking.md', 'docs/guides/08-deep-linking.md'],
  ['docs/09-link-unlink-renew-lifecycle.md', 'docs/guides/09-link-unlink-renew-lifecycle.md'],
  ['docs/10-ui-customization.md', 'docs/guides/10-ui-customization.md'],
  ['docs/11-callbacks-and-webhooks.md', 'docs/guides/11-callbacks-and-webhooks.md'],
  ['docs/12-error-handling-and-debugging.md', 'docs/guides/12-error-handling-and-debugging.md'],
  ['docs/13-deployment-checklist.md', 'docs/guides/13-deployment-checklist.md'],
  ['docs/14-appendix-code-snippets.md', 'docs/guides/14-appendix-code-snippets.md'],
  ['docs/15-merchant-scenario-requirements.md', 'docs/guides/15-merchant-scenario-requirements.md'],
  ['docs/16-webhook-setup-guide.md', 'docs/guides/16-webhook-setup-guide.md'],
  ['docs/17-payment-link.md', 'docs/guides/17-payment-link.md'],
  ['docs/18-transaction-journal.md', 'docs/guides/18-transaction-journal.md'],
  ['docs/19-customer-module-qr.md', 'docs/guides/19-customer-module-qr.md'],
  ['docs/20-settlement-and-disputes.md', 'docs/guides/20-settlement-and-disputes.md'],
  ['docs/21-storage-service.md', 'docs/guides/21-storage-service.md'],
  ['docs/22-api-datetime-and-timezones.md', 'docs/guides/22-api-datetime-and-timezones.md'],
  ['docs/AGENT-SETUP-PLAYBOOK.md', 'docs/guides/AGENT-SETUP-PLAYBOOK.md'],
  ['docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md', 'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md'],
  ['docs/FIRST-PAYMENT-WALKTHROUGH.md', 'docs/guides/FIRST-PAYMENT-WALKTHROUGH.md'],
  ['docs/QUICK-START-1-PAGER.md', 'docs/guides/QUICK-START-1-PAGER.md'],
  ['docs/VISUAL-GUIDE.md', 'docs/guides/VISUAL-GUIDE.md'],
  ['docs/SDK-AND-CLI-REFERENCE.md', 'docs/reference/SDK-AND-CLI-REFERENCE.md'],
  ['docs/glossary.md', 'docs/reference/glossary.md'],
  ['docs/SANDBOX-BENEFICIARIES.md', 'docs/reference/SANDBOX-BENEFICIARIES.md'],
  ['docs/cloudflare-free-webhook.md', 'docs/recipes/cloudflare-free-webhook.md'],
  ['docs/agents/callback-capture-recipe.md', 'docs/recipes/callback-capture-recipe.md'],
  ['docs/SANDBOX-FINDINGS.md', 'docs/internal/SANDBOX-FINDINGS.md'],
  ['docs/CLOSE-TRANSACTION-FINDINGS.md', 'docs/internal/CLOSE-TRANSACTION-FINDINGS.md'],
  ['docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md', 'docs/internal/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md'],
  ['docs/PROJECT_STATUS.md', 'docs/project/PROJECT_STATUS.md'],
  ['docs/MAINTENANCE.md', 'docs/project/MAINTENANCE.md'],
  ['docs/RELEASE-READINESS.md', 'docs/project/RELEASE-READINESS.md'],
  ['docs/RELEASE_CHECKLIST.md', 'docs/project/RELEASE_CHECKLIST.md'],
  ['docs/VERSIONING.md', 'docs/project/VERSIONING.md'],
  ['docs/PRODUCTION-VERIFICATION-PLAN.md', 'docs/project/PRODUCTION-VERIFICATION-PLAN.md'],
  ['docs/MUTATION-SPIKE-2026-08-31.md', 'docs/project/MUTATION-SPIKE-2026-08-31.md'],
  ['docs/HISTORY-SECRET-TRIAGE.md', 'docs/project/HISTORY-SECRET-TRIAGE.md'],
  ['docs/aba-payway-test-case-coverage.md', 'docs/project/aba-payway-test-case-coverage.md'],
  ['docs/STRIPE-STANDARD-DX-AUDIT.md', 'docs/strategy/STRIPE-STANDARD-DX-AUDIT.md'],
  ['docs/building-a-payway-sdk-cto-workflow-and-strategy.md', 'docs/strategy/building-a-payway-sdk-cto-workflow-and-strategy.md'],
  ['docs/competitive-analysis-cutluy.md', 'docs/strategy/competitive-analysis-cutluy.md'],
  ['docs/competitive-analysis-cli-stripe-razorpay.md', 'docs/strategy/competitive-analysis-cli-stripe-razorpay.md'],
  ['docs/competitive-analysis-canadia.md', 'docs/strategy/competitive-analysis-canadia.md'],
]);

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'archive' || entry.name === 'test-cases' || entry.name === 'superpowers') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function splitDestination(destination) {
  const match = destination.match(/^([^?#]*)([?#].*)?$/);
  return { path: match[1], suffix: match[2] ?? '' };
}

function isExternal(destination) {
  return !destination || destination.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith('payway-sdk ');
}

function oldTargetFor(oldSource, destination) {
  const normalized = normalize(destination);
  const docsMatch = normalized.match(/(?:^|\/)docs\/.+$/);
  if (docsMatch) return docsMatch[0];
  return path.posix.normalize(path.posix.join(path.posix.dirname(oldSource), normalized));
}

function rewriteFile(file) {
  const relative = normalize(path.relative(root, file));
  if (relative === 'docs/README.md') return;
  const content = readFileSync(path.join(root, relative), 'utf8');
  const linkPattern = /\]\(([^)\r\n]+)\)/g;
  let changed = false;
  const output = content.replace(linkPattern, (full, rawDestination) => {
    const destination = rawDestination.trim().replace(/^<|>$/g, '');
    if (isExternal(destination)) return full;
    const { path: destinationPath, suffix } = splitDestination(destination);
    if (!destinationPath) return full;
    const oldTarget = oldTargetFor(relative, destinationPath);
    const newTarget = oldToNew.get(oldTarget) ?? oldTarget;
    const newRelative = path.posix.relative(path.posix.dirname(relative), newTarget) || '.';
    const rewritten = newRelative + suffix;
    if (rewritten === destination) return full;
    changed = true;
    return `](${rewritten})`;
  });
  if (changed) writeFileSync(path.join(root, relative), output, 'utf8');
}

const processDirs = [
  'docs/guides',
  'docs/reference',
  'docs/recipes',
  'docs/internal',
  'docs/project',
  'docs/strategy',
  'docs/diagrams',
  'docs/agents',
  'src',
  'scripts',
  'examples',
  'sdk',
];
const processFiles = [
  'README.md',
  'QUICKSTART.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/README.md',
  'AGENTS.md',
  'HANDOFF.md',
  '.agents/AGENTS.md',
];

for (const dir of processDirs) {
  const full = path.join(root, dir);
  if (existsSync(full)) for (const file of walk(full)) rewriteFile(file);
}
for (const relative of processFiles) {
  const full = path.join(root, relative);
  if (existsSync(full)) rewriteFile(full);
}
