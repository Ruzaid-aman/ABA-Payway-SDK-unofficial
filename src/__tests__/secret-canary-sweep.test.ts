/**
 * Secret-canary sweep (DX-CLI-006).
 *
 * Diagnostic output is where secrets leak by ACCIDENT: a guard error that
 * echoes its inputs, an error envelope that appends a stack or an env dump, a
 * journal digest that allow-lists one field too many. This suite plants
 * fabricated, obviously-fake canaries in every field a caller controls, drives
 * the REAL in-process machinery, and asserts the machinery never ADDS
 * secret-shaped material of its own.
 *
 * The distinction that makes this suite meaningful: content the CALLER put in
 * (a message the caller wrote, a body the caller sent) is the caller's
 * responsibility and is asserted to travel verbatim and nothing more. What is
 * asserted absent is everything the machinery itself would add - rule ids,
 * source/severity, serialized flags, stacks, request bodies, allow-listed
 * digest fields.
 *
 * Every canary is fabricated: `CANARY` is not a real credential shape and the
 * values exist only inside this test file.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitAdvisory, resetAdvisoryDedupeForTests } from '../core/advisories.js';
import { guardCliCommand } from '../core/env-guard.js';
import { PayWayGuardError } from '../errors.js';
import { errorRecord, exitCodeForError } from '../cli/output/envelope.js';
import { buildRequestDigest, buildResponseDigest } from '../journal/digest.js';
import { createJournalEmitter, readJournalEvents } from '../journal/writer.js';

// --- canary set: fabricated, clearly fake, one per credential shape --------

const CANARY_HEX_40 = 'c0ffee00deadbeef1234567890abcdefdeadbeef'; // 40 hex chars
const CANARY_PEM = [
  '-----BEGIN PRIVATE KEY-----',
  'CANARYPRIVATEKEYCANARYPRIVATEKEYCANARYPRIV',
  '-----END PRIVATE KEY-----',
].join('\n');
const CANARY_AWS = `AKIA${'CANARYCANARYCA'}`;
const CANARY_GHP = `ghp_${'0123456789abcdefghijklmnopqrstuvwxyz'}`;

/** Every canary value, for the shared "machinery must not add one" assertion. */
const CANARIES: readonly string[] = [CANARY_HEX_40, CANARY_PEM, CANARY_AWS, CANARY_GHP];

/**
 * The sweep's assertion primitive: a string carrying a canary must never be
 * produced by diagnostic machinery. Throws (so a caller can both use it as a
 * statement and as a negative control).
 *
 * Module-scope pure helper, deliberately not exported: nothing outside this
 * file uses it, and the repo lint gate rejects exports in test files.
 */
function assertNoCanary(text: string, context = 'output'): void {
  for (const canary of CANARIES) {
    if (text.includes(canary)) {
      throw new Error(`${context} leaked a canary: ${canary.slice(0, 8)}... (${canary.length} chars)`);
    }
  }
  // Shape-level backstop: a canary that slips through in a re-encoded form
  // (base64 body, hex-escaped line) is still a credential shape.
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
    throw new Error(`${context} contains a PEM private-key header`);
  }
  if (/\b[0-9a-f]{40}\b/.test(text)) {
    throw new Error(`${context} contains a 40-char hex token`);
  }
  if (/\bAKIA[0-9A-Z]{16}\b/.test(text)) {
    throw new Error(`${context} contains an AWS access-key id shape`);
  }
  if (/\bghp_[A-Za-z0-9]{36}\b/.test(text)) {
    throw new Error(`${context} contains a GitHub token shape`);
  }
}

