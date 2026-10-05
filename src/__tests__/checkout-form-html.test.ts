/**
 * Behavior pins for `payway.checkout.getCheckoutFormHtml()`.
 *
 * The form builder must stay byte-consistent with `createTransaction()`
 * (same payload fields, same 24-field HMAC) — the form is that payload,
 * rendered as a browser-postable document. FINDING-annotated tests pin
 * security-relevant rendering (HTML escaping, script injection modes).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENDPOINTS } from '../constants.js';
import { PayWay } from '../client.js';
import { createCheckoutDomain } from '../domains/checkout.js';
import { PayWayConfigError } from '../errors.js';
import * as utils from '../utils.js';

const SANDBOX_FORM_ACTION = `https://checkout-sandbox.payway.com.kh${ENDPOINTS.purchase}`;

const BASE_PARAMS = {
  transactionId: 'order-123',
  amount: 15,
  currency: 'USD' as const,
  returnUrl: 'https://mywebsite.com/payment-result',
};

function extractHiddenFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)"/g)) {
    fields.set(match[1], match[2]);
  }
  return fields;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getCheckoutFormHtml (PayWay wiring)', () => {
  it('renders a complete document whose form POSTs to the sandbox purchase endpoint', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    const html = payway.checkout.getCheckoutFormHtml(BASE_PARAMS);

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain(`action="${SANDBOX_FORM_ACTION}"`);
    expect(html).toContain('method="POST"');
    expect(html).toContain('id="aba_merchant_request"');
    expect(html).toContain('Pay with ABA PayWay');
  });

  it('honors a baseUrl override for the form action', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', baseUrl: 'https://gw.internal.example' });
    const html = payway.checkout.getCheckoutFormHtml(BASE_PARAMS);
    expect(html).toContain(`action="https://gw.internal.example${ENDPOINTS.purchase}"`);
  });

  it('embeds every payload field including the hash, identical to createTransaction', () => {
    // Pin req_time so both calls compose the same hash.
    vi.spyOn(utils, 'formatRequestTime').mockReturnValue('20260831120000');
    const payway = new PayWay({ merchantId: 'mid-42', apiKey: 'key-42', environment: 'sandbox' });

    const payload = payway.checkout.createTransaction(BASE_PARAMS);
    const fields = extractHiddenFields(payway.checkout.getCheckoutFormHtml(BASE_PARAMS));

    for (const [key, value] of Object.entries(payload)) {
      expect(fields.get(key), `hidden field ${key}`).toBe(String(value));
    }
    expect(fields.get('hash')).toBe(payload.hash);
    expect(fields.get('return_url')).toBe(payload.return_url);
  });

  it('escapes HTML-significant characters in merchant-provided field values', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    // firstname/lastname are not pattern-restricted (unlike tran_id), so they are
    // the realistic injection vector for a hidden-input value.
    const html = payway.checkout.getCheckoutFormHtml({
      ...BASE_PARAMS,
      firstname: `"><script>alert(1)</script>`,
      lastname: `Ann & "Bob"`,
    });

    // No raw quote/script may escape an attribute value.
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Ann &amp; &quot;Bob&quot;');
  });

  it('autoSubmit adds a same-tab submit script and no plugin', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    const html = payway.checkout.getCheckoutFormHtml(BASE_PARAMS, { autoSubmit: true });

    expect(html).toContain(`document.getElementById('aba_merchant_request').submit();`);
    expect(html).not.toContain('checkout2-0.js');
    expect(html).not.toContain('target="aba_webservice"');
  });

  it('popupMode wires the official AbaPayway plugin and popup target', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    const html = payway.checkout.getCheckoutFormHtml(BASE_PARAMS, { popupMode: true });

    expect(html).toContain('target="aba_webservice"');
    expect(html).toContain('https://checkout.payway.com.kh/plugins/checkout2-0.js');
    expect(html).toContain(`document.getElementById('aba_merchant_request-submit').addEventListener('click'`);
    expect(html).toContain('AbaPayway.checkout();');
  });

  it('FINDING: autoSubmit and popupMode are mutually exclusive (ambiguous UX)', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    expect(() => payway.checkout.getCheckoutFormHtml(BASE_PARAMS, { autoSubmit: true, popupMode: true })).toThrow(
      PayWayConfigError,
    );
  });

  it('rejects unsafe form ids and honors custom rendering options', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    expect(() => payway.checkout.getCheckoutFormHtml(BASE_PARAMS, { formId: `f"><script>` })).toThrow(
      PayWayConfigError,
    );

    const html = payway.checkout.getCheckoutFormHtml(BASE_PARAMS, {
      formId: 'my_pay_form',
      submitLabel: 'Thanh toán',
      omitSubmitButton: true,
    });
    expect(html).toContain('id="my_pay_form"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Thanh toán');

    const withLabel = payway.checkout.getCheckoutFormHtml(BASE_PARAMS, { submitLabel: 'Thanh toán' });
    expect(withLabel).toContain('>Thanh toán</button>');
  });

  it('popupMode without a submit button ships the plugin script but no broken click wiring', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    const html = payway.checkout.getCheckoutFormHtml(BASE_PARAMS, { popupMode: true, omitSubmitButton: true });

    expect(html).toContain('checkout2-0.js');
    expect(html).not.toContain(`getElementById('aba_merchant_request-submit')`);
  });
});

describe('getCheckoutFormHtml (domain-level wiring)', () => {
  it('uses the resolved base URL passed to createCheckoutDomain', () => {
    const domain = createCheckoutDomain(
      { merchantId: 'mid', apiKey: 'key' },
      vi.fn(),
      vi.fn(),
      'https://override.example',
    );
    const html = domain.getCheckoutFormHtml(BASE_PARAMS);
    expect(html).toContain(`action="https://override.example${ENDPOINTS.purchase}"`);
  });

  it('propagates createTransaction validation errors instead of rendering', () => {
    const domain = createCheckoutDomain(
      { merchantId: 'mid', apiKey: 'key' },
      vi.fn(),
      vi.fn(),
      'https://override.example',
    );
    expect(() => domain.getCheckoutFormHtml({ ...BASE_PARAMS, amount: 0 })).toThrow(PayWayConfigError);
  });
});
