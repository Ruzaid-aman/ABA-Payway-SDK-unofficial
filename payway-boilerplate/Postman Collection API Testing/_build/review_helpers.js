// Review helper-text coverage: per request -> description size + script line counts.
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));
const out = [];
const descLen = (d) => (typeof d === 'string' ? d.length : (d && d.content ? d.content.length : 0));
const walk = (items) => {
  for (const it of items || []) {
    if (it.item) {
      out.push('FOLDER: ' + it.name + '  (desc ' + descLen(it.description) + ' chars)');
      walk(it.item);
    } else {
      const ev = it.event || [];
      const pre = ((ev.find(e => e.listen === 'prerequest') || {}).script || {}).exec || [];
      const tst = ((ev.find(e => e.listen === 'test') || {}).script || {}).exec || [];
      out.push('  REQ: ' + it.name + ' | desc:' + descLen(it.request && it.request.description) +
        'ch | pre:' + pre.length + 'L | test:' + tst.length + 'L');
    }
  }
};
walk(c.item);
console.log(out.join('\n'));
