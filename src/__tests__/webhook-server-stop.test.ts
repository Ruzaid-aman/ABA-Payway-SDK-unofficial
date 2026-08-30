/**
 * Webhook server lifecycle coverage: stop-before-start early return and the
 * graceful start→stop path (complements webhook-server.test.ts, which covers
 * request handling).
 */
import { describe, expect, it, vi } from 'vitest';
import { createWebhookServer } from '../webhook/server.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

describe('webhook server lifecycle', () => {
  it('stop() resolves immediately when the server was never started', async () => {
    const server = createWebhookServer(new JsonWebhookStorage(), { apiKey: 'k', quiet: true });
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('start() then stop() shuts the listener down gracefully', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const server = createWebhookServer(new JsonWebhookStorage(), { apiKey: 'k' });
    try {
      await server.start();
      await expect(server.stop()).resolves.toBeUndefined();
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes('shut down'))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});
