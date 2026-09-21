// One-off: dump collection structure as JSON for the index markdown
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));

const out = {
  name: c.info.name,
  version: c.info.version,
  schema: c.info.schema,
  collEvents: (c.event || []).map(e => e.listen),
  varCount: (c.variable || []).length,
  variables: (c.variable || []).map(v => ({ key: v.key, value: v.value, type: v.type, desc: (v.description || '') })),
  folders: []
};

for (const f of c.item) {
  const folder = {
    name: f.name,
    desc: typeof f.description === 'string' ? f.description : (f.description && f.description.content) || '',
    requests: []
  };
  const walk = (items) => {
    for (const it of items || []) {
      if (it.item) { folder.requests.push({ group: it.name }); walk(it.item); continue; }
      folder.requests.push({
        name: it.name,
        method: it.request && it.request.method,
        url: it.request && it.request.url && (typeof it.request.url === 'string' ? it.request.url : (it.request.url.raw || '')),
        bodyMode: it.request && it.request.body && it.request.body.mode,
        hasPre: (it.event || []).some(e => e.listen === 'prerequest' && e.script && e.script.exec && e.script.exec.length),
        hasTest: (it.event || []).some(e => e.listen === 'test' && e.script && e.script.exec && e.script.exec.length),
        snr: (it.event || []).flatMap(e => (e.listen === 'test' && e.script && e.script.exec) ? e.script.exec.filter(l => /setNextRequest/.test(l)) : [])
      });
    }
  };
  walk(f.item);
  out.folders.push(folder);
}

fs.writeFileSync('D:/PayWay_Postman/_build/dump_structure.json', JSON.stringify(out, null, 2));
console.log('folders=' + out.folders.length + ' requests=' + out.folders.reduce((n, f) => n + f.requests.filter(r => !r.group).length, 0));
