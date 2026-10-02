import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
function files(root, relative = '') {
  return readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? files(root, child) : [[child.replaceAll('\\', '/'), digest(path.join(root, child))]];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}
if (process.argv[2] === '--verify') {
  const trial = path.resolve(process.argv[3]);
  assert.deepEqual(files(path.join(trial, 'merchant')), JSON.parse(readFileSync(path.join(trial, 'before.json'), 'utf8')));
  console.log('PASS: all merchant and installed-skill files unchanged.');
} else {
  const trial = mkdtempSync(path.join(tmpdir(), 'payway-skill-usage-'));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const report = JSON.parse(execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', trial], {
    cwd: process.cwd(), encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 10_000_000,
  }));
  const packed = Array.isArray(report) ? report[0] : Object.values(report)[0];
  const archive = path.join(trial, packed.filename);
  const extracted = path.join(trial, 'extracted');
  mkdirSync(extracted);
  execFileSync('tar', ['-xzf', archive, '-C', extracted]);
  const merchant = path.join(trial, 'merchant');
  mkdirSync(merchant);
  cpSync(path.join(extracted, 'package/skills/aba-payway-integration'), path.join(merchant, '.agents/skills/aba-payway-integration'), { recursive: true });
  writeFileSync(path.join(merchant, 'merchant-context.txt'),
    'Synthetic existing Express invoicing project; TypeScript/Node server, PostgreSQL durable order storage, authenticated customers, server-owned USD invoice totals. No existing PayWay configuration or confirmed merchant enablement. Customers may pay inside the app or from an emailed invoice URL. No actual credentials or gateway calls are available.\n');
  writeFileSync(path.join(trial, 'prompt.txt'),
    'Use aba-payway-integration. Explain how I should use this skill for the synthetic Express invoicing project described in merchant-context.txt. Compare QR, hosted checkout and payment links, list the information I need and give the next prompt. This is guidance only: do not change files, install dependencies, configure credentials or contact PayWay.\n');
  writeFileSync(path.join(trial, 'before.json'), JSON.stringify(files(merchant), null, 2));
  writeFileSync(path.join(trial, 'identity.json'), JSON.stringify({ trial, merchant, archive, archiveSha256: digest(archive), skillVersion: '1.1.1', fileCount: packed.files.length, packedBytes: packed.size }, null, 2));
  console.log(JSON.stringify({ trial, merchant, archive, archiveSha256: digest(archive), fileCount: packed.files.length, packedBytes: packed.size }));
}
