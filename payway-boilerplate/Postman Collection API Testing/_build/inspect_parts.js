// Dumps hash-construction lines + variable usage from part files for review.
const fs = require('fs');
const files = fs.readdirSync(__dirname).filter(f => /^part_.*\.json$/.test(f)).sort();
for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.log('SKIP ' + f + ': ' + e.message.slice(0, 100)); continue; }
  if (!j.item) { console.log('==== ' + f + ' (no item[] — info part)'); continue; }
  console.log('\n==== ' + f + ' -> "' + j.folder + '" items: ' + j.item.length);
  for (const it of j.item) {
    console.log('  -- ' + it.name);
    const pre = (it.event || []).find(e => e.listen === 'prerequest');
    const lines = pre && pre.script ? pre.script.exec : [];
    for (const l of lines) {
      const s = String(l);
      if (/var msg|var b4hash|rsaFallback|b4hash|C\.set\('request_id'|C\.set\('request_time'|hash: /i.test(s)) {
        console.log('     ' + s.trim().slice(0, 260));
      }
    }
    const ev = (it.event || []).find(e => e.listen === 'test');
    const tl = ev && ev.script ? ev.script.exec : [];
    for (const l of tl) {
      const s = String(l);
      if (/eql\(|typeof|setNextRequest|set\('/.test(s)) {
        console.log('   T ' + s.trim().slice(0, 200));
      }
    }
  }
}
