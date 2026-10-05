/**
 * stdout-purity contract (audit C2): under `--json`, every failure path of
 * every command that declares the flag prints EXACTLY ONE parseable JSON
 * document on stdout — never a human ANSI block, never a banner plus an
 * envelope. The C2 defect was `assertCredentialsPresent()` printing its human
 * block to stdout on 20+ commands because the call site did not forward
 * `opts.json`; this table drives every such command with credentials scrubbed
 * so the failure path is the missing-credentials pre-flight (plus the named
 * local-validation failures), and the whole stdout must JSON.parse.
 *
 * Same harness rules as cli-machine-contract.test.ts: chdir before import,
 * isolated APPDATA (no profile store → no pre-action activation), exitCode
 * save/restore. Additionally PAYWAY_* is scrubbed — otherwise developer-shell
 * credentials would let commands run past the pre-flight toward real API
 * calls.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-stdout-purity-'));
const originalCwd = process.cwd();
const originalAppData = process.env.APPDATA;
const savedPaywayEnv: Array<[string, string | undefined]> = [];

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  process.env.APPDATA = tempDir;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('PAYWAY_')) {
      savedPaywayEnv.push([key, process.env[key]]);
      delete process.env[key];
    }
  }
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  for (const [key, value] of savedPaywayEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

async function run(argv: string[]): Promise<string> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return captured.stdout();
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

interface ErrorEnvelope {
  error: { kind: string; exitCode: number; message: string; [key: string]: unknown };
}

function expectOneJsonDocument(stdout: string): unknown {
  // Exactly one JSON document: parse the WHOLE stdout — a banner or ANSI line
  // anywhere before/after the document fails here (that is the C2 defect).
  let parsed: unknown;
  expect(() => {
    parsed = JSON.parse(stdout);
  }).not.toThrow();
  return parsed;
}

function expectOneErrorEnvelope(stdout: string): ErrorEnvelope {
  const parsed = expectOneJsonDocument(stdout) as ErrorEnvelope;
  expect(parsed.error).toBeDefined();
  expect(typeof parsed.error.kind).toBe('string');
  expect(typeof parsed.error.exitCode).toBe('number');
  expect(typeof parsed.error.message).toBe('string');
  return parsed;
}

/**
 * Commands whose --json failure paths are driven WITHOUT credentials in the
 * environment: the missing-credentials pre-flight itself must emit the
 * envelope. One row per command that declares --json; args are the minimum
 * to get past Commander's required-option validation.
 */
const JSON_FAILURE_CASES: Array<{ name: string; argv: string[] }> = [
  { name: 'check-transaction', argv: ['check-transaction', '-t', 'tx-1', '--json'] },
  { name: 'poll-transaction', argv: ['poll-transaction', '-t', 'tx-1', '--json'] },
  { name: 'close-transaction', argv: ['close-transaction', '-t', 'tx-1', '-y', '--json'] },
  { name: 'transaction-detail', argv: ['transaction-detail', '-t', 'tx-1', '--json'] },
  { name: 'transaction-list', argv: ['transaction-list', '--json'] },
  { name: 'get-transactions-by-ref', argv: ['get-transactions-by-ref', '-r', 'ref-1', '--json'] },
  { name: 'exchange-rate', argv: ['exchange-rate', '--json'] },
  { name: 'refund', argv: ['refund', '-t', 'tx-1', '-a', '1', '--json'] },
  { name: 'tx-batch check', argv: ['tx-batch', 'check', '-t', 'tx-1', '--json'] },
  { name: 'request-qr', argv: ['request-qr', '-c', 'USD', '-y', '--json'] },
  {
    name: 'generate-checkout',
    argv: ['generate-checkout', '-a', '1', '-c', 'USD', '--return-url', 'https://example.test/return', '--json'],
  },
  {
    name: 'payment-link create (-y declared, audit M4)',
    argv: [
      'payment-link',
      'create',
      '-t',
      'Invoice 1',
      '-a',
      '1',
      '-r',
      'ref-1',
      '--return-url',
      'https://example.test/return',
      '-y',
      '--json',
    ],
  },
  { name: 'payment-link detail', argv: ['payment-link', 'detail', '-i', 'link-1', '--json'] },
  { name: 'payment-link void', argv: ['payment-link', 'void', '-i', 'link-1', '-y', '--json'] },
  { name: 'payout', argv: ['payout', '-t', 'tx-1', '-a', '1', '-b', '500000001:10', '--json'] },
  {
    name: 'cof link-account',
    argv: ['cof', 'link-account', '-r', 'req0001', '-c', 'cust01', '-f', 'CITI_FLEX', '-y', '--json'],
  },
  { name: 'cof link-card', argv: ['cof', 'link-card', '-r', 'req0001', '-c', 'cust01', '-f', 'CITI_FLEX', '--json'] },
  { name: 'cof charge', argv: ['cof', 'charge', '-t', 'tx-1', '-a', '1', '--token', 'pwt-test', '--json'] },
  {
    name: 'cof token renew',
    argv: ['cof', 'token', 'renew', '-r', 'req0002', '-c', 'cust01', '--token', 'pwt-test', '--json'],
  },
  { name: 'cof token details', argv: ['cof', 'token', 'details', '-r', 'req0001', '--json'] },
  { name: 'cof token remove', argv: ['cof', 'token', 'remove', '-c', 'cust01', '--token', 'pwt-test', '--json'] },
  { name: 'cof token-flag-sweep', argv: ['cof', 'token-flag-sweep', '-c', 'cust01', '--json'] },
  { name: 'beneficiary add', argv: ['beneficiary', 'add', '500000001', '--json'] },
  { name: 'beneficiary update-status', argv: ['beneficiary', 'update-status', '500000001', '-s', '1', '--json'] },
  { name: 'pre-auth complete', argv: ['pre-auth', 'complete', '-t', 'tx-1', '-a', '1', '--json'] },
  {
    name: 'pre-auth complete-payout',
    argv: [
      'pre-auth',
      'complete-payout',
      '-t',
      'tx-1',
      '-a',
      '1',
      '--payout',
      '[{"acc":"500000001","amt":10}]',
      '--json',
    ],
  },
  { name: 'pre-auth cancel', argv: ['pre-auth', 'cancel', '-t', 'tx-1', '-y', '--json'] },
  {
    name: 'self-activation new-merchant',
    argv: [
      'self-activation',
      'new-merchant',
      '--pushback-url',
      'https://example.test/pb',
      '--redirect-url',
      'https://example.test/rd',
      '--register-ref',
      'req-1',
      '--currency',
      'USD',
      '--json',
    ],
  },
  {
    name: 'self-activation credential-info',
    argv: ['self-activation', 'credential-info', '--register-ref', 'req-1', '--json'],
  },
  { name: 'self-activation mc-info', argv: ['self-activation', 'mc-info', '--merchant-key', 'mk-1', '--json'] },
  { name: 'explain unknown code (positive control)', argv: ['explain', 'ZZZ999', '--json'] },
];

