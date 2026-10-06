/**
 * runCommand (audit pass 2 §16, DX-CLI-002): the harness every migrated
 * machine-mode command goes through — exactly ONE versioned document on
 * stdout under machine mode, diagnostics on stderr (§16.4 absolute split),
 * errors mapped to the §16.3 exit codes via the envelope.
 *
 * Machine mode = the command's `--json` flag or the global `--output
 * json|ndjson` (the argv-level detector stays authoritative — Commander
 * usage errors fire before options parse).
 */
import type { Envelope, EnvelopeErrorRecord, EnvelopeWarning } from './contract.js';
import { buildEnvelope, errorRecord, exitCodeForError } from './envelope.js';

export interface RunCommandInput {
  /** Dotted canonical command id (must exist in `capabilities`). */
  command: string;
  /** True when machine output was requested (--json / --output json|ndjson). */
  machine: boolean;
  /** Produces the success payload. May throw; throws become error envelopes. */
  run: () => Promise<{ data: unknown; warnings?: EnvelopeWarning[]; nextActions?: EnvelopeNextActionInput[] }>;
  /** Human rendering (machine mode skips it entirely). */
  render?: (data: unknown) => void;
  /** Extra context overrides (environment, endpoint — supplied by callers that know them). */
  context?: Record<string, unknown>;
}

interface EnvelopeNextActionInput {
  command: string;
  reason: string;
}

export interface RunCommandResult {
  exitCode: number;
  envelope?: Envelope;
}

/**
 * Execute, render, and return the process exit code. In machine mode the
 * envelope is RETURNED (the caller prints it as the only stdout document —
 * printing here would race the caller's own stdout management); in human
 * mode the render callback runs and nothing machine-readable is emitted.
 */
export async function runCommand(input: RunCommandInput): Promise<RunCommandResult> {
  try {
    const { data, warnings, nextActions } = await input.run();
    if (input.machine) {
      const envelope = buildEnvelope({
        kind: 'result',
        command: input.command,
        ok: true,
        data,
        warnings,
        nextActions,
        context: input.context,
      });
      return { exitCode: 0, envelope };
    }
    input.render?.(data);
    return { exitCode: 0 };
  } catch (e: unknown) {
    const exitCode = exitCodeForError(e);
    const errors: EnvelopeErrorRecord[] = [errorRecord(e, exitCode)];
    if (input.machine) {
      const envelope = buildEnvelope({
        kind: 'error',
        command: input.command,
        ok: false,
        errors,
        context: input.context,
      });
      return { exitCode, envelope };
    }
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[payway] ${message}\n`);
    return { exitCode };
  }
}
