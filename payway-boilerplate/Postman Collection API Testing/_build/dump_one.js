// Dump the current pre-request + test scripts of named requests (post-fix check)
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));
const want = process.argv.slice(2);
let found = 0;
const walk = (items) => {
  for (const it of items) {
    if (it.item) { walk(it.item); continue; }
    if (!want.some((w) => it.name === w)) continue;
    found++;
    console.log('\n######## ' + it.name + ' ########');
    console.log('URL:', it.request.url.raw, '| method:', it.request.method);
    for (const ev of it.event || []) {
      console.log('\n----- ' + ev.listen + ' script (' + (ev.script.exec || []).length + ' lines) -----');
      console.log((ev.script.exec || []).join('\n'));
    }
  }
};
walk(c.item || []);
if (!found) console.log('NO REQUEST MATCHED: ' + want.join(', '));
