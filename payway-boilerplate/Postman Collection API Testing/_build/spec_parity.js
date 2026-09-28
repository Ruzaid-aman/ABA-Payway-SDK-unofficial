// Contract check: the OpenAPI spec (postman/specs/payway-openapi.yaml) and the
// Postman collection must describe the same API surface.
//
//   1. Every path in the spec must exist in the collection (hard fail).
//   2. A collection path absent from the spec must be listed in COLLECTION_ONLY
//      with a justification — these are live-verified endpoints that official
//      docs do not publish, so the hand-authored spec intentionally omits them.
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { loadYamlCollection } = require('./yaml_collection');

const projectDir = path.join(__dirname, '..');
const specPath = path.join(projectDir, 'postman', 'specs', 'payway-openapi.yaml');
const collectionDir = path.join(projectDir, 'postman', 'collections', 'PayWay API — Complete Collection');

// Endpoints the collection ships but the spec omits, with the reason.
const COLLECTION_ONLY = new Map([
  ['/api/merchant-portal/merchant-access/payment-link/void',
    'Undocumented endpoint, live-verified (SANDBOX-FINDINGS §23); official docs do not publish it, so the hand-authored spec omits it.'],
]);

const spec = yaml.load(fs.readFileSync(specPath, 'utf8'));
const specPaths = new Set(Object.keys(spec.paths || {}));
const collectionPaths = new Set(
  loadYamlCollection(collectionDir)
    .requests.map((r) => r.url.replace('{{baseUrl}}', '').split('?')[0])
    .filter((u) => u.startsWith('/')),
);

const problems = [];
for (const p of specPaths) {
  if (!collectionPaths.has(p)) problems.push(`spec path missing from collection: ${p}`);
}
for (const p of collectionPaths) {
  if (!specPaths.has(p) && !COLLECTION_ONLY.has(p)) {
    problems.push(`collection path missing from spec (add to spec or to COLLECTION_ONLY with a justification): ${p}`);
  }
}

console.log(`OpenAPI ${spec.openapi} — ${specPaths.size} spec paths vs ${collectionPaths.size} collection endpoints`);
if (problems.length) {
  for (const problem of problems) console.error('  ' + problem);
  process.exit(1);
}
console.log('Parity OK — spec is a subset of the collection; collection-only paths are justified:');
for (const p of COLLECTION_ONLY.keys()) console.log(`  ${p}`);
