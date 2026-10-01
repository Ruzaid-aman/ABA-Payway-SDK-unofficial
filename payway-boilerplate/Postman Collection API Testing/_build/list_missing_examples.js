// One-off: list request files and whether examples.json covers them.
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const collDir = path.join(root, 'postman', 'collections', 'PayWay API — Complete Collection');
const ex = require('./examples.json').examples;
const files = execSync(`find "${collDir}" -name "*.request.yaml"`, { encoding: 'utf8' })
  .trim().split('\n');
for (const f of files) {
  const rel = path.relative(collDir, f).split(path.sep).join('/');
  const has = ex[rel];
  console.log(has ? `YES(${has.length})` : 'no   ', '|', rel);
}
