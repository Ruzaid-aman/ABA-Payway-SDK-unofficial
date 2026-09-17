import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const moved = [
  'docs/guides/01-overview-and-concepts.md',
  'docs/guides/02-prerequisites-and-setup.md',
  'docs/guides/03-web-implementation.md',
  'docs/guides/04-native-app-implementation.md',
  'docs/guides/05-webview-implementation.md',
  'docs/guides/06-telegram-mini-app.md',
  'docs/guides/07-qr-code-handling.md',
  'docs/guides/08-deep-linking.md',
  'docs/guides/09-link-unlink-renew-lifecycle.md',
  'docs/guides/10-ui-customization.md',
  'docs/guides/11-callbacks-and-webhooks.md',
  'docs/guides/12-error-handling-and-debugging.md',
  'docs/guides/13-deployment-checklist.md',
  'docs/guides/14-appendix-code-snippets.md',
  'docs/guides/15-merchant-scenario-requirements.md',
  'docs/guides/16-webhook-setup-guide.md',
  'docs/guides/17-payment-link.md',
  'docs/guides/18-transaction-journal.md',
  'docs/guides/19-customer-module-qr.md',
  'docs/guides/20-settlement-and-disputes.md',
  'docs/guides/21-storage-service.md',
  'docs/guides/22-api-datetime-and-timezones.md',
  'docs/guides/FIRST-PAYMENT-WALKTHROUGH.md',
  'docs/guides/QUICK-START-1-PAGER.md',
  'docs/guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md',
  'docs/guides/AGENT-SETUP-PLAYBOOK.md',
  'docs/guides/VISUAL-GUIDE.md',
  'docs/reference/SDK-AND-CLI-REFERENCE.md',
  'docs/reference/glossary.md',
  'docs/reference/SANDBOX-BENEFICIARIES.md',
  'docs/recipes/cloudflare-free-webhook.md',
  'docs/recipes/callback-capture-recipe.md',
  'docs/internal/SANDBOX-FINDINGS.md',
  'docs/internal/CLOSE-TRANSACTION-FINDINGS.md',
  'docs/internal/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md',
  'docs/project/PROJECT_STATUS.md',
  'docs/project/MAINTENANCE.md',
  'docs/project/RELEASE-READINESS.md',
  'docs/project/RELEASE_CHECKLIST.md',
  'docs/project/VERSIONING.md',
  'docs/project/PRODUCTION-VERIFICATION-PLAN.md',
  'docs/project/MUTATION-SPIKE-2026-08-31.md',
  'docs/project/HISTORY-SECRET-TRIAGE.md',
  'docs/project/aba-payway-test-case-coverage.md',
  'docs/strategy/STRIPE-STANDARD-DX-AUDIT.md',
  'docs/strategy/building-a-payway-sdk-cto-workflow-and-strategy.md',
  'docs/strategy/competitive-analysis-cutluy.md',
  'docs/strategy/competitive-analysis-cli-stripe-razorpay.md',
  'docs/strategy/competitive-analysis-canadia.md',
];

const depthMap = {
  'guides': 1,
  'reference': 1,
  'recipes': 1,
  'internal': 1,
  'project': 1,
  'strategy': 1,
};

function getGroup(dir) {
  for (const [g, d] of Object.entries(depthMap)) {
    if (dir.includes('/' + g + '/')) return g;
  }
  return null;
}

function fixLinks(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  const group = getGroup(dir);
  if (!group) return;
  const extra = depthMap[group];
  const linkRegex = /\]\(([^)]+)\)/g;
  let changed = false;
  let newContent = content;

  const match = [...content.matchAll(linkRegex)];
  for (const m of match) {
    const fullMatch = m[0];
    const u = m[1].trim().replace(/^<|>$/g, '');
    if (!u || u.startsWith('#') || /^[a-z]+:/i.test(u) || u.startsWith('payway-sdk ')) continue;

    // Count leading ../
    let prefix = '';
    let rest = u;
    while (rest.startsWith('../')) { prefix += '../'; rest = rest.slice(3); }
    if (rest.startsWith('./')) { prefix += './'; rest = rest.slice(2); }

    let newLink;
    if (prefix) {
      // Add extra ../ for each depth level
      newLink = prefix + '../'.repeat(extra) + rest;
    } else if (rest.startsWith('/')) {
      newLink = u; // absolute path, skip
    } else {
      // Local path without prefix - add ../ for the depth
      newLink = '../'.repeat(extra) + u;
    }

    // Verify the resolved path exists
    const absPath = path.resolve(dir, newLink.split('#')[0].split('?')[0]);
    if (!existsSync(absPath)) {
      // Try with ./ for the same directory case
      const altPath = path.resolve(dir, u);
      if (existsSync(altPath)) continue; // original was valid
    }

    if (newLink !== u) {
      newContent = newContent.replace(fullMatch, '](' + newLink + ')');
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(filePath, newContent, 'utf8');
    console.log(`${filePath}: links adjusted`);
  }
}

for (const f of moved) {
  fixLinks(f);
}