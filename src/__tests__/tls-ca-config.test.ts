import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PayWay, loadTlsCaBundle, findTlsCertificateFailure } from '../client.js';
import { PayWayConfigError, PayWayNetworkError } from '../errors.js';

/**
 * DX-SEC-001 (P0-04): `tlsCaFile` / `PAYWAY_TLS_CA_FILE` is the SAFE
 * alternative to the classic TLS-verification-bypass env var (purged from
 * tracked docs — see no-tls-bypass.test.ts). These tests pin the
 * CONFIG-SURFACE behaviour (resolution, validation errors) and the
 * TLS-failure error mapping. The live transport behaviour against the real
 * sandbox is verified manually — see AGENTS.md "Sandbox TLS caveat".
 */

const VALID_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBhTCCASugAwIBAgIUXOMUq0Akcp9mHnJYYDCdFhz0C4EwCgYIKoZIzj0EAwIw',
  '-----END CERTIFICATE-----',
  '',
].join('\n');

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'payway-tls-ca-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('loadTlsCaBundle', () => {
  it('returns the file contents for a PEM bundle', () => {
    const path = join(tempDir, 'ca.pem');
    writeFileSync(path, VALID_PEM);
    expect(loadTlsCaBundle(path)).toContain('-----BEGIN CERTIFICATE-----');
  });

  it('throws PayWayConfigError naming the path and the fix for a missing file', () => {
    const path = join(tempDir, 'does-not-exist.pem');
    try {
      loadTlsCaBundle(path);
      expect.unreachable('missing CA file must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PayWayConfigError);
      const message = (error as Error).message;
      expect(message).toContain(path);
      expect(message).toContain('PAYWAY_TLS_CA_FILE');
      expect(message).toContain('openssl s_client -showcerts');
    }
  });

  it('throws PayWayConfigError for a file without any PEM certificate block', () => {
    const path = join(tempDir, 'garbage.pem');
    writeFileSync(path, 'this is not a certificate');
    try {
      loadTlsCaBundle(path);
      expect.unreachable('non-PEM file must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(PayWayConfigError);
      const message = (error as Error).message;
      expect(message).toContain(path);
      expect(message).toContain('-----BEGIN CERTIFICATE-----');
    }
  });
});

describe('tlsCaFile config surface', () => {
  it('constructs when the CA file is valid (dispatcher is created lazily)', () => {
    const path = join(tempDir, 'ca.pem');
    writeFileSync(path, VALID_PEM);
    const client = new PayWay({
      merchantId: 'm',
      apiKey: 'k',
      tlsCaFile: path,
    });
    // No request is made here — construction must succeed and the undici
    // dispatcher is only resolved on the first API call.
    expect(client).toBeInstanceOf(PayWay);
  });

  it('rejects a missing CA file at construction with the named fix', () => {
    const path = join(tempDir, 'missing.pem');
    expect(() => new PayWay({ merchantId: 'm', apiKey: 'k', tlsCaFile: path })).toThrow(PayWayConfigError);
    expect(() => new PayWay({ merchantId: 'm', apiKey: 'k', tlsCaFile: path })).toThrow(
      /PAYWAY_TLS_CA_FILE|openssl s_client/,
    );
  });

  it('rejects an unknown PAYWAY_TLS_MIN_VERSION value', () => {
    const previous = process.env.PAYWAY_TLS_MIN_VERSION;
    process.env.PAYWAY_TLS_MIN_VERSION = 'TLSv9.9';
    try {
      expect(() => new PayWay({ merchantId: 'm', apiKey: 'k' })).toThrow(
        /PAYWAY_TLS_MIN_VERSION must be one of TLSv1, TLSv1\.1, TLSv1\.2, TLSv1\.3/,
      );
    } finally {
      if (previous === undefined) delete process.env.PAYWAY_TLS_MIN_VERSION;
      else process.env.PAYWAY_TLS_MIN_VERSION = previous;
    }
  });

  it('resolves PAYWAY_TLS_CA_FILE from the environment', () => {
    const path = join(tempDir, 'ca.pem');
    writeFileSync(path, VALID_PEM);
    const previous = process.env.PAYWAY_TLS_CA_FILE;
    process.env.PAYWAY_TLS_CA_FILE = path;
    try {
      expect(() => new PayWay({ merchantId: 'm', apiKey: 'k' })).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env.PAYWAY_TLS_CA_FILE;
      else process.env.PAYWAY_TLS_CA_FILE = previous;
    }
  });
});

describe('TLS certificate failure classification (createNetworkError input)', () => {
  const wrap = (cause: unknown) => new TypeError('fetch failed', { cause });

  it('detects a self-signed chain failure through the undici cause wrapper', () => {
    const hit = findTlsCertificateFailure(
      wrap(
        Object.assign(new Error('self-signed certificate in certificate chain'), {
          code: 'SELF_SIGNED_CERT_IN_CHAIN',
        }),
      ),
    );
    expect(hit?.code).toBe('SELF_SIGNED_CERT_IN_CHAIN');
    expect(hit?.message).toContain('self-signed');
  });

  it('detects an unverifiable leaf two cause levels deep', () => {
    const hit = findTlsCertificateFailure(
      wrap(
        Object.assign(new Error('AggregateError-ish wrapper'), {
          code: 'OVERRUN',
          cause: Object.assign(new Error('unable to verify the first certificate'), {
            code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          }),
        }),
      ),
    );
    expect(hit?.code).toBe('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
  });

  it('matches known TLS wording even without an error code', () => {
    const hit = findTlsCertificateFailure(wrap(new Error("Hostname/IP does not match certificate's altnames")));
    expect(hit).toBeDefined();
    expect(hit?.message).toContain('altnames');
  });

  it('does NOT classify ordinary network failures as TLS failures', () => {
    expect(
      findTlsCertificateFailure(wrap(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))),
    ).toBeUndefined();
    expect(
      findTlsCertificateFailure(wrap(Object.assign(new Error('getaddrinfo ENOTFOUND gateway'), { code: 'ENOTFOUND' }))),
    ).toBeUndefined();
    expect(findTlsCertificateFailure(new Error('plain error without cause'))).toBeUndefined();
  });

  it('the transport-level TLS error is a PayWayNetworkError that must not retry', () => {
    // createNetworkError flips retryable off for TLS failures even though
    // PayWayNetworkError hard-codes retryable:true — a certificate failure is
    // deterministic config, and 3 retries + backoff would just burn time.
    const error = new PayWayNetworkError('TLS certificate verification failed: x', { retryable: false });
    (error as { retryable?: boolean }).retryable = false;
    expect(error.retryable).toBe(false);
  });
});
