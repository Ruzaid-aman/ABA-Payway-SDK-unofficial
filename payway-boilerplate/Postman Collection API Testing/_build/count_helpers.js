// One-off: find requests whose test scripts call assertJsonSchema / setNextRequest
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));
const hits = [];
const walk = (items, path) => {
  for (const it of items || []) {
    if (it.item) { walk(it.item, path.concat(it.name)); continue; }
    for (const ev of it.event || []) {
      if (ev.listen !== 'test') continue;
      const body = (ev.script && ev.script.exec || []).join('\n');
      if (/assertJsonSchema\s*\(/.test(body)) hits.push(path.concat(it.name).join(' > '));
      const n = (body.match(/assertJsonSchema\s*\(/g) || []).length;
      if (n > 1) console.log('MULTI(' + n + '): ' + it.name);
    }
  }
};
walk(c.item, []);
console.log('assertJsonSchema endpoints (' + hits.length + '):');
hits.forEach(h => console.log(' - ' + h));
