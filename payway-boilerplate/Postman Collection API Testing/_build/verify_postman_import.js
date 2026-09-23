// Validate the YAML workspace that Postman imports. The old JSON export is no
// longer the source of truth, so this check intentionally validates the YAML
// resources and their request/variable structure instead of parsing JSON.
const path = require('node:path');
const { loadYamlCollection } = require('./yaml_collection');

const collectionDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'postman', 'collections', 'PayWay API — Complete Collection');
const collection = loadYamlCollection(collectionDir);
const badUrls = collection.requests.filter((request) => !/^(https?:\/\/|\{\{)/.test(request.url));
const malformedScripts = collection.requests.flatMap((request) =>
  (request.scripts || []).filter((script) => typeof script.code !== 'string')
    .map(() => request.relativePath));

console.log(`YAML collection: ${path.basename(collectionDir)}`);
console.log(`Requests: ${collection.requests.length}`);
console.log(`Variables: ${collection.variables.size}`);
console.log(`Script-bearing requests: ${collection.requests.filter((request) => request.scripts?.length).length}`);
console.log(`URL issues: ${badUrls.length ? badUrls.join(', ') : 'none'}`);
console.log(`Script issues: ${malformedScripts.length ? malformedScripts.join(', ') : 'none'}`);

if (badUrls.length || malformedScripts.length || collection.requests.length === 0) {
  console.log('VERDICT: YAML workspace has import-shape issues.');
  process.exitCode = 1;
} else {
  console.log('VERDICT: YAML workspace has a valid Postman import shape.');
}
