/**
 * `payway-sdk docs` — the offline knowledge door (2026-09-12 knowledge wave).
 * Covers the store (resolve/read/search) and the command contract (list,
 * topic, search, --json envelopes) through the in-process runCli harness.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTopics, readTopic, searchKnowledge } from '../knowledge/store.js';
import { captureConsole, stripAnsi } from '../test/test-utils.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpusDir = path.join(repoRoot, 'knowledge');

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  // runCli commands set process.exitCode on failures; reset for later suites.
  process.exitCode = undefined;
});

async function run(argv: string[]): Promise<{ stdout: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { stdout: captured.stdout(), exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('knowledge store', () => {
  it('resolves the repo corpus and lists topics', () => {
    const found = listTopics(corpusDir);
    expect(found).not.toBeNull();
    expect(found!.topics.length).toBeGreaterThanOrEqual(29);
    expect(found!.topics.some((t) => t.topic === 'quickstart')).toBe(true);
  });

  it('reads a topic by slug and by unique prefix', () => {
    const exact = readTopic('quickstart', corpusDir);
    expect(exact?.status).toBe('ok');
    if (exact?.status === 'ok') expect(exact.content).toContain('ABA PayWay SDK quickstart');

    const prefixed = readTopic('payment-link', corpusDir);
    expect(prefixed?.status).toBe('ok');
  });

  it('serves endpoint-specific API datetime and timezone guidance', () => {
    const result = readTopic('api-datetime-timezones', corpusDir);
    expect(result?.status).toBe('ok');
    if (result?.status !== 'ok') return;

    expect(result.content).toContain('Asia/Phnom_Penh');
    expect(result.content).toContain('Get Token Details');
    expect(result.content).toContain('explicit UTC');
    expect(result.content).toContain('Payout');
    expect(result.content).toContain('explicit UTC+7');
  });

  it('reports ambiguous prefixes instead of guessing', () => {
    const ambiguous = readTopic('e', corpusDir); // errors-and-debugging, error-codes, …
    expect(ambiguous?.status).toBe('ambiguous');
  });

  it('reports missing topics', () => {
    expect(readTopic('no-such-topic', corpusDir)?.status).toBe('missing');
  });

  it('searches with multi-term AND semantics', () => {
    const single = searchKnowledge('lifetime', corpusDir);
    expect(single!.hits.length).toBeGreaterThan(0);
    const multi = searchKnowledge('callback verify', corpusDir);
    expect(multi!.hits.length).toBeGreaterThan(0);
    // Assert against the FULL source line (hit.text is display-truncated).
    for (const hit of multi!.hits) {
      const line = readFileSync(path.join(corpusDir, hit.file), 'utf8').split(/\r?\n/)[hit.line - 1] ?? '';
      const text = line.toLowerCase();
      expect(text.includes('callback') && text.includes('verify')).toBe(true);
    }
    const none = searchKnowledge('zzzunfindablezzz', corpusDir);
    expect(none!.totalHits).toBe(0);
  });
});

describe('docs command', () => {
  it('lists topics as one JSON document under --json', async () => {
    const { stdout, exitCode } = await run(['docs', 'list', '--json']);
    const parsed = JSON.parse(stdout) as { topics: Array<{ topic: string }> };
    expect(parsed.topics.length).toBeGreaterThanOrEqual(29);
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('serves a topic under --json with content and metadata', async () => {
    const { stdout } = await run(['docs', 'quickstart', '--json']);
    const parsed = JSON.parse(stdout) as { topic: string; title: string; content: string };
    expect(parsed.topic).toBe('quickstart');
    expect(parsed.content.length).toBeGreaterThan(500);
  });

  it('serves raw content to stdout in human mode (no profile banner)', async () => {
    const { stdout } = await run(['docs', 'sdk-cli-reference']);
    expect(stdout).not.toContain('Using profile');
    expect(stdout).toContain('SDK & CLI reference');
    expect(stripAnsi(stdout).length).toBeGreaterThan(1000);
  });

  it('searches and returns hits under --json', async () => {
    const { stdout } = await run(['docs', 'search', 'callback', 'hmac', '--json']);
    const parsed = JSON.parse(stdout) as { query: string; totalHits: number; hits: Array<{ topic: string }> };
    expect(parsed.query).toBe('callback hmac');
    expect(parsed.totalHits).toBeGreaterThan(0);
  });

  it('emits the uniform error envelope for unknown topics under --json', async () => {
    const { stdout, exitCode } = await run(['docs', 'bogus-topic', '--json']);
    const parsed = JSON.parse(stdout) as { error?: { kind?: string; exitCode?: number } };
    expect(parsed.error?.kind).toBe('validation');
    expect(parsed.error?.exitCode).toBe(1);
    expect(exitCode).toBe(1);
  });

  it('rejects an empty search with the envelope under --json', async () => {
    const { stdout, exitCode } = await run(['docs', 'search', '--json']);
    const parsed = JSON.parse(stdout) as { error?: { kind?: string } };
    expect(parsed.error?.kind).toBe('validation');
    expect(exitCode).toBe(1);
  });
});
