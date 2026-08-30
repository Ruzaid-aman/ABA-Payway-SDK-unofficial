/**
 * Compact startup banner for interactive bare invocations (`payway-sdk` with
 * no arguments). Never printed in machine contexts — the caller decides via
 * resolvePromptMode.
 */

import type { AnsiPalette } from './theme.js';

export function renderBanner(version: string, palette: AnsiPalette): string[] {
  const rule = palette.dim('─'.repeat(46));
  const title = `${palette.bold('ABA PayWay SDK')} ${palette.dim(`v${version}`)}`;
  const subtitle = palette.dim('Cambodia payments from your terminal — sandbox-ready');
  return [rule, `  ${title}`, `  ${subtitle}`, rule];
}
