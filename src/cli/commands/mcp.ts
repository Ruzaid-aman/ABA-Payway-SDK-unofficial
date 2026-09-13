import type { Command } from 'commander';
import { buildMcpToolCatalog } from '../../mcp/tool-catalog.js';
import { resolveAllowMutations, runMcpStdio } from '../../mcp/server.js';

/**
 * `payway-sdk mcp` — Model Context Protocol stdio server over the agent
 * tool registry (read-only by default). `--list-tools` previews the
 * effective catalog without starting stdio; the serve path owns stdout for
 * the protocol, so all diagnostics go to stderr.
 */
export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Serve the PayWay tool catalog as an MCP stdio server (read-only by default; --allow-mutations opts in)')
    .option('--allow-mutations', 'Expose mutation-class tools (create QR/checkout/link) — the host client owns user confirmation', false)
    .option('--profile <name>', 'Use a saved credential profile for gateway tools')
    .option('--list-tools', 'Print the effective tool catalog and exit (never starts stdio)', false)
    .option('--json', 'With --list-tools: emit one JSON array (name, description, readOnly, source)')
    .action((opts: { allowMutations?: boolean; profile?: string; listTools?: boolean; json?: boolean }) => {
      const allowMutations = resolveAllowMutations({ allowMutations: opts.allowMutations });
      const catalog = buildMcpToolCatalog({ allowMutations });

      if (opts.listTools) {
        if (opts.json) {
          const payload = catalog.map((tool) => ({
            name: tool.name,
            description: tool.description,
            readOnly: tool.annotations.readOnlyHint,
            source: tool.source,
          }));
          console.log(JSON.stringify(payload, null, 2));
        } else {
          const width = catalog.reduce((max, tool) => Math.max(max, tool.name.length), 0);
          for (const tool of catalog) {
            const flag = tool.annotations.readOnlyHint ? 'read-only' : 'MUTATION ';
            console.log(`  ${tool.name.padEnd(width)}  [${flag}]  ${tool.description}`);
          }
          console.log(
            `\n  ${catalog.length} tools (${allowMutations ? 'mutations ON' : 'read-only mode — use --allow-mutations to expose create tools'}).`,
          );
        }
        return;
      }

      void runMcpStdio({ allowMutations, profile: opts.profile }).catch((error: unknown) => {
        console.error('payway-sdk MCP server failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
    });
}
