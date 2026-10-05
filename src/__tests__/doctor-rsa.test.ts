import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../cli/commands/doctor.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('doctor RSA PEM shape check', () => {
  it('flags a truncated multi-line PEM with a targeted fix hint', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-doctor-'));
    tempDirs.push(dir);
    writeFileSync(path.join(dir, '.env'), ['PAYWAY_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----', ''].join('\n'), 'utf8');

    const result = runDoctor({ cwd: dir });
    const check = result.checks.find((c) => c.id === 'env-rsa-pem');
    expect(check).toBeDefined();
    expect(check?.ok).toBe(false);
    expect(check?.fix).toMatch(/multi-line quoted/i);
  });

  it('passes when a complete PEM is configured (single-line escaped form)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-doctor-'));
    tempDirs.push(dir);
    const pem = '-----BEGIN PUBLIC KEY-----\\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQK\\nAQAB\\n-----END PUBLIC KEY-----';
    writeFileSync(path.join(dir, '.env'), `PAYWAY_RSA_PUBLIC_KEY="${pem}"\n`, 'utf8');

    const result = runDoctor({ cwd: dir });
    const check = result.checks.find((c) => c.id === 'env-rsa-pem');
    expect(check?.ok).toBe(true);
  });

  it('omits the check entirely when no RSA key is configured', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-doctor-'));
    tempDirs.push(dir);
    writeFileSync(path.join(dir, '.env'), 'PAYWAY_MERCHANT_ID=m\n', 'utf8');

    const result = runDoctor({ cwd: dir });
    expect(result.checks.find((c) => c.id === 'env-rsa-pem')).toBeUndefined();
  });
});
