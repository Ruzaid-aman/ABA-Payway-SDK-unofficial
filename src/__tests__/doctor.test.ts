import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../cli/commands/doctor.js';

const TEST_DIR = path.join(process.cwd(), '.test-doctor-temp');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('runDoctor', () => {
  it('returns a valid DoctorResult', () => {
    const result = runDoctor({ cwd: TEST_DIR });
    expect(result.checks).toBeInstanceOf(Array);
    expect(result.envIssues).toBeInstanceOf(Array);
    expect(result.framework).toBeDefined();
    expect(result.frameworkEvidence).toBeInstanceOf(Array);
    expect(typeof result.allHealthy).toBe('boolean');
  });

  it('reports .env file missing when no .env exists', () => {
    const result = runDoctor({ cwd: TEST_DIR });
    const envCheck = result.checks.find((c) => c.id === 'env-file');
    expect(envCheck).toBeDefined();
    expect(envCheck?.ok).toBe(false);
    expect(envCheck?.fix).toContain('payway-sdk init');
  });

  it('reports .env file present when it exists', () => {
    writeFileSync(path.join(TEST_DIR, '.env'), 'PAYWAY_ENV=sandbox\n');
    const result = runDoctor({ cwd: TEST_DIR });
    const envCheck = result.checks.find((c) => c.id === 'env-file');
    expect(envCheck?.ok).toBe(true);
  });

  it('reads .env file and merges with process.env', () => {
    writeFileSync(path.join(TEST_DIR, '.env'), 'PAYWAY_ENV=sandbox\nPAYWAY_MERCHANT_ID=test-merchant\n');
    const result = runDoctor({ cwd: TEST_DIR, env: {} });
    const merchantCheck = result.checks.find((c) => c.id === 'env-PAYWAY_MERCHANT_ID');
    expect(merchantCheck?.ok).toBe(true);
  });

  it('reports missing env vars as errors', () => {
    const result = runDoctor({ cwd: TEST_DIR, env: {} });
    const envCheck = result.checks.find((c) => c.id === 'env-file');
    expect(envCheck?.ok).toBe(false);

    const merchantCheck = result.checks.find((c) => c.id === 'env-PAYWAY_MERCHANT_ID');
    expect(merchantCheck?.ok).toBe(false);
  });

  it('reports all healthy when everything is configured', () => {
    writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({ dependencies: { express: '^4.18.0' } }));
    writeFileSync(
      path.join(TEST_DIR, '.env'),
      [
        'PAYWAY_ENV=sandbox',
        'PAYWAY_MERCHANT_ID=test-merchant',
        `PAYWAY_API_KEY=${'a'.repeat(32)}`,
        'PAYWAY_CALLBACK_URL=https://example.com/payway/callback',
        'PAYWAY_RETURN_URL=https://example.com/return',
      ].join('\n'),
    );
    const result = runDoctor({ cwd: TEST_DIR });
    expect(result.allHealthy).toBe(true);
  });

  it('warns about short API key', () => {
    writeFileSync(
      path.join(TEST_DIR, '.env'),
      [
        'PAYWAY_ENV=sandbox',
        'PAYWAY_MERCHANT_ID=test-merchant',
        'PAYWAY_API_KEY=short',
        'PAYWAY_RETURN_URL=https://example.com/return',
      ].join('\n'),
    );
    const result = runDoctor({ cwd: TEST_DIR });
    const keyCheck = result.checks.find((c) => c.id === 'env-apikey-length');
    expect(keyCheck?.ok).toBe(false);
  });

  it('detects framework from package.json', () => {
    writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }));
    const result = runDoctor({ cwd: TEST_DIR });
    expect(result.framework).toBe('next-app');
  });

  it('reports online QR callback missing when PAYWAY_CALLBACK_URL is absent', () => {
    writeFileSync(
      path.join(TEST_DIR, '.env'),
      ['PAYWAY_ENV=sandbox', 'PAYWAY_MERCHANT_ID=test-merchant', `PAYWAY_API_KEY=${'a'.repeat(32)}`].join('\n'),
    );

    const result = runDoctor({ cwd: TEST_DIR });
    const callbackCheck = result.checks.find((c) => c.id === 'env-PAYWAY_CALLBACK_URL');

    expect(callbackCheck).toBeDefined();
    expect(callbackCheck?.ok).toBe(false);
    expect(callbackCheck?.detail).toContain('required for online QR');
  });

  it('reports online QR callback ready when PAYWAY_CALLBACK_URL is a public HTTPS URL', () => {
    writeFileSync(
      path.join(TEST_DIR, '.env'),
      [
        'PAYWAY_ENV=sandbox',
        'PAYWAY_MERCHANT_ID=test-merchant',
        `PAYWAY_API_KEY=${'a'.repeat(32)}`,
        'PAYWAY_CALLBACK_URL=https://example.com/payway/callback',
      ].join('\n'),
    );

    const result = runDoctor({ cwd: TEST_DIR });
    const callbackCheck = result.checks.find((c) => c.id === 'env-PAYWAY_CALLBACK_URL');

    expect(callbackCheck?.ok).toBe(true);
    expect(callbackCheck?.detail).toContain('https://example.com/payway/callback');
  });
});
