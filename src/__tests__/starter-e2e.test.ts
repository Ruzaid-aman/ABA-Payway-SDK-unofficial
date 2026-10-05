/**
 * Generated first-payment starter acceptance (audit S01): `payway-sdk init`
 * must produce a starter whose PRINTED command actually works from only the
 * documented env setup — populate `.env`, run the printed command, and the
 * configuration must reach the SDK. Node does not read .env unprompted, so
 * the printed command carries `--env-file-if-exists=.env`.
 *
 * Environment note: spawned child processes cannot open loopback TCP to a
 * parent-hosted server on some Windows setups (observed: node:http AND fetch
 * hang from children while the parent connects fine), so the full create is
 * exercised in-process against an in-process stub, while the printed-command
 * child run proves .env → SDK propagation via the SDK's pre-network callback
 * validation (no TCP involved) and the recovery leg proves the original
 * attempt id is preserved.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInit } from '../cli/commands/init.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-starter-e2e-'));

let stub: Server;
let stubPort = 0;
const createdTranIds: string[] = [];

beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk));
    req.on('end', () => {
      try {
        const body = JSON.parse(raw) as { tran_id?: string };
        if (body.tran_id) createdTranIds.push(body.tran_id);
      } catch {
        // non-JSON create — not expected on this path
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: { code: '0', message: 'Success!' }, qrString: 'stub-qr-payload' }));
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  stubPort = (stub.address() as { port: number }).port;
});

afterAll(() => {
  stub?.close();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Windows may hold the junction briefly — harmless.
  }
});

/** Child env: ambient PAYWAY_* stripped so .env is the ONLY config source. */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('PAYWAY_')) env[key] = value;
  }
  return env;
}

function runPrintedCommand(
  dir: string,
  nextCommand: string,
): { status: number | null; stdout: string; stderr: string } {
  // The printed command is `node --env-file-if-exists=.env payway-first-payment.mjs`.
  const args = nextCommand.replace(/^node\s+/, '').split(/\s+/);
  return spawnSync(process.execPath, args, { cwd: dir, env: childEnv(), encoding: 'utf8' });
}

function scaffold(sub: string, envLines: string[]): { dir: string; nextCommand: string } {
  const dir = path.join(tempDir, sub);
  mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  symlinkSync(repoRoot, path.join(dir, 'node_modules', 'aba-payway-ts'), 'junction');
  const result = runInit({ cwd: dir, mode: 'sandbox', template: 'first-payment' });
  writeFileSync(path.join(dir, '.env'), `${envLines.join('\n')}\n`, 'utf8');
  return { dir, nextCommand: result.nextCommand };
}

/**
 * Loads the scaffold's .env through Node's own env-file loader and applies
 * it to process.env — so the generated file runs against exactly the
 * documented configuration surface.
 */
async function withDotenvApplied<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const child = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', '-e', 'console.log(JSON.stringify(process.env))'],
    { cwd: dir, env: childEnv(), encoding: 'utf8' },
  );
  const envFromDotenv = JSON.parse(child.stdout) as NodeJS.ProcessEnv;
  const saved: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(envFromDotenv)) {
    if (key.startsWith('PAYWAY_')) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('generated first-payment starter (S01)', () => {
  it('prints an env-loading run command', () => {
    const dir = path.join(tempDir, 'cmdcheck');
    mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    const result = runInit({ cwd: dir, mode: 'sandbox', template: 'first-payment' });
    // Audit S01 acceptance: the printed command itself must load .env —
    // bare `node payway-first-payment.mjs` left the starter blind to it.
    expect(result.nextCommand).toBe('node --env-file-if-exists=.env payway-first-payment.mjs');
  });

  it('propagates .env configuration to the SDK through the printed command (child run)', () => {
    // Deliberately-private callback: the SDK's pre-network validation
    // rejects it while ECHOING the configured value — deterministic proof
    // that the .env values reached the SDK through the printed command,
    // with no TCP (children cannot reach parent-hosted loopback here).
    const { dir, nextCommand } = scaffold('childpropagation', [
      'PAYWAY_ENV=sandbox',
      'PAYWAY_MERCHANT_ID=stub-merchant',
      'PAYWAY_API_KEY=stub-api-key',
      'PAYWAY_CALLBACK_URL=http://127.0.0.1:8080/private-callback',
    ]);
    const run = runPrintedCommand(dir, nextCommand);
    expect(run.status, `unexpected outcome: ${run.stderr.slice(0, 300)}`).not.toBe(0);
    // The configured (private) callback value reached the SDK's validator:
    // this message fires ONLY when PAYWAY_CALLBACK_URL was loaded from .env
    // (missing config would fail earlier with the starter's own message).
    expect(`${run.stdout}\n${run.stderr}`).toContain('must be a public HTTPS URL');
    // And the env-file was loaded by the printed command, not ambient env.
    expect(`${run.stdout}\n${run.stderr}`).not.toContain('PAYWAY_CALLBACK_URL is required');
  });

  it('creates a payment from .env config against the gateway (in-process stub)', async () => {
    const { dir } = scaffold('happy', [
      'PAYWAY_ENV=sandbox',
      'PAYWAY_MERCHANT_ID=stub-merchant',
      'PAYWAY_API_KEY=stub-api-key',
      `PAYWAY_BASE_URL=http://127.0.0.1:${stubPort}`,
      'PAYWAY_CALLBACK_URL=https://example.com/payway-callback',
    ]);
    // Execute the EXACT generated file (top-level await runs on import)
    // with only the .env values as configuration.
    await withDotenvApplied(dir, () => import(pathToFileURL(path.join(dir, 'payway-first-payment.mjs')).href));
    expect(createdTranIds.length).toBeGreaterThan(0);
    expect(createdTranIds[0].length).toBeLessThanOrEqual(20);
  });

  it('preserves the original transaction id when the gateway is unreachable', async () => {
    const { dir } = scaffold('unreachable', [
      'PAYWAY_ENV=sandbox',
      'PAYWAY_MERCHANT_ID=stub-merchant',
      'PAYWAY_API_KEY=stub-api-key',
      // Port 1 on loopback — connection refused fast from the parent.
      'PAYWAY_BASE_URL=http://127.0.0.1:1',
      'PAYWAY_CALLBACK_URL=https://example.com/payway-callback',
    ]);
    const captured = { stdout: '', stderr: '' };
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => {
      captured.stdout += args.join(' ');
    };
    console.error = (...args: unknown[]) => {
      captured.stderr += args.join(' ');
    };
    await withDotenvApplied(dir, async () => {
      await expect(import(pathToFileURL(path.join(dir, 'payway-first-payment.mjs')).href)).rejects.toThrow();
    });
    console.log = originalLog;
    console.error = originalError;
    // Recovery contract: the ORIGINAL attempt id is preserved so the
    // operator can check it before creating a replacement.
    const transcript = `${captured.stdout}\n${captured.stderr}`;
    expect(transcript).toContain('Check pay-');
    expect(/pay-[0-9a-z]+/.exec(transcript)).toBeTruthy();
  });
});
