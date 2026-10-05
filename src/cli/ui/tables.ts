/**
 * Zero-dependency table renderer for interactive TTY output (spec §7.2).
 *
 * Applied ONLY under clack mode — piped/classic output stays byte-identical.
 * Column widths come from content (header included), capped by the terminal
 * width; overflowing cells are ellipsized. Returns styled-able plain lines;
 * the caller prints them.
 */

export interface TableColumn {
  key: string;
  header: string;
}

function truncate(text: string, width: number): string {
  if (width <= 1) return text.slice(0, width);
  if (text.length <= width) return text;
  return `${text.slice(0, width - 1)}…`;
}

/**
 * Renders a bordered-free table (aligned columns, 2-space gutters).
 * `maxWidth` defaults to `process.stdout.columns ?? 80`.
 */
export function renderTable(
  columns: readonly TableColumn[],
  rows: ReadonlyArray<Record<string, unknown>>,
  maxWidth: number = (typeof process !== 'undefined' && process.stdout?.columns) || 80,
): string[] {
  const cell = (row: Record<string, unknown>, key: string): string => {
    const value = row[key];
    return value === undefined || value === null ? '' : String(value);
  };

  const widths = columns.map((col) => {
    const contentMax = Math.max(col.header.length, ...rows.map((row) => cell(row, col.key).length));
    return Math.min(contentMax, Math.max(4, Math.floor((maxWidth - columns.length * 2) / columns.length)));
  });

  const formatRow = (values: string[]): string =>
    values
      .map((value, i) => truncate(value, widths[i]).padEnd(widths[i]))
      .join('  ')
      .trimEnd();

  const lines = [formatRow(columns.map((col) => col.header))];
  lines.push(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) {
    lines.push(formatRow(columns.map((col) => cell(row, col.key))));
  }
  return lines;
}
