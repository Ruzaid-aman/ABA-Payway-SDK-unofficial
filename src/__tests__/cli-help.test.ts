import { describe, expect, it } from 'vitest';
import {
  COMMAND_EXAMPLES,
  COMMAND_GROUPS,
  renderCommandExamples,
  renderGroupedHelp,
  unknownCommandSuggestion,
  unknownOptionSuggestion,
} from '../cli/ui/help.js';

/** Full top-level inventory registered by src/cli.ts and its command modules. */
const REGISTERED_COMMANDS = [
  'init',
  'doctor',
  'config',
  'test',
  'demo',
  'status',
  'explain',
  'get-transactions-by-ref',
  'check-transaction',
  'poll-transaction',
  'close-transaction',
  'transaction-detail',
  'transaction-list',
  'refund',
  'exchange-rate',
  'validate',
  'generate-qr',
  'generate-checkout',
  'payment-link',
  'sandbox-beneficiaries',
  'payout',
  'profiles',
  'skills',
  'setup-webhook',
  'pre-auth',
  'ask',
  'agent',
  'onboard',
];

describe('COMMAND_GROUPS', () => {
  it('covers every registered command exactly once', () => {
    const grouped = COMMAND_GROUPS.flatMap((group) => group.commands);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...REGISTERED_COMMANDS].sort());
  });

  it('keeps the documented group order', () => {
    expect(COMMAND_GROUPS.map((group) => group.title)).toEqual([
      'Setup',
      'Payments',
      'Transactions',
      'Money-out',
      'Reference',
      'Agent & skills',
    ]);
  });
});

describe('renderGroupedHelp', () => {
  it('renders only groups with present commands, keeping group order', () => {
    expect(renderGroupedHelp(['init', 'doctor'])).toEqual(['Setup:', '  init', '  doctor']);
  });

  it('keeps full group order across the whole inventory', () => {
    const titles = renderGroupedHelp(REGISTERED_COMMANDS).filter((line) => !line.startsWith('  '));
    expect(titles).toEqual(['Setup:', 'Payments:', 'Transactions:', 'Money-out:', 'Reference:', 'Agent & skills:']);
  });

  it('appends ungrouped commands under a sorted Other group', () => {
    expect(renderGroupedHelp(['init', 'frobnicate', 'aardvark'])).toEqual([
      'Setup:',
      '  init',
      'Other:',
      '  aardvark',
      '  frobnicate',
    ]);
  });

  it('renders only the Other group when no group matches', () => {
    expect(renderGroupedHelp(['frobnicate'])).toEqual(['Other:', '  frobnicate']);
  });
});

describe('unknownCommandSuggestion', () => {
  it('returns undefined for a known command', () => {
    expect(unknownCommandSuggestion('doctor', REGISTERED_COMMANDS)).toBeUndefined();
  });

  it('suggests the closest command for a typo', () => {
    expect(unknownCommandSuggestion('check-transation', REGISTERED_COMMANDS)).toBe(
      "Unknown command 'check-transation'. Did you mean 'check-transaction'?",
    );
  });

  it('falls back to a --help hint for gibberish', () => {
    const message = unknownCommandSuggestion('zzz-qqq-xxx', REGISTERED_COMMANDS);
    expect(message).toBe("Unknown command 'zzz-qqq-xxx'. Run 'payway-sdk --help' to list commands.");
    expect(message).toContain('--help');
  });
});

describe('unknownOptionSuggestion', () => {
  it('suggests the closest known flag for a typo', () => {
    expect(unknownOptionSuggestion('--amunt', ['--amount', '--lifetime'])).toBe(
      "Unknown option '--amunt'. Did you mean '--amount'?",
    );
  });

  it('returns undefined when no known flag is close', () => {
    expect(unknownOptionSuggestion('-z', ['--amount', '--lifetime'])).toBeUndefined();
  });

  it('guards against short bare tokens', () => {
    expect(unknownOptionSuggestion('-ab', ['--amount', '--lifetime'])).toBeUndefined();
  });

  it('still evaluates long flags whose cleaned token is short', () => {
    expect(unknownOptionSuggestion('--x', ['--amount', '--lifetime'])).toBeUndefined();
  });
});

describe('renderCommandExamples', () => {
  it('renders an Examples header and $-prefixed lines', () => {
    expect(renderCommandExamples('generate-qr')).toEqual([
      'Examples:',
      '  $ payway-sdk generate-qr -a 5.00 -c USD --lifetime 360',
      '  $ payway-sdk generate-qr --offline --ref spring-sale',
    ]);
  });

  it('returns an empty array for commands without examples', () => {
    expect(renderCommandExamples('config')).toEqual([]);
  });

  it('keeps COMMAND_EXAMPLES entries shell-ready', () => {
    for (const examples of Object.values(COMMAND_EXAMPLES)) {
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) expect(example.startsWith('payway-sdk ')).toBe(true);
    }
  });
});
