/**
 * @vitest-environment happy-dom
 *
 * Browser-environment tests for Module 2 (`src/client-handler/`). Every one
 * of the 5 response-type branches is exercised with real DOM assertions and
 * with spies on `window.location.href` / `window.open`. Previously the CLI
 * demo only proved the correct branch was picked in a Node environment
 * where every handler short-circuited with a `*_skipped_no_dom` action —
 * this suite closes that gap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../client-handler/index.js';
import type { TransactionSession } from '../schema.js';

// happy-dom's <canvas> has no real 2D context, so the `qrcode` library
// crashes when it tries to draw. Stub it with a no-op implementation that
// still appends a <canvas> to the target so DOM assertions remain valid.
vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn(async (canvas: HTMLCanvasElement) => {
      canvas.setAttribute('data-mock-drawn', 'true');
    }),
    toDataURL: vi.fn(
      async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    ),
  },
}));

function makeSession(overrides: Partial<TransactionSession>): TransactionSession {
  return {
    sessionId: 'tx_test_abc',
    status: 'pending',
    responseType: 'qr_string',
    responsePayload: '',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('client.handleResponse (browser environment)', () => {
  let container: HTMLElement;
  let originalLocationHref: string;
  let hrefStore: string;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'payway-target';
    document.body.appendChild(container);

    // Intercept window.location.href writes without navigating the JSDOM.
    originalLocationHref = window.location.href;
    hrefStore = originalLocationHref;
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      get() {
        return hrefStore;
      },
      set(v: string) {
        hrefStore = v;
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      value: originalLocationHref,
      writable: true,
    });
  });

  // ── deeplink ─────────────────────────────────────────────────────────────
  it('deeplink: sets window.location.href by default', async () => {
    const session = makeSession({
      responseType: 'deeplink',
      responsePayload: 'ababank://pay?tran_id=abc',
    });

    const result = await client.handleResponse(session);

    expect(result.success).toBe(true);
    expect(result.action).toBe('deeplink_redirect');
    expect(hrefStore).toBe('ababank://pay?tran_id=abc');
  });

  it('deeplink: opens a new tab when openInNewTab=true', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const session = makeSession({
      responseType: 'deeplink',
      responsePayload: 'ababank://pay?x=1',
    });

    const result = await client.handleResponse(session, { openInNewTab: true });

    expect(openSpy).toHaveBeenCalledWith('ababank://pay?x=1', '_blank', 'noopener,noreferrer');
    expect(result.action).toBe('deeplink_opened_new_tab');
  });

  it('deeplink: falls back to same-tab redirect when popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const session = makeSession({
      responseType: 'deeplink',
      responsePayload: 'ababank://pay?y=2',
    });

    const result = await client.handleResponse(session, { openInNewTab: true });

    expect(result.action).toBe('deeplink_redirect_same_tab');
    expect(hrefStore).toBe('ababank://pay?y=2');
  });

  // ── qr_string ────────────────────────────────────────────────────────────
  it('qr_string: renders a canvas into the target element', async () => {
    const session = makeSession({
      responseType: 'qr_string',
      responsePayload: '00020101021226360016ABA PAYWAY',
    });

    const result = await client.handleResponse(session, { target: '#payway-target' });

    expect(result.action).toBe('qr_rendered');
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(canvas?.getAttribute('aria-label')).toBe('PayWay QR code');
  });

  it('qr_string: accepts an HTMLElement target directly', async () => {
    const session = makeSession({
      responseType: 'qr_string',
      responsePayload: '000201010212',
    });

    const result = await client.handleResponse(session, { target: container });

    expect(result.action).toBe('qr_rendered');
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  // ── qr_image ─────────────────────────────────────────────────────────────
  it('qr_image: renders an <img> into the target element', async () => {
    const session = makeSession({
      responseType: 'qr_image',
      responsePayload: 'https://example.com/qr.png',
    });

    const result = await client.handleResponse(session, { target: '#payway-target' });

    expect(result.action).toBe('qr_image_rendered');
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.src).toBe('https://example.com/qr.png');
    expect(img?.alt).toBe('PayWay QR code');
  });

  // ── url ──────────────────────────────────────────────────────────────────
  it('url: redirects same-tab by default', async () => {
    const session = makeSession({
      responseType: 'url',
      responsePayload: 'https://checkout.example.com/pay/123',
    });

    const result = await client.handleResponse(session);

    expect(result.action).toBe('url_redirect');
    expect(hrefStore).toBe('https://checkout.example.com/pay/123');
  });

  it('url: opens a new tab when requested', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const session = makeSession({
      responseType: 'url',
      responsePayload: 'https://checkout.example.com/pay/999',
    });

    const result = await client.handleResponse(session, { openInNewTab: true });

    expect(openSpy).toHaveBeenCalledWith('https://checkout.example.com/pay/999', '_blank', 'noopener,noreferrer');
    expect(result.action).toBe('url_opened_new_tab');
  });

  // ── html ─────────────────────────────────────────────────────────────────
  it('html: embeds in a sandboxed iframe with the correct sandbox tokens', async () => {
    const session = makeSession({
      responseType: 'html',
      responsePayload: '<h1>Hosted Checkout</h1>',
    });

    const result = await client.handleResponse(session, { target: '#payway-target' });

    expect(result.action).toBe('html_embedded');
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    // Critical security assertion: allow-same-origin must NOT be present,
    // because combined with allow-scripts it would defeat the sandbox.
    const sandbox = iframe?.getAttribute('sandbox') ?? '';
    expect(sandbox.split(/\s+/)).toEqual(expect.arrayContaining(['allow-scripts', 'allow-forms', 'allow-popups']));
    expect(sandbox).not.toContain('allow-same-origin');
    expect(iframe?.getAttribute('title')).toBe('PayWay hosted checkout');
    expect(iframe?.srcdoc).toBe('<h1>Hosted Checkout</h1>');
  });

  it('html: refuses to overwrite document.body when no target is supplied', async () => {
    const originalBody = document.body.innerHTML;
    const session = makeSession({
      responseType: 'html',
      responsePayload: '<h1>Should not appear</h1>',
    });

    const onError = vi.fn();
    const result = await client.handleResponse(session, { onError });

    expect(result.success).toBe(false);
    expect(result.action).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
    // document.body must be untouched.
    expect(document.body.innerHTML).toBe(originalBody);
  });

  // ── error paths ──────────────────────────────────────────────────────────
  it('unknown responseType: returns success=false and invokes onError', async () => {
    const session = makeSession({
      // biome-ignore lint/suspicious/noExplicitAny: intentional invalid value
      responseType: 'not_a_real_type' as any,
      responsePayload: 'x',
    });
    const onError = vi.fn();

    const result = await client.handleResponse(session, { onError });

    expect(result.success).toBe(false);
    expect(result.action).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('user callback errors do not break SDK execution', async () => {
    const session = makeSession({
      responseType: 'url',
      responsePayload: 'https://example.com',
    });

    const result = await client.handleResponse(session, {
      onHandled: () => {
        throw new Error('user code exploded');
      },
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('url_redirect');
  });

  it('onHandled receives the session and the action string', async () => {
    const session = makeSession({
      responseType: 'url',
      responsePayload: 'https://example.com',
    });
    const onHandled = vi.fn();

    await client.handleResponse(session, { onHandled });

    expect(onHandled).toHaveBeenCalledWith(session, 'url_redirect');
  });
});
