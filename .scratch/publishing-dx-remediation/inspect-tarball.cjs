// Item-1c acceptance inspection: exact npm pack dry-run vs content boundary.
// Evidence log: .scratch/publishing-dx-remediation/tarball-inspection.json
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..', '..');
const npmExecPath = process.env.npm_execpath;
const args = npmExecPath
  ? [npmExecPath, 'pack', '--dry-run', '--json', '--ignore-scripts']
  : ['pack', '--dry-run', '--json', '--ignore-scripts'];
const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const r = spawnSync(command, args, {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: !npmExecPath && process.platform === 'win32',
});
if (r.status !== 0) throw new Error(`npm pack failed: ${r.stderr || r.stdout}`);
const parsed = JSON.parse(r.stdout);
const report = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
const files = report.files.map((f) => f.path.split('\\').join('/'));
const dossier = files.filter((f) => /close-transaction-findings/i.test(f));
const publicGuide = files.filter((f) => f === 'knowledge/close-transaction.md');
const knowledge = files.filter((f) => f.startsWith('knowledge/')).length;
const internal = files.filter((f) => /^docs\/internal\//i.test(f));
const dossierMentions = [];
for (const f of files) {
  if (!/\.(md|json|txt|ts|cts)$/.test(f) || f.endsWith('.d.ts') || f.endsWith('.d.cts')) continue;
  const abs = path.join(repoRoot, ...f.split('/'));
  if (!fs.existsSync(abs)) continue;
  const content = fs.readFileSync(abs, 'utf8');
  if (/CLOSE-TRANSACTION-FINDINGS\.md/i.test(content)) dossierMentions.push(f);
}
const result = {
  inspectedAt: new Date().toISOString(),
  packShape: Array.isArray(parsed) ? 'npm<=11 array' : 'npm12 object',
  totalFiles: files.length,
  dossierFilesInTarball: dossier,
  publicCloseTransactionGuide: publicGuide.length === 1 ? 'PRESENT' : 'MISSING',
  knowledgeTopicFiles: knowledge - 1,
  docsInternalPaths: internal,
  filesMentioningDossierFilename: dossierMentions,
};
fs.writeFileSync(path.join(__dirname, 'tarball-inspection.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