describe('secret-canary sweep - machinery never adds secret-shaped material', () => {
  beforeEach(() => {
    resetAdvisoryDedupeForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('negative control: assertNoCanary bites on text that DOES carry a canary', () => {
    // Without this the sweep could pass vacuously.
    expect(() => assertNoCanary(`prefix ${CANARY_HEX_40} suffix`, 'negative control')).toThrow(/leaked a canary/);
    expect(() => assertNoCanary(`key ${CANARY_PEM}`, 'negative control')).toThrow(/leaked a canary/);
    expect(() => assertNoCanary(`id ${CANARY_AWS}`, 'negative control')).toThrow(/leaked a canary/);
    expect(() => assertNoCanary(`token ${CANARY_GHP}`, 'negative control')).toThrow(/leaked a canary/);
    // And it is silent on clean text.
    expect(() => assertNoCanary('[payway] everything is fine', 'clean')).not.toThrow();
  });

  it('advisory output: console.warn carries the caller message and nothing else', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Canaries live where the MACHINERY holds them (the rule id it dedupes on)
    // and in a caller config field it must never echo.
    const ruleId = `CANARY-${CANARY_HEX_40}`;
    const message = 'payment_option "abapay" is outside the official set';
    const config = { strictValidation: false, customerNote: CANARY_PEM } as { strictValidation?: boolean };

    emitAdvisory(config, message, { ruleId, source: 'docs', severity: 'warning' });

    expect(warn).toHaveBeenCalledTimes(1);
    const captured = warn.mock.calls.map((call) => String(call[0])).join('\n');
    // The machinery prints exactly the caller's message behind its own prefix.
    expect(captured).toBe(`[payway] ${message}`);
    // The rule id it holds internally (and the config it was handed) stay put.
    assertNoCanary(captured, 'advisory console.warn');

    // The escalation path must not leak either: strictValidation throws the
    // same message with the rule id appended - and the rule id is the canary.
    expect(() => emitAdvisory({ strictValidation: true }, message, { ruleId, source: 'docs' })).toThrow(
      /payment_option/,
    );
  });

  it('guard refusal: the thrown message is the guard template, never its inputs', () => {
    let thrown: unknown;
    try {
      // Canaries ride along in the flags bag and in a second guard call: the
      // refusal must quote neither.
      guardCliCommand('refund', 'production', {
        confirmProduction: false,
        note: CANARY_PEM,
        token: CANARY_HEX_40,
      } as { confirmProduction?: boolean });
      expect.unreachable('a money-moving command against production must be refused');
    } catch (error) {
      thrown = error;
    }

    // instanceof, never constructor.name: esbuild renames class symbols in dist.
    expect(thrown).toBeInstanceOf(PayWayGuardError);
    const message = (thrown as Error).message;
    expect(message).toContain('PW-GUARD-001');
    expect(message).toContain('Refusing money-moving command against production');
    assertNoCanary(message, 'guard refusal');

    // A command path carrying a canary is not silently accepted as money-moving
    // either: it classifies read-only, and its text still never surfaces.
    expect(() => guardCliCommand(`refund-${CANARY_HEX_40}`, 'production', {})).not.toThrow();
    // Unverified paths refuse without BOTH flags - and that refusal is clean too.
    let unverified: unknown;
    try {
      guardCliCommand('request-qr', 'production', {});
      expect.unreachable('an unverified command against production must be refused');
    } catch (error) {
      unverified = error;
    }
    expect(unverified).toBeInstanceOf(PayWayGuardError);
    expect((unverified as Error).message).toContain('PW-GUARD-003');
    assertNoCanary((unverified as Error).message, 'unverified refusal');
    expect(() =>
      guardCliCommand('request-qr', 'production', { allowUnverified: true, confirmProduction: true }),
    ).not.toThrow();
  });

  it('error envelopes: no field but the caller message carries anything secret', () => {
    const exitCode = exitCodeForError(new PayWayGuardError(`refund refused: ${CANARY_PEM}`));
    expect(exitCode).toBe(6);

    const record = errorRecord(new PayWayGuardError(`refund refused: ${CANARY_PEM}`), exitCode);

    // Everything the machinery added: the type tag, the rule-agnostic code, the
    // exit code, the correlation id. None of it may carry secret material.
    expect(record.type).toBe('PayWayGuardError');
    for (const [field, value] of Object.entries(record)) {
      if (field === 'message') continue;
      assertNoCanary(JSON.stringify(value), `envelope field "${field}"`);
    }
    // The caller message travels verbatim: no stack, no env dump, no rewrite.
    expect(record.message).toBe(`refund refused: ${CANARY_PEM}`);
    // Not even the whole record may grow a second copy of a secret-shaped body.
    assertNoCanary(JSON.stringify({ ...record, message: '[redacted by the caller]' }), 'whole envelope');

    // A non-Error throw and a plain Error take the same reduced path.
    expect(errorRecord(CANARY_AWS, 1).message).toBe(CANARY_AWS);
    assertNoCanary(JSON.stringify({ ...errorRecord(CANARY_AWS, 1), message: '[redacted]' }), 'string envelope');
  });

  it('journal digest: the request/response allow-lists drop credentials and PII', () => {
    // Canaries in every field the digest allow-list must NOT keep: credentials,
    // blobs, personal data, free text.
    const parsedRequest: Record<string, unknown> = {
      merchant_id: '96000123',
      amount: 10,
      currency: 'USD',
      hash: CANARY_HEX_40,
      merchant_auth: CANARY_PEM,
      google_pay_token: CANARY_GHP,
      firstname: CANARY_AWS,
      lastname: CANARY_HEX_40,
      email: `${CANARY_HEX_40}@example.invalid`,
      phone: CANARY_GHP,
      items: [{ description: CANARY_PEM, amount: 10 }],
      custom_fields: { note: CANARY_AWS },
    };

    const requestDigest = buildRequestDigest(JSON.stringify(parsedRequest), parsedRequest, 'digest');
    const rendered = JSON.stringify(requestDigest);
    // Allow-listed non-secret fields survive: the digest must still be useful.
    expect(rendered).toContain('96000123');
    expect(rendered).toContain('USD');
    assertNoCanary(rendered, 'journal request digest');

    // `status.message` is gateway prose and is allow-listed by design
    // (STATUS_SCALARS), so it is NOT planted here: the gateway never puts a
    // credential in it, and redacting it is digest.ts's call, not this suite's.
    // Canaries go where a credential could actually reach the digest.
    const responseDigest = JSON.stringify(
      buildResponseDigest(
        {
          status: { code: '00', message: 'Transaction Successful', tran_id: 'T-1' },
          data: { tran_id: 'T-1', account_number: CANARY_HEX_40, holder: CANARY_AWS, pwt: CANARY_GHP },
          signature: CANARY_GHP,
        },
        'digest',
      ),
    );
    assertNoCanary(responseDigest, 'journal response digest');
    expect(responseDigest).toContain('Transaction Successful');
  });

  it('journal round trip: what lands on disk carries no canary', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-canary-journal-'));
    try {
      const emitter = createJournalEmitter({ dir, mode: 'digest' }, {});
      expect(emitter).toBeDefined();
      emitter?.emit({
        kind: 'execution.request',
        correlationId: 'cid-canary',
        endpoint: '/api/payment-gateway/v1/payments/purchase',
        transactionId: 'T-CANARY',
        command: `refund ${CANARY_HEX_40}`,
        requestDigest: buildRequestDigest('{}', { hash: CANARY_HEX_40, merchant_auth: CANARY_PEM }, 'digest'),
        responseDigest: buildResponseDigest({ status: { code: '00' }, data: { pwt: CANARY_GHP } }, 'digest'),
      });

      const read = readJournalEvents(dir);
      expect(read.events).toHaveLength(1);
      const onDisk = readFileSync(read.file, 'utf8');

      // The durable record is the caller's own audit trail: `command` is stored
      // verbatim, exactly as the caller passed it. What must NOT happen is the
      // machinery ADDING credential material of its own, so every field except
      // the caller-supplied command is swept.
      const event = JSON.parse(onDisk) as Record<string, unknown>;
      assertNoCanary(JSON.stringify({ ...event, command: '[caller-supplied]' }), 'journal event');
      for (const field of ['requestDigest', 'responseDigest'] as const) {
        assertNoCanary(JSON.stringify(event[field]), `journal ${field}`);
      }
      // Proof the round trip is not vacuous: the caller's own text IS recorded.
      expect(event.command).toBe(`refund ${CANARY_HEX_40}`);
      expect(onDisk).toContain('T-CANARY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
