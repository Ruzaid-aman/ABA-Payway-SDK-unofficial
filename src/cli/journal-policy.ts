/**
 * CLI journal policy — the CLI is an app, not a silent library, so every
 * gateway-touching command records to the transaction journal by default
 * (storage wave 1, .scratch/storage-service/plan.md task 5).
 *
 * Precedence: `--no-journal` forces off (wins over an ambient truthy env),
 * `--journal` forces on, an explicitly falsy PAYWAY_JOURNAL ('0'|'false'|
 * 'no'|'off') is respected, and otherwise API commands arm the journal by
 * setting PAYWAY_JOURNAL=1 — the same env seam the global `--journal` flag
 * has always used, so every `new PayWay()` constructed downstream journals.
 *
 * Exempt commands are pure-local reads where arming would distort
 * diagnostics (doctor must report the AMBIENT environment, not its own
 * force-on; `journal *` must not create the file it is querying) or produce
 * no PayWay exchanges at all (completions/docs/skills/webhook fixtures).
 * Explicit flags still win on exempt commands.
 */

const FALSY = new Set(['0', 'false', 'no', 'off']);

export const CLI_JOURNAL_EXEMPT_COMMANDS: ReadonlySet<string> = new Set([
  'doctor',
  'status',
  'journal',
  'completions',
  'docs',
  'skills',
  'profiles',
  'init',
  'demo',
  'onboard',
  'explain',
  'webhook',
  'sandbox-test-cards',
  'sandbox-beneficiaries',
]);

export function applyCliJournalPolicy(
  topLevelCommand: string,
  flag: boolean | undefined,
  env: NodeJS.ProcessEnv,
): void {
  if (flag === false) {
    env.PAYWAY_JOURNAL = '0';
    return;
  }
  if (flag === true) {
    env.PAYWAY_JOURNAL = '1';
    return;
  }
  if (CLI_JOURNAL_EXEMPT_COMMANDS.has(topLevelCommand)) return;
  const current = (env.PAYWAY_JOURNAL ?? '').trim().toLowerCase();
  if (current !== '' && !FALSY.has(current)) return; // already on — leave it alone
  if (current === '') env.PAYWAY_JOURNAL = '1';
}
