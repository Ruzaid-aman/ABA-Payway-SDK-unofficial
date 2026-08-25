import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDotEnvFile } from '../cli/dotenv.js';
import { explainAll, explainPayWayCode } from '../cli/explain-code.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeEnv(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-dotenv-'));
  tempDirs.push(dir);
  const file = path.join(dir, '.env');
  writeFileSync(file, contents, 'utf8');
  return file;
}

describe('parseDotEnvFile', () => {
  it('parses simple KEY=value pairs', () => {
    const parsed = parseDotEnvFile(writeEnv('A=1\nB=hello\n'));
    expect(parsed.A).toBe('1');
    expect(parsed.B).toBe('hello');
  });

  it('skips comments and lines without =', () => {
    const parsed = parseDotEnvFile(writeEnv('# comment\nNOEQUALS\nC=3\n'));
    expect(parsed.C).toBe('3');
    expect(parsed.NOEQUALS).toBeUndefined();
  });

  it('folds multi-line quoted PEM values with real newlines', () => {
    const pem = [
      'PAYWAY_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----',
      'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCTest',
      'AQAB',
      '-----END PUBLIC KEY-----"',
      '',
    ].join('\n');
    const parsed = parseDotEnvFile(writeEnv(pem));
    expect(parsed.PAYWAY_RSA_PUBLIC_KEY).toContain('-----BEGIN PUBLIC KEY-----\n');
    expect(parsed.PAYWAY_RSA_PUBLIC_KEY).toContain('\n-----END PUBLIC KEY-----');
  });

  it('unescapes literal \\n in single-line values and strips quotes', () => {
    const parsed = parseDotEnvFile(writeEnv('KEY="line1\\nline2"\n'));
    expect(parsed.KEY).toBe('line1\nline2');
  });

  it('returns empty object for a missing file', () => {
    expect(parseDotEnvFile(path.join(tmpdir(), 'does-not-exist-env'))).toEqual({});
  });
});

describe('explainPayWayCode', () => {
  it('explains refund PTL codes', () => {
    const e = explainPayWayCode('PTL36');
    expect(e?.family).toBe('refund');
    expect(e ? e.title : '').toMatch(/not found/i);
  });

  it('explains pre-auth PTL codes', () => {
    const e = explainPayWayCode('ptl170'); // case-insensitive
    expect(e?.family).toBe('pre-auth');
    expect(e ? e.title : '').toMatch(/cancel/i);
  });

  it('explains numeric gateway codes', () => {
    const e = explainPayWayCode('49');
    expect(e?.family).toBe('gateway');
    expect(e ? e.hint : '').toContain('YYYY-MM-DD HH:mm:ss');
  });

  it('returns undefined for unknown codes', () => {
    expect(explainPayWayCode('ZZZ999')).toBeUndefined();
  });

  it('explainAll covers gateway, refund, and pre-auth families', () => {
    const all = explainAll();
    const families = new Set(all.map((e) => e.family));
    expect(families.has('gateway')).toBe(true);
    expect(families.has('refund')).toBe(true);
    expect(families.has('pre-auth')).toBe(true);
  });
});
