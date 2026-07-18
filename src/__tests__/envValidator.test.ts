import { describe, it, expect } from 'vitest';
import { validatePayWayEnv, hasBlockingIssues } from '../config/envValidator.js';

describe('validatePayWayEnv', () => {
  it('returns no issues when all required vars are set correctly', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
      PAYWAY_RETURN_URL: 'https://example.com/return',
    };
    const issues = validatePayWayEnv(env);
    expect(issues).toHaveLength(0);
  });

  it('reports error when PAYWAY_ENV is missing', () => {
    const env = {
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
    };
    const issues = validatePayWayEnv(env);
    const envIssue = issues.find((i) => i.varName === 'PAYWAY_ENV');
    expect(envIssue).toBeDefined();
    expect(envIssue?.severity).toBe('error');
    expect(envIssue?.code).toBe('E-PAYWAY_ENV-MISSING');
  });

  it('reports error when PAYWAY_MERCHANT_ID is missing', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_API_KEY: 'a'.repeat(32),
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.varName === 'PAYWAY_MERCHANT_ID');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('reports error when PAYWAY_API_KEY is missing', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_MERCHANT_ID: 'merchant-123',
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.varName === 'PAYWAY_API_KEY');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('reports warn when PAYWAY_API_KEY is suspiciously short', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'short',
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.code === 'E-PAYWAY_API_KEY-TOO-SHORT');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warn');
  });

  it('reports error when PAYWAY_ENV has invalid value', () => {
    const env = {
      PAYWAY_ENV: 'staging',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.code === 'E-PAYWAY_ENV-WRONG');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('accepts https URL as PAYWAY_ENV', () => {
    const env = {
      PAYWAY_ENV: 'https://custom.payway.com.kh',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
    };
    const issues = validatePayWayEnv(env);
    const envIssue = issues.find((i) => i.varName === 'PAYWAY_ENV');
    expect(envIssue).toBeUndefined();
  });

  it('reports error when RETURN_URL is missing', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.code === 'E-PAYWAY_RETURN_URL-MISSING');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('reports error when RETURN_URL is not a valid URL', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
      PAYWAY_RETURN_URL: 'not-a-url',
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.code === 'E-PAYWAY_RETURN_URL-INVALID');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('reports warn when RSA key is not PEM formatted', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
      PAYWAY_RETURN_URL: 'https://example.com/return',
      PAYWAY_RSA_PUBLIC_KEY: 'not-a-pem-key',
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.code === 'E-PAYWAY_RSA_PUBLIC_KEY-INVALID');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warn');
  });

  it('accepts valid PEM-formatted RSA key', () => {
    const env = {
      PAYWAY_ENV: 'sandbox',
      PAYWAY_MERCHANT_ID: 'merchant-123',
      PAYWAY_API_KEY: 'a'.repeat(32),
      PAYWAY_RETURN_URL: 'https://example.com/return',
      PAYWAY_RSA_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nMIIBI...\n-----END PUBLIC KEY-----',
    };
    const issues = validatePayWayEnv(env);
    const issue = issues.find((i) => i.varName === 'PAYWAY_RSA_PUBLIC_KEY');
    expect(issue).toBeUndefined();
  });
});

describe('hasBlockingIssues', () => {
  it('returns true when there are error-severity issues', () => {
    const issues = [
      { code: 'E-TEST', severity: 'error' as const, varName: 'TEST', message: 'test' },
    ];
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('returns false when only warn-severity issues exist', () => {
    const issues = [
      { code: 'W-TEST', severity: 'warn' as const, varName: 'TEST', message: 'test' },
    ];
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it('returns false when no issues exist', () => {
    expect(hasBlockingIssues([])).toBe(false);
  });
});
