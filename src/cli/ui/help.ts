/**
 * Grouped help rendering and "did you mean" hints for unknown commands and
 * options. Pure string functions — no terminal I/O; the caller applies color
 * and prints.
 */

import { suggest, suggestMessage } from './suggest.js';

/**
 * Curated top-level command groups, rendered in this order. Subcommands
 * (payment-link create/detail, profiles add/list/..., skills ..., pre-auth
 * ...) are shown via the parent command's help, not as separate entries.
 */
export const COMMAND_GROUPS: Array<{ title: string; commands: string[] }> = [
  { title: 'Setup', commands: ['init', 'doctor', 'config', 'profiles', 'onboard'] },
  {
    title: 'Payments',
    commands: [
      'generate-qr',
      'request-qr',
      'generate-checkout',
      'cof',
      'checkout-form',
      'payment-link',
      'setup-webhook',
      'webhook',
    ],
  },
  {
    title: 'Transactions',
    commands: [
      'check-transaction',
      'poll-transaction',
      'transaction-detail',
      'transaction-list',
      'get-transactions-by-ref',
      'close-transaction',
      'tx-batch',
    ],
  },
  { title: 'Money-out', commands: ['refund', 'payout', 'pre-auth', 'beneficiary', 'self-activation'] },
  {
    title: 'Reference',
    commands: ['docs', 'status', 'explain', 'validate', 'exchange-rate', 'sandbox-beneficiaries', 'sandbox-test-cards'],
  },
  { title: 'Agent & skills', commands: ['ask', 'agent', 'skills', 'demo', 'test'] },
];

/**
 * Grouped help lines honoring the commands actually registered on the
 * program: groups render in COMMAND_GROUPS order, commands missing from
 * `registeredCommands` (and groups left empty by that) are skipped, and any
 * registered command not covered by COMMAND_GROUPS lands under a final
 * sorted `Other:` group so the renderer stays honest when commands are
 * added or renamed. Titles are plain text — the caller styles them.
 */
export function renderGroupedHelp(registeredCommands: readonly string[]): string[] {
  const registered = new Set(registeredCommands);
  const lines: string[] = [];
  const grouped = new Set<string>();
  for (const group of COMMAND_GROUPS) {
    const present = group.commands.filter((command) => registered.has(command));
    if (present.length === 0) continue;
    lines.push(`${group.title}:`);
    for (const command of present) {
      lines.push(`  ${command}`);
      grouped.add(command);
    }
  }
  const other = registeredCommands.filter((command) => !grouped.has(command)).sort();
  if (other.length > 0) {
    lines.push('Other:');
    for (const command of other) lines.push(`  ${command}`);
  }
  return lines;
}

/**
 * A ready-to-print line for an unrecognized command, or undefined when the
 * input is a known command. Returns the did-you-mean line when a close match
 * exists, otherwise a fallback pointing at `--help` (extra guidance lines are
 * the caller's job).
 */
export function unknownCommandSuggestion(input: string, registeredCommands: readonly string[]): string | undefined {
  if (registeredCommands.includes(input)) return undefined;
  return (
    suggestMessage(input, registeredCommands, 'command') ??
    `Unknown command '${input}'. Run 'payway-sdk --help' to list commands.`
  );
}

/**
 * A ready-to-print line for an unrecognized option, or undefined when nothing
 * is close. Leading dashes are stripped before matching so short and long
 * forms compare fairly; bare (non-`--`) tokens shorter than three characters
 * never get suggestions to avoid noise on single-letter flags.
 */
export function unknownOptionSuggestion(flag: string, knownFlags: readonly string[]): string | undefined {
  const cleaned = flag.replace(/^-+/, '');
  if (cleaned.length < 3 && !flag.startsWith('--')) return undefined;
  const originalByCleaned = new Map<string, string>();
  for (const known of knownFlags) {
    const key = known.replace(/^-+/, '');
    if (!originalByCleaned.has(key)) originalByCleaned.set(key, known);
  }
  const match = suggest(cleaned, [...originalByCleaned.keys()]);
  if (!match) return undefined;
  const original = originalByCleaned.get(match) ?? match;
  return `Unknown option '${flag}'. Did you mean '${original}'?`;
}

/** Copy-paste examples for the most-used commands (truthful to real flags). */
export const COMMAND_EXAMPLES: Record<string, string[]> = {
  'generate-qr': [
    'payway-sdk generate-qr -a 5.00 -c USD --lifetime 360',
    'payway-sdk generate-qr --offline --ref spring-sale',
  ],
  'request-qr': [
    'payway-sdk request-qr -c USD --payment-option abapay --callback-url https://example.com/soundbox',
    'payway-sdk request-qr -a 2.50 -c USD --payment-option abapay_khqr --callback-url https://example.com/soundbox',
  ],
  'generate-checkout': ['payway-sdk generate-checkout -a 5.00 --return-url https://example.com/return'],
  'checkout-form': ['payway-sdk checkout-form -a 15.00 --return-url https://example.com/return -o form.html'],
  'check-transaction': ['payway-sdk check-transaction -t <transaction-id>'],
  'poll-transaction': ['payway-sdk poll-transaction -t <transaction-id> --json'],
  'transaction-list': ['payway-sdk transaction-list --status APPROVED'],
  refund: ['payway-sdk refund -t <transaction-id> -a 2.00'],
  explain: ['payway-sdk explain PTL36', 'payway-sdk explain 69'],
  doctor: ['payway-sdk doctor --live'],
  webhook: [
    'payway-sdk webhook trigger --url http://localhost:3000/webhooks/aba --event payment.approved',
    'payway-sdk webhook verify-callback --body-file callback.json --sig "<X-PAYWAY-HMAC-SHA512>"',
  ],
  'setup-webhook': [
    'payway-sdk setup-webhook --tunnel --forward-to http://localhost:3000/webhooks/aba',
  ],
};

/**
 * Footer lines for a command's help output: an `Examples:` header followed by
 * one shell-prefixed line per example. Empty when the command has none.
 */
export function renderCommandExamples(command: string): string[] {
  const examples = COMMAND_EXAMPLES[command];
  if (!examples || examples.length === 0) return [];
  return ['Examples:', ...examples.map((example) => `  $ ${example}`)];
}
