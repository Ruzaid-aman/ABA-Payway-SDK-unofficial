/**
 * Agentic PayWay CLI — human + machine rendering of command results.
 *
 * `renderHumanResult` produces a concise, TTY-friendly summary. `serializeCommandResult`
 * produces versioned JSON that always passes `validateCommandResult`.
 */

import type { AgentCommandResultV1 } from './contracts.js';
import { validateCommandResult } from './schemas.js';

export function renderHumanResult(result: AgentCommandResultV1): string {
  const lines: string[] = [];
  lines.push(`Status: ${result.status}`);
  if (result.request) lines.push(`Request: ${result.request}`);
  if (result.message) lines.push(`Message: ${result.message}`);
  if (result.sessionId) lines.push(`Session: ${result.sessionId}`);
  if (result.executionIds && result.executionIds.length > 0) {
    lines.push(`Executions: ${result.executionIds.join(', ')}`);
  }

  if (result.plan && Array.isArray(result.plan.actions)) {
    lines.push('Plan:');
    for (const action of result.plan.actions) {
      const tool = (action as { tool?: string }).tool ?? '?';
      lines.push(`  - ${tool}`);
    }
  }

  if (result.actions && result.actions.length > 0) {
    lines.push('Actions:');
    for (const action of result.actions) {
      const ok = action.ok ? 'ok' : 'failed';
      const tool = (action.tool as string) ?? '?';
      let line = `  - ${tool}: ${ok}`;
      if (action.error) {
        const err = action.error as { code?: string; message?: string };
        line += ` (${err.code ?? ''}: ${err.message ?? ''})`.trim();
      }
      lines.push(line);
      if (action.artifact) {
        const art = action.artifact as { path?: string };
        lines.push(`      artifact: ${art.path ?? '(unknown)'}`);
      }
    }
  }

  if (result.error) {
    lines.push(`Error: ${result.error.code ?? ''} - ${result.error.message}`);
  }

  return lines.join('\n');
}

export function serializeCommandResult(result: AgentCommandResultV1): string {
  const serialized = JSON.stringify(result);
  const parsed = JSON.parse(serialized) as unknown;
  if (!validateCommandResult(parsed)) {
    throw new Error('Internal: serialized AgentCommandResultV1 failed validation');
  }
  return serialized;
}
