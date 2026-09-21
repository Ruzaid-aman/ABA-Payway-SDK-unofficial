const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));
for (const f of c.item) {
  console.log('=== ' + f.name + ' (' + f.item.length + ')');
  for (const it of f.item) {
    const tests = (it.event || []).filter(e => e.listen === 'test');
    const pres = (it.event || []).filter(e => e.listen === 'prerequest');
    const firstTest = tests.length ? (tests[0].script.exec || []).join(' ') : '';
    const hasNew = /status\.code|pwt saved|Token removed|Token renewed|approved/.test(firstTest);
    console.log('  - ' + (it.name || '(no name)') + '  pre=' + pres.length + ' test=' + tests.length + (hasNew ? '  [STRICT]' : ''));
  }
}