/**
 * Local-validation failures driven past the pre-flight with DUMMY credentials
 * (the validation fires after the credential check but before any network
 * call). These pin the named C2 local-validation violations.
 */
const DUMMY_CREDENTIALS: Record<string, string> = {
  PAYWAY_MERCHANT_ID: '99999999',
  PAYWAY_API_KEY: '0123456789abcdef0123456789abcdef',
};

const LOCAL_VALIDATION_CASES: Array<{ name: string; argv: string[]; withDummyCredentials?: boolean }> = [
  {
    name: 'poll-transaction rejects a malformed transaction id',
    argv: ['poll-transaction', '-t', 'bad id!', '--json'],
  },
  {
    name: 'sandbox-beneficiaries rejects a bad --currency filter',
    argv: ['sandbox-beneficiaries', '--currency', 'GBP', '--json'],
  },
  {
    name: 'sandbox-test-cards rejects a bad --outcome filter',
    argv: ['sandbox-test-cards', '--outcome', 'bogus', '--json'],
  },
  {
    name: 'payment-link create rejects a non-positive amount before the pre-flight',
    argv: [
      'payment-link',
      'create',
      '-t',
      'Invoice 1',
      '-a',
      '0',
      '-r',
      'ref-1',
      '--return-url',
      'https://example.test/return',
      '-y',
      '--json',
    ],
  },
  {
    name: 'cof charge rejects a non-positive amount',
    argv: ['cof', 'charge', '-t', 'tx-1', '-a', '0', '--token', 'pwt-test', '--json'],
    withDummyCredentials: true,
  },
  {
    name: 'transaction-list rejects a malformed --from date',
    argv: ['transaction-list', '--from', 'bogus', '--json'],
    withDummyCredentials: true,
  },
  {
    name: 'tx-batch close requires -y/--force under --json',
    argv: ['tx-batch', 'close', '-t', 'tx-1', '--json'],
    withDummyCredentials: true,
  },
];

/**
 * Structured-output commands (no `--json` flag; machine mode is the global
 * `--output json|ndjson`): the failure lands in the PaymentCommandResult
 * envelope (`creation.error`), which must still be the ONLY stdout document.
 */
const STRUCTURED_FAILURE_CASES: Array<{ name: string; argv: string[] }> = [
  { name: 'generate-qr', argv: ['generate-qr', '-a', '1', '-c', 'USD', '--output', 'json'] },
];

describe('stdout purity under --json (audit C2)', () => {
  it.each(JSON_FAILURE_CASES.map((c) => [c.name, c.argv]))(
    '%s emits exactly one error envelope on stdout',
    async (_name, argv) => {
      const stdout = await run(argv);
      expect(stdout.trim()).not.toBe('');
      expectOneErrorEnvelope(stdout);
    },
    20_000,
  );

  it.each(LOCAL_VALIDATION_CASES.map((c) => [c.name, c.argv, c.withDummyCredentials ?? false]))(
    '%s emits exactly one error envelope on stdout',
    async (_name, argv, withDummyCredentials) => {
      for (const [key, value] of Object.entries(DUMMY_CREDENTIALS)) {
        if (withDummyCredentials) process.env[key] = value;
      }
      try {
        const stdout = await run(argv);
        expect(stdout.trim()).not.toBe('');
        expectOneErrorEnvelope(stdout);
      } finally {
        if (withDummyCredentials) {
          for (const key of Object.keys(DUMMY_CREDENTIALS)) delete process.env[key];
        }
      }
    },
    20_000,
  );

  it.each(STRUCTURED_FAILURE_CASES.map((c) => [c.name, c.argv]))(
    '%s under --output json emits exactly one structured document on stdout',
    async (_name, argv) => {
      const stdout = await run(argv);
      expect(stdout.trim()).not.toBe('');
      const parsed = expectOneJsonDocument(stdout) as { error?: unknown; creation?: { error?: unknown } };
      expect(parsed.error ?? parsed.creation?.error).toBeDefined();
    },
    20_000,
  );
});
