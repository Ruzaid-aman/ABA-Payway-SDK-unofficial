/**
 * Module 2 — Client-Side Response Handler (The "Presenter")
 *
 * Agent Focus: Frontend / UI
 *
 * This module is independently deployable. It consumes the
 * `TransactionSession` contract from `src/schema.ts` and dynamically handles
 * all possible PayWay return types without manual intervention by the
 * merchant:
 *
 * - Deeplink  : Trigger a native app redirect automatically.
 * - QR String : Render the QR code directly into a target DOM element or
 *               generate a download prompt.
 * - QR Image  : Render the QR image URL into a target DOM element.
 * - Checkout URL : Perform a window.location.href redirect or open a new tab.
 * - HTML Snippet : Safely embed the HTML into the merchant's container.
 *
 * It does NOT import Module 1 (server) or Module 3 (test). It only imports
 * the shared contract (`../schema.js`).
 */

import type {
  TransactionSession,
  HandleResponseOptions,
  HandleResponseResult,
} from '../schema.js';

/**
 * Resolves a target option into an HTMLElement, if available.
 */
function resolveTarget(target?: string | HTMLElement): HTMLElement | null {
  if (!target) return null;
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target;
  }
  if (typeof target === 'string' && typeof document !== 'undefined') {
    return document.querySelector<HTMLElement>(target);
  }
  return null;
}

/**
 * Detects whether the code is running in a browser environment.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Renders a QR code from a raw payload string into a target element.
 * Uses the `qrcode` library (browser-safe) to draw onto a canvas.
 */
async function renderQrString(
  payload: string,
  target: HTMLElement | null,
): Promise<string> {
  // Dynamically import qrcode so this module remains tree-shakeable for
  // merchants who only use deeplink/url/html flows.
  const QRCode = (await import('qrcode')).default;

  if (target) {
    // Clear any previous content.
    target.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'PayWay QR code');
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    target.appendChild(canvas);
    await QRCode.toCanvas(canvas, payload, { width: 256, margin: 2 });
    return 'qr_rendered';
  }

  // No target — generate a downloadable PNG data URL.
  const dataUrl = await QRCode.toDataURL(payload, { width: 256, margin: 2 });
  if (isBrowser()) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `payway-qr-${Date.now()}.png`;
    link.click();
  }
  return 'qr_download_prompted';
}

/**
 * Renders a QR image URL into a target element (or triggers download if no
 * target is provided).
 */
function renderQrImage(payload: string, target: HTMLElement | null): string {
  if (!isBrowser()) {
    return 'qr_image_skipped_no_dom';
  }

  if (target) {
    target.innerHTML = '';
    const img = document.createElement('img');
    img.src = payload;
    img.alt = 'PayWay QR code';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    target.appendChild(img);
    return 'qr_image_rendered';
  }

  // No target — open the image URL in a new tab as a download prompt.
  const link = document.createElement('a');
  link.href = payload;
  link.download = `payway-qr-${Date.now()}.png`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
  return 'qr_image_download_prompted';
}

/**
 * Triggers a native app redirect via a deeplink URL scheme.
 */
function triggerDeeplink(payload: string, openInNewTab?: boolean): string {
  if (!isBrowser()) {
    return 'deeplink_skipped_no_dom';
  }

  if (openInNewTab) {
    const win = window.open(payload, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Pop-up blocked — fall back to same-tab redirect.
      window.location.href = payload;
      return 'deeplink_redirect_same_tab';
    }
    return 'deeplink_opened_new_tab';
  }

  window.location.href = payload;
  return 'deeplink_redirect';
}

/**
 * Performs a checkout URL redirect.
 */
function redirectUrl(payload: string, openInNewTab?: boolean): string {
  if (!isBrowser()) {
    return 'url_redirect_skipped_no_dom';
  }

  if (openInNewTab) {
    const win = window.open(payload, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = payload;
      return 'url_redirect_same_tab';
    }
    return 'url_opened_new_tab';
  }

  window.location.href = payload;
  return 'url_redirect';
}

/**
 * Safely embeds an HTML snippet into a target container.
 * Uses a sandboxed iframe to isolate merchant DOM from PayWay's hosted
 * checkout markup.
 *
 * SECURITY: `allow-same-origin` is intentionally NOT granted. Combining it
 * with `allow-scripts` would effectively defeat the sandbox and let embedded
 * scripts access the parent origin. The hosted checkout does not require
 * same-origin access to function.
 *
 * When no target element is provided, the SDK refuses to inject markup into
 * the merchant's page (previous behaviour overwrote `document.body`, which
 * could destroy merchant UI). Callers must supply a container.
 */
function embedHtml(payload: string, target: HTMLElement | null): string {
  if (!isBrowser()) {
    return 'html_embed_skipped_no_dom';
  }

  if (!target) {
    throw new Error(
      'PayWay SDK: an HTML response requires an explicit `target` element. ' +
        'Refusing to overwrite document.body.',
    );
  }

  target.innerHTML = '';
  const iframe = document.createElement('iframe');
  // Deliberately narrow sandbox: no `allow-same-origin`.
  iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
  iframe.setAttribute('title', 'PayWay hosted checkout');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.minHeight = '600px';
  iframe.srcdoc = payload;
  target.appendChild(iframe);
  return 'html_embedded';
}

/**
 * Client-side SDK namespace.
 *
 * @example
 * import { client } from 'aba-payway-ts';
 *
 * // session comes from server.initiateTransaction()
 * client.handleResponse(session, { target: '#payway-container' });
 */
export const client = {
  /**
   * Consume a `TransactionSession` and dynamically handle its response type
   * without manual intervention by the merchant.
   *
   * @param session  - The `TransactionSession` from the server module.
   * @param options  - Optional rendering/redirect options.
   * @returns A `HandleResponseResult` describing the action taken.
   */
  async handleResponse(
    session: TransactionSession,
    options: HandleResponseOptions = {},
  ): Promise<HandleResponseResult> {
    const target = resolveTarget(options.target);

    try {
      let action = '';

      switch (session.responseType) {
        case 'deeplink':
          action = triggerDeeplink(session.responsePayload, options.openInNewTab);
          break;
        case 'qr_string':
          action = await renderQrString(session.responsePayload, target);
          break;
        case 'qr_image':
        case 'checkout_qr_url':
          action = renderQrImage(session.responsePayload, target);
          break;
        case 'url':
          action = redirectUrl(session.responsePayload, options.openInNewTab);
          break;
        case 'html':
          action = embedHtml(session.responsePayload, target);
          break;
        default:
          throw new Error(`Unsupported responseType: ${session.responseType as string}`);
      }

      const result: HandleResponseResult = {
        action,
        success: true,
        session,
      };

      try {
        options.onHandled?.(session, action);
      } catch {
        // User callbacks must never break SDK execution.
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      try {
        options.onError?.(err, session);
      } catch {
        // User callbacks must never break SDK execution.
      }

      return {
        action: 'error',
        success: false,
        session,
      };
    }
  },
};

export type ClientModule = typeof client;