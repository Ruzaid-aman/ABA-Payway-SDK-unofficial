/**
 * Minimal ANSI styling helpers shared by the agent command modules.
 *
 * `cli.ts` deliberately keeps its own copy so the manual CLI has no dependency
 * on the agent subtree; the agent command surface (ask / REPL / setup / doctor)
 * shares this one instead of duplicating six lambdas per file.
 */
export const ansi = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};
