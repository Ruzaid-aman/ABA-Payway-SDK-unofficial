// Resolves relative imports exactly like src/mcp/tool-catalog.ts does
const { buildToolSchemas } = await import('../../../src/agent/provider-prompts.js');
const { AGENT_TOOL_NAMES } = await import('../../../src/agent/contracts.js');
const schemas = buildToolSchemas();
console.log('schema[0] fn keys:', Object.keys(schemas[0].function));
const byName = new Map(schemas.map((d) => [d.function.name, d]));
const fn = byName.get(AGENT_TOOL_NAMES[0]);
console.log('fn name:', fn?.function?.name ?? fn?.name, '| desc:', typeof (fn?.function ?? fn)?.description);
