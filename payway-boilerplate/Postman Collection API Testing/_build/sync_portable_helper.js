// Regenerate the YAML-embedded helper and migration loaders from one RSA source.
const fs = require('node:fs');
const path = require('node:path');
const { openSslEncrypt } = require('./portable_rsa');
const { requestFiles } = require('./yaml_collection');

const projectDir = path.join(__dirname, '..');
const collectionDir = path.join(projectDir, 'postman', 'collections', 'PayWay API — Complete Collection');
const definitionPath = path.join(collectionDir, '.resources', 'definition.yaml');
const oldHelper = require('./part_00_info.json').variable.find((item) => item.key === '__helpers').value;
const rsaSource = openSslEncrypt.toString();
const legacyWithoutRsa = oldHelper
  .replace(/function openSslEncrypt\([\s\S]*?(?=\nfunction rsaFallback\()/, '')
  .replace('WARN: node-forge unavailable and {{', 'WARN: secure randomness unavailable and {{')
  .replace('Install the node-forge library or paste a pre-computed value.', 'Paste a fresh pre-computed value.');
const helperSource = `${legacyWithoutRsa}\n\n${rsaSource}`;
const helperKey = '__helpers_v20260923_portable_v2';
const oldKeys = [helperKey, '__helpers_v20260923_portable', '__helpers_v20260923', '__helpers'];

function loader(indent, migrate) {
  const prefix = ' '.repeat(indent);
  const lines = [
    `var __h = ${oldKeys.map((key) => `pm.collectionVariables.get('${key}')`).join(' || ')};`,
  ];
  if (migrate) {
    lines.push(`if (__h && !pm.collectionVariables.get('${helperKey}')) {`);
    lines.push(`  __h += '\\n\\n' + ${JSON.stringify(rsaSource)};`);
    lines.push(`  pm.collectionVariables.set('${helperKey}', __h);`);
    lines.push('}');
  }
  lines.push("if (!__h) throw new Error('The shared PayWay helper is missing. Re-import the complete collection.');");
  lines.push('eval(__h);');
  return lines.map((line) => prefix + line).join('\n');
}

const definition = fs.readFileSync(definitionPath, 'utf8');
const yamlValue = `  ${helperKey}: |-\n${helperSource.split('\n').map((line) => line ? `    ${line}` : '').join('\n')}\n`;
// An unsynced collection may carry the helper as an empty scalar (""); drop that
// line first or inserting the block below duplicates the mapping key.
let updated = definition.replace(/^  __helpers_v20260923_portable(?:_v2)?: ["']["']?\r?\n/m, '');
const previousHelperBlock = /^  __helpers_v20260923_portable(?:_v2)?: \|-\r?\n[\s\S]*?(?=^  __helpers:|^scripts:)/m;
if (previousHelperBlock.test(updated)) {
  updated = updated.replace(previousHelperBlock, yamlValue);
} else {
  updated = updated.replace('  __helpers: ""\n', `${yamlValue}  __helpers: ""\n`);
}
if (!updated.includes(`  ${helperKey}: |-`)) throw new Error('Could not add portable helper to collection definition');
const collectionLoader = /^( +)var __h = pm\.collectionVariables\.get\([^\r\n]+\);\r?\n(?:\1if \(__h && !pm\.collectionVariables\.get\([^\r\n]+\)\) \{\r?\n\1  __h \+= [^\r\n]+;\r?\n\1  pm\.collectionVariables\.set\([^\r\n]+\);\r?\n\1\}\r?\n)?\1if \(!__h\) throw new Error\([^\r\n]+\);\r?\n\1eval\(__h\);/gm;
if (!collectionLoader.test(updated)) throw new Error('Collection helper loader not found');
collectionLoader.lastIndex = 0;
updated = updated.replace(collectionLoader, (_, indent) => loader(indent.length, true));
updated = updated.replace('versioned `__helpers_v20260923_portable` collection variable', `versioned \`${helperKey}\` collection variable`);
fs.writeFileSync(definitionPath, updated);

for (const file of requestFiles(collectionDir)) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('var __h = pm.collectionVariables.get(')) continue;
  const migrated = source.replace(new RegExp(collectionLoader.source, 'gm'), (_, indent, offset) => {
    const isBefore = source.slice(0, offset).lastIndexOf('type: beforeRequest') >
      source.slice(0, offset).lastIndexOf('type: afterResponse');
    return loader(indent.length, isBefore && source.includes('rsaFallback('));
  });
  if (migrated === source && !source.includes(`pm.collectionVariables.get('${helperKey}') ||`)) throw new Error(`Helper loader not found in ${file}`);
  if (migrated !== source) fs.writeFileSync(file, migrated);
}
console.log('Portable helper and migration loaders synced to YAML collection');
