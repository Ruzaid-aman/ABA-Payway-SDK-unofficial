/**
 * Update notifier (spec `.scratch/cli-modernization/design.md` §4.2).
 *
 * Contract: fires ONLY on a bare `payway-sdk` invocation or a top-level
 * `--help`/`-h`/`help` invocation — never on real commands, so command
 * output purity is untouched by construction. The notice goes to stderr,
 * only when stdout is a TTY, only when PAYWAY_NO_UPDATE_CHECK != '1'.
 * Any fetch/parse failure is silent: the checker can never break a command
 * or alter an exit code. Cache: 24h TTL in the shared aba-payway-sdk
 * app-data dir, written atomically (src/agent/storage.ts).
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWriteJson } from '../agent/storage.js';

export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/aba-payway-ts/latest';

export interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string;
}

export interface UpdateNoticeStreams {
  stdout: { isTTY?: boolean };
  stderr: { write(chunk: string): unknown };
}

export function getUpdateCheckCachePath(
  appDataDirectory: string = process.env.APPDATA ?? path.join(homedir(), '.config'),
): string {
  return path.join(appDataDirectory, 'aba-payway-sdk', 'update-check.json');
}

/** True iff argv is a non-empty all-help invocation (`--help`/`-h`/`help`). */
export function isTopLevelHelpArgv(argv: string[]): boolean {
  return argv.length > 0 && argv.every((arg) => arg === '--help' || arg === '-h' || arg === 'help');
}

/** Numeric dotted-version comparison; ignores a leading `v`. Equal → false. */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (version: string): number[] =>
    version
      .replace(/^v/, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function readUpdateCache(cachePath: string): UpdateCheckCache | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as UpdateCheckCache).lastCheck === 'number' &&
      typeof (parsed as UpdateCheckCache).latestVersion === 'string'
    ) {
      return parsed as UpdateCheckCache;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchLatestVersion(fetchImpl: typeof fetch, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetchImpl(REGISTRY_LATEST_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

function noticeIfNewer(
  streams: UpdateNoticeStreams,
  currentVersion: string,
  latestVersion: string | null | undefined,
): void {
  if (!latestVersion || !isNewerVersion(currentVersion, latestVersion)) return;
  streams.stderr.write(`  Update available: v${currentVersion} → v${latestVersion} — npm i aba-payway-ts@latest\n`);
}

export async function maybeNoticeUpdate(options: {
  argv: string[];
  currentVersion: string;
  env: NodeJS.ProcessEnv;
  cachePath: string;
  streams: UpdateNoticeStreams;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): Promise<void> {
  const {
    argv,
    currentVersion,
    env,
    cachePath,
    streams,
    fetchImpl = fetch,
    now = Date.now,
    timeoutMs = 1500,
  } = options;
  if (env.PAYWAY_NO_UPDATE_CHECK === '1') return;
  if (!streams.stdout.isTTY) return;
  if (argv.length > 0 && !isTopLevelHelpArgv(argv)) return;

  const cached = readUpdateCache(cachePath);
  if (cached && now() - cached.lastCheck < UPDATE_CHECK_TTL_MS) {
    noticeIfNewer(streams, currentVersion, cached.latestVersion);
    return;
  }
  const latest = await fetchLatestVersion(fetchImpl, timeoutMs);
  if (latest) {
    atomicWriteJson(cachePath, { lastCheck: now(), latestVersion: latest } satisfies UpdateCheckCache);
  }
  noticeIfNewer(streams, currentVersion, latest ?? cached?.latestVersion);
}
