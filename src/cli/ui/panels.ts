/**
 * Text panels for summaries and next-step hints. Pure string builders so both
 * the clack path (styled) and tests (plain) consume the same layout logic.
 */

export interface KeyValueRow {
  label: string;
  value: string;
}

/**
 * Aligned key/value lines: `  Amount:      5.00 USD`.
 * `labelWidth` is derived from the longest label unless given explicitly.
 */
export function formatKeyValueSummary(
  rows: KeyValueRow[],
  opts: { indent?: string; labelWidth?: number } = {},
): string[] {
  const indent = opts.indent ?? '  ';
  const width = opts.labelWidth ?? rows.reduce((max, row) => Math.max(max, row.label.length), 0);
  return rows.map((row) => `${indent}${row.label}:`.padEnd(indent.length + width + 2) + row.value);
}

/**
 * Next-step panel: a dim header plus one bullet per suggestion.
 * Lines are expected to be full copy-paste commands.
 */
export function renderNextSteps(lines: string[], opts: { indent?: string; bullet?: string; header?: string } = {}): string[] {
  if (lines.length === 0) return [];
  const indent = opts.indent ?? '  ';
  const bullet = opts.bullet ?? '·';
  const header = opts.header ?? 'Next steps:';
  return [`${indent}${header}`, ...lines.map((line) => `${indent}  ${bullet} ${line}`)];
}
