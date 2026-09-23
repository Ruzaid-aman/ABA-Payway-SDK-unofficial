const path = require('node:path');
const { loadYamlCollection } = require('./yaml_collection');

const collectionDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'postman', 'collections', 'PayWay API — Complete Collection');
const collection = loadYamlCollection(collectionDir);
const issues = [];
const names = new Set(collection.requests.map((request) => path.basename(request.relativePath, '.request.yaml')));
const variables = collection.variables;
const used = new Set();
const assigned = new Set();
const variablePattern = /\{\{([^}]+)\}\}/g;

console.log('== Requests by folder ==');
const folders = new Map();
for (const request of collection.requests) {
  const folder = path.dirname(request.relativePath);
  folders.set(folder, (folders.get(folder) || 0) + 1);
  if (!request.method) issues.push(`${request.relativePath}: missing method`);
  let match;
  const source = JSON.stringify(request);
  const scriptSource = (request.scripts || []).map((script) => String(script.code || '')).join('\n');
  while ((match = variablePattern.exec(source)) !== null) used.add(match[1]);
  for (const assignment of scriptSource.matchAll(/(?:collectionVariables|\bC)\.set\(['"]([^'"]+)['"]/g)) {
    assigned.add(assignment[1]);
  }
}
for (const [folder, count] of folders) console.log(`  ${folder} -> ${count} requests`);

console.log('\n== setNextRequest targets ==');
for (const request of collection.requests) {
  for (const script of request.scripts || []) {
    const source = String(script.code || '');
    for (const match of source.matchAll(/setNextRequest\(['"](.+?)['"]\)/g)) {
      const target = match[1];
      console.log(`  ${path.basename(request.relativePath)} -> ${target} ${names.has(target) ? 'OK' : '*** MISSING ***'}`);
      if (!names.has(target)) issues.push(`${request.relativePath}: missing setNextRequest target ${target}`);
    }
  }
}

console.log('\n== Undefined collection variables referenced ==');
const undefinedVariables = [...used].filter((name) => !variables.has(name) && !assigned.has(name)).sort();
if (undefinedVariables.length) {
  undefinedVariables.forEach((name) => console.log(`  ${name}`));
  issues.push(...undefinedVariables.map((name) => `undefined variable ${name}`));
} else console.log('  none');

console.log('\n== Collection summary ==');
console.log(`  requests: ${collection.requests.length}`);
console.log(`  variables: ${variables.size}`);
console.log(`  issues: ${issues.length}`);
if (issues.length) {
  console.log('\n== Validation issues ==');
  issues.forEach((issue) => console.log(`  ${issue}`));
  process.exitCode = 1;
} else {
  console.log('  none');
}
