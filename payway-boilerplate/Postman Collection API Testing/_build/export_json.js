// Build dist/PayWay API — Complete Collection.postman_collection.json (Postman
// Collection v2.1 JSON) from the canonical YAML workspace, with saved-response
// examples from examples.json injected per request. The YAML resources are the
// source of truth; this file is the shareable single-artifact deliverable used
// by "Import file" flows, newman, and AI tooling that expects examples.
//
//   node export_json.js          # rebuild dist/ + verify with the official SDK
//   node export_json.js --check  # fail if the committed dist is stale (CI gate)
const fs = require('node:fs');
const path = require('node:path');
const { Collection, Variable, Example } = require('postman-collection');
const { loadYamlCollection, readYaml, requestFiles } = require('./yaml_collection');

const projectDir = path.join(__dirname, '..');
const collectionDir = path.join(projectDir, 'postman', 'collections', 'PayWay API — Complete Collection');
const distDir = path.join(projectDir, 'dist');
const distPath = path.join(distDir, 'PayWay API — Complete Collection.postman_collection.json');
const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const SECRET_VARIABLES = new Set(['secret_key']);

const examplesSource = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples.json'), 'utf8'));
const examplesByPath = examplesSource.examples || {};

function scriptEvent(type) {
  if (type === 'beforeRequest') return 'prerequest';
  if (type === 'afterResponse') return 'test';
  return null;
}

function toEvents(scripts) {
  const events = [];
  for (const script of scripts || []) {
    const listen = scriptEvent(script.type);
    if (!listen) continue;
    events.push({
      listen,
      script: { type: 'text/javascript', exec: String(script.code).split('\n') },
    });
  }
  return events;
}

function toBody(body) {
  if (!body) return undefined;
  if (body.type === 'formdata') {
    return {
      mode: 'formdata',
      formdata: (body.content || []).map((part) => ({
        key: part.key,
        value: part.value == null ? '' : String(part.value),
        type: part.type || 'text',
        ...(part.description ? { description: part.description } : {}),
      })),
    };
  }
  if (body.type === 'json') {
    return { mode: 'raw', raw: String(body.content), options: { raw: { language: 'json' } } };
  }
  if (body.type === 'urlencoded') {
    return {
      mode: 'urlencoded',
      urlencoded: (body.content || []).map((part) => ({ key: part.key, value: part.value == null ? '' : String(part.value) })),
    };
  }
  throw new Error(`Unsupported YAML body type: ${body.type}`);
}

function previewMime(language) {
  if (language === 'html') return 'text/html';
  return 'application/json';
}

function toExample(entry, request) {
  const language = entry.language || 'json';
  const header = [{ key: 'Content-Type', value: previewMime(language) }];
  const originalRequest = {
    url: request.url,
    method: request.method || 'GET',
    ...(request.headers && request.headers.length ? { header: request.headers.map((h) => ({ key: h.key, value: h.value })) } : {}),
  };
  return {
    name: entry.name,
    originalRequest,
    status: entry.status || (entry.code === 200 ? 'OK' : ''),
    code: entry.code,
    _postman_previewlanguage: language,
    header,
    body: entry.body,
    ...(entry.description ? { description: entry.description } : {}),
  };
}

