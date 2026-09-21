const c = require('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json');

const allRequestPaths = [];
function walk(item, folderPath) {
  if (item.item) {
    const p = folderPath + '/' + item.name;
    item.item.forEach(i => walk(i, p));
    return;
  }
  allRequestPaths.push({ folder: folderPath, r: item });
}
c.item.forEach(f => walk(f, ''));

// 1) Format: must be v2.1.0 for setNextRequest + all modern features
console.log('== Format ==');
console.log('schema:', c.info.schema);
console.log('postman_id present:', !!c.info._postman_id);
console.log('name:', c.info.name);
console.log('version:', c.info.version ? c.info.version.version || c.info.version : '(none)');

// 2) Collection-level docs
console.log('\n== Description / documentation ==');
console.log('collection description (info.description):', typeof c.info.description, (c.info.description||'').length, 'chars');
console.log('item descriptions (folder/req):', allRequestPaths.filter(x => x.r.request && x.r.request.description).length, 'of', allRequestPaths.length);
console.log('folder descriptions:', c.item.filter(f => f.description).length, 'of', c.item.length);

// 3) Auth
console.log('\n== Auth ==');
console.log('collection auth:', c.auth ? JSON.stringify(c.auth) : '(none - header-based hash used)');

// 4) Events / tests
console.log('\n== Scripting ==');
const withScripts = allRequestPaths.filter(x => x.r.event && x.r.event.length);
console.log('requests with event(s):', withScripts.length);
const setNext = allRequestPaths.filter(x => JSON.stringify(x.r.event||'').includes('setNextRequest'));
console.log('requests using setNextRequest (Runner flows):', setNext.length);

// 5) Variables
console.log('\n== Variables ==');
console.log('collection variables:', (c.variable||[]).length);
console.log('undefined helper fn calls:', (() => {
  const used = [];
  allRequestPaths.forEach(({r}) => (r.event||[]).forEach(e => (e.script.exec||[]).forEach(l => {
    ['utcNow','genTranId','genRequestId','hmac512','b64','b64json','ensureB64','fmtAmt','_pad','openSslEncrypt','rsaFallback'].forEach(h => {
      if (l.includes(h)) used.push(h);
    });
  })));
  return [...new Set(used)].join(', ');
})());

// 6) Headers / content-type consistency
console.log('\n== Request shape ==');
const missingMethod = allRequestPaths.filter(x => x.r.request && !x.r.request.method);
console.log('requests missing method:', missingMethod.length);
const missingUrl = allRequestPaths.filter(x => x.r.request && !x.r.request.url);
console.log('requests missing URL:', missingUrl.length);

// 7) Run-order determinism
console.log('\n== Run order ==');
const foldersNoRunner = c.item.filter(f => !JSON.stringify(f).includes('setNextRequest') && f.name.indexOf('11') !== 0);
console.log('folders NOT in runner flows:', foldersNoRunner.length, '(folder 11 owns flows)');