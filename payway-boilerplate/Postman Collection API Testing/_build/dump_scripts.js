// Dump pre+test scripts of selected requests for helper-text review.
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));
const wanted = process.argv.slice(2);
const descOf = (d) => (typeof d === 'string' ? d : (d && d.content) || '');
const walk = (items) => {
  for (const it of items || []) {
    if (it.item) { walk(it.item); continue; }
    if (wanted.length && !wanted.some(w => it.name.toLowerCase().includes(w.toLowerCase()))) continue;
    const ev = it.event || [];
    const pre = ((ev.find(e => e.listen === 'prerequest') || {}).script || {}).exec || [];
    const tst = ((ev.find(e => e.listen === 'test') || {}).script || {}).exec || [];
    console.log('\n================ ' + it.name + ' ================');
    console.log('--- DESCRIPTION ---\n' + descOf(it.request && it.request.description).slice(0, 1200));
    console.log('--- PRE-REQUEST ---\n' + pre.join('\n'));
    console.log('--- TEST ---\n' + tst.join('\n'));
  }
};
walk(c.item);
