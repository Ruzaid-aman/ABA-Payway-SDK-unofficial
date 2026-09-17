const fs = require('fs');
const path = require('path');
const repo = process.cwd();
const files = [
  'QUICKSTART.md',
  'README.md',
  'knowledge/customer-module-qr.md',
  'knowledge/overview.md',
  'knowledge/quickstart-1-page.md',
  'knowledge/sdk-cli-reference.md',
  'knowledge/setup.md',
];
const replacements = [
  ['docs/guides/02-prerequisites-and-setup.md#how-to-get-sandbox-credentials','payway-sdk docs setup'],
  ['docs/guides/16-webhook-setup-guide.md#local-webhook-workbench','payway-sdk docs webhook-setup --search "local-webhook-workbench"'],
  ['docs/guides/16-webhook-setup-guide.md','payway-sdk docs webhook-setup'],
  ['docs/guides/17-payment-link.md','payway-sdk docs payment-link'],
  ['docs/guides/QUICK-START-1-PAGER.md','knowledge/quickstart-1-page.md'],
  ['docs/guides/18-transaction-journal.md','payway-sdk docs transaction-journal'],
  ['docs/README.md','payway-sdk docs docs-index'],
  ['examples/first-payment','payway-sdk docs first-payment-walkthrough'],
  ['docs/reference/SDK-AND-CLI-REFERENCE.md','payway-sdk docs sdk-cli-reference'],
  ['docs/guides/FIRST-PAYMENT-WALKTHROUGH.md','payway-sdk docs first-payment-walkthrough'],
  ['docs/guides/12-error-handling-and-debugging.md','payway-sdk docs errors-and-debugging'],
];

files.forEach(f => {
  const p = path.join(repo, f);
  if (!fs.existsSync(p)) return;
  let s = fs.readFileSync(p, 'utf8');
  replacements.forEach(r => { s = s.split(r[0]).join(r[1]); });
  // replace ../../skills/.../SKILL.md -> payway-sdk skills <name>
  s = s.replace(/\.\.\/\.\.\/skills\/(aba-payway-[^/]+)\/SKILL\.md/g, 'payway-sdk skills $1');
  fs.writeFileSync(p, s, 'utf8');
  console.log('Patched', f);
});
