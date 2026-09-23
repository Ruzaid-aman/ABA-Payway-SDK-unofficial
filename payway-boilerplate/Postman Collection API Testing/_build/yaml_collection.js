const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, 'utf8')) || {};
}

function requestFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '.resources') found.push(...requestFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.request.yaml')) found.push(full);
  }
  return found.sort();
}

function loadYamlCollection(collectionDir) {
  const definitionPath = path.join(collectionDir, '.resources', 'definition.yaml');
  if (!fs.existsSync(definitionPath)) {
    throw new Error(`YAML collection definition not found: ${definitionPath}`);
  }
  const definition = readYaml(definitionPath);
  const requests = requestFiles(collectionDir).map((file) => {
    const relativePath = path.relative(collectionDir, file);
    const request = readYaml(file);
    if (request.$kind !== 'http-request') throw new Error(`Unexpected resource kind in ${file}`);
    if (typeof request.url !== 'string' || !request.url.trim()) throw new Error(`Missing URL in ${file}`);
    return { file, relativePath, ...request };
  });
  return {
    collectionDir,
    definition,
    variables: new Map(Object.entries(definition.variables || {})),
    requests,
  };
}

module.exports = { loadYamlCollection, readYaml, requestFiles };