function build() {
  const collection = loadYamlCollection(collectionDir);
  const definition = collection.definition;

  // Folder descriptions/orders live in each folder's .resources/definition.yaml.
  const folders = new Map(); // folder name -> { description, order, items: [] }
  for (const request of collection.requests) {
    const folderName = path.dirname(request.relativePath);
    if (folderName === '.') continue; // no loose requests in this collection
    if (!folders.has(folderName)) {
      const folderDefinitionPath = path.join(collectionDir, folderName, '.resources', 'definition.yaml');
      const folderDefinition = fs.existsSync(folderDefinitionPath) ? readYaml(folderDefinitionPath) : {};
      folders.set(folderName, { description: folderDefinition.description || '', order: folderDefinition.order || 5000, items: [] });
    }
  }

  const exampleStats = { attached: 0, missing: [] };
  for (const request of collection.requests) {
    const folderName = path.dirname(request.relativePath);
    const item = {
      name: path.basename(request.relativePath).replace(/\.request\.yaml$/, ''),
      request: {
        method: request.method || 'GET',
        url: request.url,
        ...(request.headers && request.headers.length
          ? { header: request.headers.map((h) => ({ key: h.key, value: h.value, ...(h.description ? { description: h.description } : {}) })) }
          : {}),
        ...(request.body ? { body: toBody(request.body) } : {}),
        ...(request.description ? { description: request.description } : {}),
      },
      ...(toEvents(request.scripts).length ? { event: toEvents(request.scripts) } : {}),
      response: [],
    };
    const entries = examplesByPath[request.relativePath.split(path.sep).join('/')];
    if (entries) {
      item.response = entries.map((entry) => toExample(entry, item.request));
      exampleStats.attached += item.response.length;
    }
    folders.get(folderName).items.push({ order: request.order || 5000, item });
  }

  const variables = Object.entries(definition.variables || {}).map(([key, value]) => ({
    key,
    value: value == null ? '' : String(value),
    ...(SECRET_VARIABLES.has(key) ? { type: 'secret' } : {}),
  }));

  const knownRequests = new Set(collection.requests.map((r) => r.relativePath.split(path.sep).join('/')));
  for (const key of Object.keys(examplesByPath)) {
    if (!knownRequests.has(key)) stats.missing.push(key);
  }

  const out = {
    info: {
      name: 'PayWay API — Complete Collection',
      _postman_id: 'f2a1c9e0-8d7b-4c3a-9e5f-1a2b3c4d5e6f',
      description: definition.description || '',
      schema: SCHEMA,
    },
    ...(variables.length ? { variable: variables } : {}),
    ...(toEvents(definition.scripts).length ? { event: toEvents(definition.scripts) } : {}),
    item: [...folders.entries()]
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
      .map(([name, folder]) => ({
        name,
        ...(folder.description ? { description: folder.description } : {}),
        item: folder.items.sort((a, b) => a.order - b.order || a.item.name.localeCompare(b.item.name)).map((entry) => entry.item),
      })),
  };
  return { out, stats: { requests: collection.requests.length, folders: folders.size, variables: variables.length, ...exampleStats } };
}

function verify(json, stats) {
  const sdkCollection = new Collection(json);
  if (!sdkCollection) throw new Error('postman-collection SDK rejected the generated collection');
  let requestCount = 0;
  let exampleCount = 0;
  sdkCollection.items.each(function walk(item) {
    if (item.items) item.items.each(walk);
    else {
      requestCount += 1;
      exampleCount += item.responses.count();
    }
  });
  if (requestCount !== stats.requests) throw new Error(`SDK parsed ${requestCount} requests, expected ${stats.requests}`);
  if (exampleCount !== stats.attached) throw new Error(`SDK parsed ${exampleCount} examples, expected ${stats.attached}`);
  const secretVar = json.variable.find((v) => v.key === 'secret_key');
  if (!secretVar || secretVar.type !== 'secret') throw new Error('secret_key must remain secret-typed in the export');
}

const checkOnly = process.argv.includes('--check');
const { out, stats } = build();
if (stats.missing.length) {
  throw new Error(`examples.json references unknown requests: ${stats.missing.join(', ')}`);
}
const serialized = JSON.stringify(out, null, 2) + '\n';

if (require.main === module) {
  if (checkOnly) {
    const committed = fs.existsSync(distPath) ? fs.readFileSync(distPath, 'utf8') : '';
    if (committed !== serialized) {
      console.error('dist export is stale — run: node _build/export_json.js');
      process.exit(1);
    }
    console.log(`dist export fresh (${stats.requests} requests, ${stats.attached} examples, ${stats.variables} variables)`);
  } else {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(distPath, serialized);
    verify(out, stats);
    console.log(`dist export written: ${path.relative(projectDir, distPath)}`);
    console.log(`SDK import: OK — ${stats.folders} folders, ${stats.requests} requests, ${stats.attached} examples, ${stats.variables} variables (${new Set(Object.keys(examplesByPath)).size} requests documented)`);
  }
}

module.exports = { build };
