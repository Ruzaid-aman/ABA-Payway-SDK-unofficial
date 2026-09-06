/**
 * Shared test utilities for the vitest suite.
 *
 * Deduplicated from hand-rolled copies across `src/__tests__/` suites
 * (2026-08-30 production review, P1). Not exported from the package index
 * and not reachable from the tsup entries, so it never ships in `dist/`.
 * `vitest` is imported only for `captureConsole`'s spies — safe because
 * this module is consumed exclusively by test files.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { vi } from 'vitest';

/** Path of the built CLI binary the child-process suites spawn. */
export function distCliPath(): string {
  return path.join(process.cwd(), 'dist', 'cli.js');
}

/** Strip ANSI SGR escape sequences so string matching on CLI output is reliable. */
export function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC control character is the entire point
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

/**
 * Hand-rolled `Response` for stubbing `globalThis.fetch` in client-level tests.
 * Carries the full Response surface the client's parsing paths may touch
 * (headers/clone/arrayBuffer/bytes/…); `statusText` is overridable for tests
 * that assert on it.
 */
export function mockJsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => ({}) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/**
 * Spy `console.log`/`warn`/`error` and join everything they print into one
 * string (ANSI left intact — combine with {@link stripAnsi} in assertions).
 * Callers must invoke `restore()` (typically in `afterEach`).
 */
export function captureConsole(): {
  text: () => string;
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
} {
  const lines: string[] = [];
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const push =
    (target: string[]) =>
    (...args: unknown[]) =>
      target.push(args.map((a) => String(a)).join(' '));
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    push(lines)(...args);
    push(stdoutLines)(...args);
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    push(lines)(...args);
    push(stderrLines)(...args);
  });
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    push(lines)(...args);
    push(stderrLines)(...args);
  });
  return {
    text: () => lines.join('\n'),
    stdout: () => stdoutLines.join('\n'),
    stderr: () => stderrLines.join('\n'),
    restore: () => {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    },
  };
}

export interface DistCliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface DistCliOptions {
  env: NodeJS.ProcessEnv;
  cwd?: string;
  input?: string;
  /** Kill-and-fail guard for the async variant (sync variant: spawnSync timeout). */
  timeoutMs?: number;
}

/**
 * Spawn the built CLI asynchronously (streamed output). Prefers
 * `process.execPath` over a bare `node` so the spawned runtime matches the
 * test runtime. Rejects if the child exceeds `timeoutMs` (default 4000).
 */
export function runDistCli(args: string[], options: DistCliOptions): Promise<DistCliResult> {
  const timeoutMs = options.timeoutMs ?? 4_000;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [distCliPath(), ...args], {
      cwd: options.cwd ?? process.cwd(),
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`built CLI did not exit within ${timeoutMs} ms`));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
  });
}

/** Spawn the built CLI synchronously, optionally feeding stdin text. */
export function runDistCliSync(args: string[], options: DistCliOptions): DistCliResult {
  const result = spawnSync(process.execPath, [distCliPath(), ...args], {
    encoding: 'utf8',
    cwd: options.cwd ?? process.cwd(),
    env: options.env,
    input: options.input,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** 1024-bit PKCS#1 RSA keypair — matches the smallest key size PayWay accepts. */
export function generateTestRsaKeyPair(): { publicKey: string; privateKey: string } {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
}

/** Minimal valid KHQR EMVCo payload prefix used across fixtures. */
export const KHQR_SAMPLE_PREFIX = '000201010212';

/**
 * True when `dist/cli.js` is missing or older than the newest buildable
 * source file (src/**, excluding tests and type declarations). Guards the
 * child-process suites against silently testing a stale build.
 */
export function isDistStale(): boolean {
  const distPath = distCliPath();
  if (!existsSync(distPath)) return true;
  const distMtime = statSync(distPath).mtimeMs;
  let newest = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
        newest = Math.max(newest, statSync(full).mtimeMs);
      }
    }
  };
  walk(path.join(process.cwd(), 'src'));
  return newest > distMtime;
}

/**
 * Fail fast (with an actionable message) when the built CLI is missing or
 * stale. Call from `beforeAll` in suites that spawn `dist/cli.js`.
 */
export function requireFreshDist(): void {
  // Under mutation testing the sandbox excludes dist entirely; the guard
  // would otherwise fail every child-process suite and false-kill mutants.
  if (process.env.STRYKER_MUTATOR_ACTIVE) return;
  if (isDistStale()) {
    throw new Error(
      'dist/cli.js is missing or older than src/ - run `npm run build` before this suite (CI builds automatically).',
    );
  }
}
