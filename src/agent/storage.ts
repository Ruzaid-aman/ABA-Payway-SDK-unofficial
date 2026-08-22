/**
 * Agentic PayWay CLI — atomic storage primitives.
 *
 * Mirrors the credential profile storage convention (see
 * `src/config/profiles.ts`): the app-data root is the same
 * `aba-payway-sdk` directory; writes go through a temp file followed by an
 * atomic `renameSync` so a crash mid-write never corrupts an existing file.
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface AgentDataPaths {
  root: string;
  configFile: string;
  sessionsDir: string;
  ledgerDir: string;
}

/**
 * Resolves the on-disk layout for agent state.
 *
 * The default app-data directory matches `getProfileStorePath`'s default:
 * `process.env.APPDATA ?? path.join(homedir(), '.config')`. The agent subtree
 * lives under `aba-payway-sdk/agent`.
 */
export function getAgentDataPaths(
  appDataDirectory: string = process.env.APPDATA ?? path.join(homedir(), '.config'),
): AgentDataPaths {
  const root = path.join(appDataDirectory, 'aba-payway-sdk', 'agent');
  return {
    root,
    configFile: path.join(root, 'agent-config.json'),
    sessionsDir: path.join(root, 'sessions'),
    ledgerDir: path.join(root, 'ledger'),
  };
}

/**
 * Atomically writes `value` as JSON to `path`.
 *
 * Writes to `path + '.tmp'` first, then renames over the target. The temp file
 * is created with mode `0o600` where the platform supports it. Because the
 * rename is atomic, the existing target file is never left half-written if this
 * call fails: on any error the original file (if any) is untouched.
 */
export function atomicWriteJson(targetPath: string, value: unknown): void {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  renameSync(temporaryPath, targetPath);
}
