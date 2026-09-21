const fs = require('fs');
const path = require('path');

const build = 'D:\\PayWay_Postman\\_build';
const outPath = 'D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json';

const files = fs.readdirSync(build)
  .filter((f) => /^part_\d+.*\.json$/.test(f))
  .sort();

const infoPart = JSON.parse(fs.readFileSync(path.join(build, 'part_00_info.json'), 'utf8'));

const ordered = [];
const groups = new Map();
const folderDesc = new Map();

for (const f of files) {
  if (f === 'part_00_info.json') continue;
  const obj = JSON.parse(fs.readFileSync(path.join(build, f), 'utf8'));
  const folderName = String(obj.folder);
  if (!groups.has(folderName)) {
    groups.set(folderName, []);
    ordered.push(folderName);
    if (obj.description) folderDesc.set(folderName, obj.description);
  }
  for (const it of obj.item) groups.get(folderName).push(it);
}

const folders = ordered.map((name) => {
  const folder = { name, item: groups.get(name) };
  if (folderDesc.has(name)) folder.description = folderDesc.get(name);
  return folder;
});

const collection = {
  info: infoPart.info,
  item: folders,
  variable: infoPart.variable,
  event: infoPart.event,
};

const json = JSON.stringify(collection, null, 2);
fs.writeFileSync(outPath, json, 'utf8');

// validate
const check = JSON.parse(json);
const totalReqs = check.item.reduce((sum, f) => sum + f.item.length, 0);
console.log('OK: ' + outPath);
console.log('Folders: ' + check.item.length);
console.log('Requests: ' + totalReqs);
console.log('Size KB: ' + (Buffer.byteLength(json) / 1024).toFixed(1));