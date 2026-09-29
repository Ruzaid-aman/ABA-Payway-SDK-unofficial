import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));
const target = process.argv[2];
const key = Object.keys(data).find(k => k.replaceAll('\\', '/').endsWith(target));
if (!key) { console.error('not found:', target); process.exit(1); }
const cov = data[key];
const lines = fs.readFileSync(key, 'utf8').split('\n');
const uncov = new Set();
for (const [id, loc] of Object.entries(cov.statementMap)) if (cov.s[id] === 0) for (let l = loc.start.line; l <= loc.end.line; l++) uncov.add(l);
const ranges = []; let start = null, prev = null;
for (const l of [...uncov].sort((a, b) => a - b)) {
  if (start === null) { start = l; prev = l; continue; }
  if (l === prev + 1) { prev = l; continue; }
  ranges.push([start, prev]); start = l; prev = l;
}
if (start !== null) ranges.push([start, prev]);
console.log('total uncovered lines:', uncov.size);
for (const [a, b] of ranges) {
  if (b - a >= Number(process.argv[3] ?? 4)) console.log(a + '-' + b + ': ' + String(lines[a - 1] || '').trim().slice(0, 100));
}
