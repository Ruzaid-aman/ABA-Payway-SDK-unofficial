import { describe, expect, it } from 'vitest';
import { renderTable } from '../cli/ui/tables.js';
import { confirmSubmit, formatAmount, type ConfirmSummaryRow } from '../cli/flows/confirm-flow.js';
import type { PaymentIO, SelectOption } from '../cli/ui/prompts.js';

describe('renderTable', () => {
  const columns = [
    { key: 'name', header: 'NAME' },
    { key: 'env', header: 'ENV' },
  ];

  it('sizes columns from the longest cell including the header', () => {
    const lines = renderTable(columns, [
      { name: 'sandbox', env: 'sandbox' },
      { name: 'production-merchant', env: 'production' },
    ], 200);
    // 'production-merchant' = 19 chars drives the name column; 'production' = 10 the env column.
    expect(lines[0]).toBe(`${'NAME'.padEnd(19)}  ${'ENV'.padEnd(10)}`.trimEnd());
    expect(lines[1]).toBe(`${'─'.repeat(19)}  ${'─'.repeat(10)}`);
    expect(lines[2]).toContain('sandbox');
    expect(lines[2].indexOf('sandbox')).toBe(lines[0].indexOf('ENV'));
  });

  it('ellipsizes overflowing cells to the capped width', () => {
    const lines = renderTable([{ key: 'v', header: 'VALUE' }], [{ v: 'abcdefghijklmnopqrstuvwxyz' }], 12);
    expect(lines[1].length).toBeLessThanOrEqual(10);
    expect(lines[2]).toContain('…');
  });

  it('renders header-only for empty rows and empty-string for nullish cells', () => {
    const lines = renderTable(columns, [], 80);
    expect(lines).toHaveLength(2);
    const sparse = renderTable(columns, [{ name: 'x' }], 80)[2];
    expect(sparse.trimEnd()).toBe('x');
  });
});

interface ScriptedStep {
  respondConfirm: boolean;
}

function fakeIO(script: ScriptedStep[]): PaymentIO & { notes: string[]; confirms: string[] } {
  const notes: string[] = [];
  const confirms: string[] = [];
  let step = 0;
  const io = {
    mode: 'clack' as const,
    notes,
    confirms,
    async text(): Promise<string> {
      return '';
    },
    async select<T extends string>(): Promise<T> {
      return 'x' as T;
    },
    async confirm(options: { message: string }): Promise<boolean> {
      confirms.push(options.message);
      const answer = script[Math.min(step, script.length - 1)]?.respondConfirm ?? false;
      step += 1;
      return answer;
    },
    note(body: string): void {
      notes.push(body);
    },
    intro(): void {},
    outro(): void {},
    spinner() {
      return { message(): void {}, stop(): void {} };
    },
  };
  void (io as unknown as { select: <T extends string>(o: { options: SelectOption<T>[] }) => Promise<T> });
  return io as PaymentIO & { notes: string[]; confirms: string[] };
}

describe('confirmSubmit', () => {
  const rows: ConfirmSummaryRow[] = [
    { label: 'Title', value: 'Invoice 1' },
    { label: 'Amount', value: '5.00 USD' },
  ];

  it('renders a boxed summary and returns true on confirm', async () => {
    const io = fakeIO([{ respondConfirm: true }]);
    const ok = await confirmSubmit(io, 'Create payment link', rows);
    expect(ok).toBe(true);
    expect(io.notes[0]).toContain('Title:');
    expect(io.notes[0]).toContain('Invoice 1');
    expect(io.notes[0]).toContain('5.00 USD');
    expect(io.confirms[0]).toBe('Submit this request?');
  });

  it('returns false on decline', async () => {
    const io = fakeIO([{ respondConfirm: false }]);
    expect(await confirmSubmit(io, 'Create payment link', rows)).toBe(false);
  });

  it('formats amounts consistently', () => {
    expect(formatAmount('5.00', 'USD')).toBe('5.00 USD');
    expect(formatAmount(4000, 'KHR')).toBe('4000 KHR');
  });
});
