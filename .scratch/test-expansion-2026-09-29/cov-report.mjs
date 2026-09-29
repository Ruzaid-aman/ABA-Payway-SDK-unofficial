import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));
const rows = [];
for (const [file, cov] of Object.entries(data)) {
  const sMap = cov.statementMap, sCounts = cov.s;
  let total = 0, hit = 0;
  for (const [id, loc] of Object.entries(sMap)) { total++; if (sCounts[id] > 0) hit++; }
  const bMap = cov.branchMap, bCounts = cov.b;
  let bt = 0, bh = 0; const uncovLines = new Set();
  for (const [id, info] of Object.entries(bMap)) {
    const c = bCounts[id];
    for (let i = 0; i < c.length; i++) { bt++; if (c[i] > 0) bh++; else uncovLines.add(info.loc.start.line); }
  }
  for (const [id, loc] of Object.entries(sMap)) if (sCounts[id] === 0) uncovLines.add(loc.start.line);
  const pct = total ? (hit / total * 100) : 100;
  const bpct = bt ? (bh / bt * 100) : 100;
  const rel = file.split('SDK-prepration')[1].replaceAll('\\', '/').replace(/^\//, '');
  rows.push({ rel, pct, bpct, total, hit, bt, bh, uncov: [...uncovLines].sort((a, b) => a - b) });
}
rows.sort((a, b) => (a.pct + a.bpct) - (b.pct + b.bpct));
for (const r of rows.filter(r => r.total > 0 && r.pct + r.bpct < 160)) {
  console.log(`${r.pct.toFixed(1)}+${r.bpct.toFixed(1)} ${r.rel}`);
  console.log(`   uncov: ${r.uncov.slice(0, 50).join(',')}${r.uncov.length > 50 ? ' ...(' + r.uncov.length + ' lines)' : ''}`);
}
