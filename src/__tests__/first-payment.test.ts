import { describe, expect, it } from 'vitest';
import { FIRST_PAYMENT_COMMANDS, renderFirstPaymentQuickstart } from '../cli/first-payment.js';

describe('first-payment quickstart', () => {
  it('lists the canonical first-payment commands', () => {
    expect(FIRST_PAYMENT_COMMANDS.length).toBeGreaterThanOrEqual(4);
    expect(FIRST_PAYMENT_COMMANDS[0]?.command).toBe('payway-sdk demo');
    expect(FIRST_PAYMENT_COMMANDS.map((c) => c.command)).toContain(
      'payway-sdk generate-qr -a 3.00 -c USD --callback-url <https-url> -y --no-polling --output json',
    );
  });

  it('renders a labelled quickstart block', () => {
    const lines = renderFirstPaymentQuickstart();
    expect(lines[0]).toBe('First payment quickstart');
    expect(lines.length).toBe(FIRST_PAYMENT_COMMANDS.length + 1);
    for (const command of FIRST_PAYMENT_COMMANDS) {
      expect(lines.some((l) => l.includes(command.label) && l.includes(command.command))).toBe(true);
    }
  });
});
