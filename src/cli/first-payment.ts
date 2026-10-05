export interface FirstPaymentCommandExample {
  readonly label: string;
  readonly command: string;
}

export const FIRST_PAYMENT_COMMANDS: readonly FirstPaymentCommandExample[] = [
  {
    label: 'Run the credential-free demo',
    command: 'payway-sdk demo',
  },
  {
    label: 'Generate the server starter',
    command: 'payway-sdk init --mode sandbox --template first-payment',
  },
  {
    label: 'Check online QR readiness (or use --route hosted-checkout)',
    command: 'payway-sdk doctor --route online-qr',
  },
  {
    label: 'Create an online QR',
    command: 'payway-sdk generate-qr -a 3.00 -c USD --callback-url <https-url> -y --no-polling --output json',
  },
  {
    label: 'Check current status',
    command: 'payway-sdk check-transaction -t <id>',
  },
  {
    label: 'Fetch full transaction detail',
    command: 'payway-sdk transaction-detail -t <id>',
  },
  {
    label: 'Set a public callback URL',
    command: 'payway-sdk setup-webhook --tunnel',
  },
] as const;

export function renderFirstPaymentQuickstart(): string[] {
  return [
    'First payment quickstart',
    ...FIRST_PAYMENT_COMMANDS.map((example) => `  ${example.label}: ${example.command}`),
  ];
}
