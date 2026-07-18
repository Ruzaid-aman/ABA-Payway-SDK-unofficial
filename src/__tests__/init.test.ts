import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runInit } from '../cli/commands/init.js';

const TEST_DIR = path.join(process.cwd(), '.test-init-temp');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('runInit', () => {
  it('returns a valid InitResult', () => {
    const result = runInit({ cwd: TEST_DIR });
    expect(result.framework).toBeDefined();
    expect(result.frameworkEvidence).toBeInstanceOf(Array);
    expect(result.writtenFiles).toBeInstanceOf(Array);
    expect(result.skippedFiles).toBeInstanceOf(Array);
    expect(result.envIssues).toBeInstanceOf(Array);
    expect(typeof result.envWritten).toBe('boolean');
    expect(result.reportPath).toContain('INTEGRATION_REPORT.md');
  });

  it('writes .env template when not present', () => {
    const result = runInit({ cwd: TEST_DIR });
    expect(result.envWritten).toBe(true);
    const envPath = path.join(TEST_DIR, '.env');
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('PAYWAY_ENV=sandbox');
    expect(content).toContain('PAYWAY_MERCHANT_ID=');
    expect(content).toContain('PAYWAY_API_KEY=');
  });

  it('skips .env when already present', () => {
    runInit({ cwd: TEST_DIR });
    const result = runInit({ cwd: TEST_DIR });
    expect(result.envWritten).toBe(false);
  });

  it('writes INTEGRATION_REPORT.md', () => {
    const result = runInit({ cwd: TEST_DIR });
    expect(existsSync(result.reportPath)).toBe(true);
    const content = readFileSync(result.reportPath, 'utf8');
    expect(content).toContain('# ABA PayWay Integration Report');
    expect(content).toContain('Framework:');
  });

  it('detects framework from package.json', () => {
    const pkgPath = path.join(TEST_DIR, 'package.json');
    const pkg = {
      name: 'test-project',
      dependencies: { express: '^4.18.0' },
    };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    const result = runInit({ cwd: TEST_DIR });
    expect(result.framework).toBe('express');
    expect(result.frameworkEvidence.some((e) => e.includes('express'))).toBe(true);
  });

  it('reports env issues when env vars are missing', () => {
    const result = runInit({ cwd: TEST_DIR, env: {} });
    expect(result.envIssues.length).toBeGreaterThan(0);
    expect(result.envIssues.some((i) => i.severity === 'error')).toBe(true);
  });
});
