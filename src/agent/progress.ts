/**
 * Presentation helpers shared by the `ask` command and the agent REPL for the
 * orchestrator turn: progress labels, the "Contacting…" banner, and the
 * provider-failure hint. Pure string builders — the caller decides where (and
 * whether) to print.
 */
import { ansi as c } from './ansi.js';

/** Map an orchestrator progress phase to its human-readable TTY label. */
export function progressLabel(info: { phase: string; detail?: string }): string {
  if (info.phase === 'validate') return 'Validating plan…';
  if (info.phase === 'authorize') return 'Authorizing plan…';
  if (info.phase === 'execute') return `Executing ${info.detail ?? 'action'}…`;
  return 'Finalizing…';
}

/** The banner printed while the provider is proposing a plan (TTY only). */
export function contactingProviderLine(provider: string, model: string): string {
  return `  ${c.dim('·')} Contacting ${c.cyan(provider)} ${c.dim(`(${model || 'no model'})`)} to propose a plan…`;
}

/** Hint printed when the provider could not propose a plan (TTY only). */
export function providerProposalFailedHint(): string {
  return `  ${c.yellow('!')} The inference provider could not propose a plan. Verify ${c.cyan('PAYWAY_AGENT_API_KEY')} is set and valid, then re-run ${c.cyan('agent doctor')}.`;
}

/**
 * Build the orchestrator progress printer used by both `ask` and the REPL.
 * Non-TTY callers get a no-op printer; the `propose` phase is skipped because
 * the "Contacting…" banner already covers it.
 */
export function createProgressPrinter(options: {
  tty: boolean;
  write: (line: string) => void;
}): (info: { phase: string; detail?: string }) => void {
  return (info) => {
    if (!options.tty) return;
    if (info.phase === 'propose') return; // already printed as "Contacting…"
    options.write(`  ${c.dim('·')} ${progressLabel(info)}`);
  };
}
