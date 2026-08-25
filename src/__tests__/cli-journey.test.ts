import { describe, expect, it } from 'vitest';
import { formatClock, mapPollOutcomeToExitCode, POLL_EXIT } from '../cli/journey.js';

describe('mapPollOutcomeToExitCode', () => {
  it('returns 0 when a terminal status was reached (any outcome)', () => {
    expect(mapPollOutcomeToExitCode({ terminalReached: true })).toBe(POLL_EXIT.TERMINAL_REACHED);
    expect(mapPollOutcomeToExitCode({ terminalReached: true })).toBe(0);
  });

  it('maps consecutive poll errors to API failure (2)', () => {
    expect(
      mapPollOutcomeToExitCode({ terminalReached: false, abortedReason: 'max_consecutive_errors' }),
    ).toBe(2);
  });

  it('maps timeout to network/unknown (3)', () => {
    expect(mapPollOutcomeToExitCode({ terminalReached: false, abortedReason: 'max_duration_exceeded' })).toBe(3);
    expect(mapPollOutcomeToExitCode({ terminalReached: false })).toBe(3);
  });
});

describe('formatClock', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(600_000)).toBe('10:00');
  });

  it('never goes negative', () => {
    expect(formatClock(-5_000)).toBe('0:00');
  });
});
