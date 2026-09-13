import { describe, expect, it } from 'vitest';
import { applyCliJournalPolicy, CLI_JOURNAL_EXEMPT_COMMANDS } from '../cli/journal-policy.js';

describe('applyCliJournalPolicy', () => {
  const carrier = (env: Record<string, string>) => env as unknown as NodeJS.ProcessEnv;

  it('defaults ON for API commands with no flag and no env', () => {
    const env: Record<string, string> = {};
    applyCliJournalPolicy('generate-qr', undefined, carrier(env));
    expect(env.PAYWAY_JOURNAL).toBe('1');
  });

  it('respects an explicitly falsy env', () => {
    for (const value of ['0', 'false', 'no', 'OFF']) {
      const env: Record<string, string> = { PAYWAY_JOURNAL: value };
      applyCliJournalPolicy('generate-qr', undefined, carrier(env));
      expect(env.PAYWAY_JOURNAL).toBe(value);
    }
  });

  it('leaves an explicitly truthy env alone', () => {
    const env: Record<string, string> = { PAYWAY_JOURNAL: '1' };
    applyCliJournalPolicy('cof', undefined, carrier(env));
    expect(env.PAYWAY_JOURNAL).toBe('1');
  });

  it('--no-journal forces off even against a truthy env', () => {
    const env: Record<string, string> = { PAYWAY_JOURNAL: '1' };
    applyCliJournalPolicy('generate-qr', false, carrier(env));
    expect(env.PAYWAY_JOURNAL).toBe('0');
  });

  it('--journal forces on', () => {
    const env: Record<string, string> = {};
    applyCliJournalPolicy('generate-qr', true, carrier(env));
    expect(env.PAYWAY_JOURNAL).toBe('1');
  });

  it('exempt local-only commands never arm the journal', () => {
    for (const command of CLI_JOURNAL_EXEMPT_COMMANDS) {
      const env: Record<string, string> = {};
      applyCliJournalPolicy(command, undefined, carrier(env));
      expect(env.PAYWAY_JOURNAL).toBeUndefined();
    }
  });

  it('exempt commands still honor explicit flags', () => {
    const forced: Record<string, string> = {};
    applyCliJournalPolicy('doctor', true, carrier(forced));
    expect(forced.PAYWAY_JOURNAL).toBe('1');
  });
});
