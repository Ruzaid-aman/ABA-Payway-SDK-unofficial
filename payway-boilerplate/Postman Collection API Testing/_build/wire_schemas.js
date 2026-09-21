const fs = require('fs');
const path = require('path');
const build = 'D:\\PayWay_Postman\\_build';

// Request name -> schema to append to its test script
const schemas = {
  '1. Purchase (Hosted Checkout) - multipart': {
    type: 'object', required: ['status'],
    properties: { status: { type: 'object', required: ['code'], properties: { code: { type: 'number' }, message: { type: 'string' } } } }
  },
  '3. Check Transaction (fast, recent)': {
    type: 'object', required: ['status'],
    properties: { status: { type: 'object', required: ['code'], properties: { code: { type: 'number' }, message: { type: 'string' } } } }
  },
  '5. Refund - RSA merchant_auth': {
    type: 'object', required: ['statusCode'],
    properties: { statusCode: { type: 'number' }, status: { type: 'object' }, message: { type: 'string' } }
  },
  'Generate QR': {
    type: 'object', required: ['status'],
    properties: { status: { type: 'object', required: ['code'], properties: { code: { type: 'number' }, message: { type: 'string' } } } }
  },
  '3. Get Token Details': {
    type: 'object', required: ['status'],
    properties: { status: { type: 'object' }, data: { type: 'object' } }
  },
  'B2 - Get Token Details (Flow B)': {
    type: 'object', required: ['status'],
    properties: { status: { type: 'object' }, data: { type: 'object' } }
  }
};

const filesWithTests = ['part_03_ecom.json', 'part_04_qr.json', 'part_08_cof.json', 'part_11_polling.json'];

let done = 0;
for (const f of filesWithTests) {
  const fp = path.join(build, f);
  const p = JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (const it of p.item) {
    if (!schemas[it.name]) continue;
    const te = (it.event || []).find(e => e.listen === 'test');
    if (!te) { console.log('no test script:', it.name); continue; }
    const exec = te.script.exec;
    if (exec.some(l => l.indexOf('assertJsonSchema') >= 0)) { console.log('already has schema:', it.name); continue; }
    const schemaLiteral = 'assertJsonSchema(' + JSON.stringify(schemas[it.name]) + ');';
    exec.push(schemaLiteral);
    done++;
    console.log('schema added:', it.name);
  }
  fs.writeFileSync(fp, JSON.stringify(p, null, 2), 'utf8');
}
console.log('total schema assertions added:', done);