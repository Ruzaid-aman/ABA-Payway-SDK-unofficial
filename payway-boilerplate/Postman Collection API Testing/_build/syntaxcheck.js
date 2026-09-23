const path = require('node:path');
const { loadYamlCollection } = require('./yaml_collection');

const collectionDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'postman', 'collections', 'PayWay API — Complete Collection');
const collection = loadYamlCollection(collectionDir);

let total = 0;
let bad = 0;
for (const request of collection.requests) {
  for (const script of request.scripts || []) {
    total++;
    try {
      new Function(String(script.code || ''));
    } catch (error) {
      bad++;
      console.log(`SYNTAX: ${request.relativePath} [${script.type || 'script'}]: ${error.message}`);
    }
  }
}

console.log(`Checked ${total} YAML scripts across ${collection.requests.length} requests. Errors: ${bad}`);
process.exitCode = bad ? 1 : 0;
