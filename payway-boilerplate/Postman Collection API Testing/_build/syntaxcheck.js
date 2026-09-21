const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));

let total = 0, bad = 0;
const walkItems = (items, path) => items.forEach((it) => {
  const p = path + ' / ' + (it.name || '(folder)');
  if (it.item) { walkItems(it.item, p); return; }
  (it.event || []).forEach((e) => {
    total++;
    const src = (e.script.exec || []).join('\n');
    try { new Function(src); } catch (err) { bad++; console.log('SYNTAX: ' + p + ' [' + e.listen + ']: ' + err.message); }
  });
});
walkItems(c.item, '');

const globalPre = c.event && c.event.find((e) => e.listen === 'prerequest');
if (globalPre) {
  try { new Function(globalPre.script.exec.join('\n')); console.log('Global pre-request: OK'); }
  catch (e) { console.log('GLOBAL PRE SYNTAX: ' + e.message); }
}

console.log('Checked ' + total + ' scripts. Errors: ' + bad);