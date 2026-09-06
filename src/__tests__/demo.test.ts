import { afterEach, describe, expect, it } from 'vitest';
import { startDemoApp, type DemoApp } from '../cli/commands/demo.js';

let demo: DemoApp | undefined;

afterEach(async () => {
  await demo?.close();
  demo = undefined;
});

describe('credential-free demo', () => {
  it('serves an explicitly simulated local payment journey through the real SDK client', async () => {
    demo = await startDemoApp();

    expect(demo.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const page = await fetch(demo.url);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('SIMULATED');
    expect(html).toContain('No ABA credentials');

    const createdResponse = await fetch(`${demo.url}/api/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 3, currency: 'USD' }),
    });
    const created = (await createdResponse.json()) as {
      transactionId: string;
      status: string;
      qrString: string;
      simulated: boolean;
    };
    expect(createdResponse.status).toBe(201);
    expect(created).toMatchObject({ status: 'PENDING', simulated: true });
    expect(created.transactionId.length).toBeLessThanOrEqual(20);
    expect(created.qrString).toContain('000201');

    const approvedResponse = await fetch(`${demo.url}/api/payments/${created.transactionId}/approve`, {
      method: 'POST',
    });
    expect(await approvedResponse.json()).toMatchObject({ status: 'APPROVED', simulated: true });

    const statusResponse = await fetch(`${demo.url}/api/payments/${created.transactionId}`);
    expect(await statusResponse.json()).toMatchObject({ status: 'APPROVED', simulated: true });
  });

  it('rejects invalid payment input without contacting an external service', async () => {
    demo = await startDemoApp();
    const response = await fetch(`${demo.url}/api/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: -1, currency: 'USD' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Amount must be a positive number' });
  });

  it('starts and stops a self-check without credentials', async () => {
    demo = await startDemoApp({ port: 0 });
    const health = await fetch(`${demo.url}/api/health`);
    expect(await health.json()).toEqual({ ok: true, mode: 'simulated' });
  });
});
