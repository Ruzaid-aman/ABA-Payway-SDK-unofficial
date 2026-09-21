// Survey descriptions across all part files.
const fs = require('fs');
const dir = 'D:/PayWay_Postman/_build';
const parts = fs.readdirSync(dir).filter(f => /^part_\d+.*\.json$/.test(f)).sort();
for (const f of parts) {
  const p = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  console.log('\n### ' + f + '  folder=' + JSON.stringify(p.folder) + '  folderDesc=' + (p.description ? String(p.description).length + 'ch' : 'NONE'));
  for (const it of p.item || []) {
    if (it.item) { console.log('  [subfolder] ' + it.name); continue; }
    const d = it.request && it.request.description;
    const len = d === undefined ? 'UNDEF' : (typeof d === 'string' ? d.length + 'ch(str)' : JSON.stringify(d).length + 'ch(obj:' + d.type + ')');
    const head = typeof d === 'string' ? d.slice(0, 60).replace(/\n/g, ' | ') : (d && d.content ? d.content.slice(0, 60).replace(/\n/g, ' | ') : '');
    console.log('  - ' + it.name + '  [' + len + '] ' + head);
  }
}
