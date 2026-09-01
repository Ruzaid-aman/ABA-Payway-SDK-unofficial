/**
 * Behavior pins for `payway.credentialsOnFile.getLinkCardFormHtml()`.
 *
 * The form builder must stay byte-consistent with `linkCard()` (same payload
 * fields, same §16-verified 10-position HMAC) — the form is that payload,
 * rendered as a browser-postable document whose native submission is exactly
 * the application/x-www-form-urlencoded body the endpoint demands (it
 * rejects JSON outright — SANDBOX-FINDINGS §9a). FINDING-annotated tests
 * pin security-relevant rendering (HTML escaping) and the wire-format guard.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENDPOINTS } from '../constants.js';
import { PayWay } from '../client.js';
import { createCredentialsOnFileDomain } from '../domains/credentials-on-file.js';
import { PayWayConfigError } from '../errors.js';
import * as utils from '../utils.js';

const SANDBOX_FORM_ACTION = `https://checkout-sandbox.payway.com.kh${ENDPOINTS.linkCard}`;

const BASE_PARAMS = {
  requestId: 'link67890',
  ctid: 'customerabc123',
  tokenFlag: 'CITI_FLEX',
  callbackUrl: 'https://mywebsite.com/payway/link-callback',
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

describe('getLinkCardFormHtml (PayWay wiring)', () => {
  it('renders a complete document whose form POSTs to the sandbox link-card endpoint', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    const html = payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS);

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain(`action="${SANDBOX_FORM_ACTION}"`);
    expect(html).toContain('method="POST"');
    expect(html).toContain('id="aba_link_card_request"');
    expect(html).toContain('Link your card');
  });

  it('honors a baseUrl override for the form action', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', baseUrl: 'https://gw.internal.example' });
    const html = payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS);
    expect(html).toContain(`action="https://gw.internal.example${ENDPOINTS.linkCard}"`);
  });

  it('embeds every payload field including the hash, identical to linkCard', async () => {
    // Pin request_time so both calls compose the same hash; the fetch spy
    // records the urlencoded body linkCard() sends over the wire.
    vi.spyOn(utils, 'formatRequestTime').mockReturnValue('20260901120000');
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"status":{"code":"00"}}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ merchantId: 'mid-42', apiKey: 'key-42', environment: 'sandbox' });

    await payway.credentialsOnFile.linkCard(BASE_PARAMS);
    const form = extractHiddenFields(payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS));

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain(ENDPOINTS.linkCard);
    // The wire body is urlencoded — the exact format the form submits natively.
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const wire = new URLSearchParams(opts.body);

    for (const [key, wireValue] of wire.entries()) {
      expect(form.get(key), `hidden field ${key}`).toBe(wireValue);
    }
    // Every hidden input also exists on the wire — no form-only extras.
    for (const key of form.keys()) {
      expect(wire.has(key), `wire field ${key}`).toBe(true);
    }
    expect(form.get('hash')).toBe(wire.get('hash'));
    expect(form.get('request_id')).toBe('link67890');
    expect(form.get('ctid')).toBe('customerabc123');
  });

  it('escapes HTML-significant characters in the merchant-provided submit label', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    // All wire params are strictly validated (alphanumeric ids, https URLs,
    // enum flags), so the realistic attribute-injection vector is the
    // merchant-controlled rendering label.
    const html = payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS, {
      submitLabel: `"><script>alert(1)</script>`,
    });

    // No raw quote/script may escape an attribute value.
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('autoSubmit adds a same-tab submit script', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    const html = payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS, { autoSubmit: true });

    expect(html).toContain(`document.getElementById('aba_link_card_request').submit();`);
    // No popup plugin on this endpoint — it is purchase-endpoint only.
    expect(html).not.toContain('checkout2-0.js');
    expect(html).not.toContain('target="aba_webservice"');
  });

  it('FINDING: rejects unsafe form ids', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    expect(() => payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS, { formId: 'f"><script>' })).toThrow(
      PayWayConfigError,
    );
  });

  it('honors custom rendering options', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    const html = payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS, {
      formId: 'my_link_card_form',
      submitLabel: 'កត់តែកាត',
      omitSubmitButton: true,
    });
    expect(html).toContain('id="my_link_card_form"');
    expect(html).not.toContain('<button');

    const withLabel = payway.credentialsOnFile.getLinkCardFormHtml(BASE_PARAMS, { submitLabel: 'កត់តែកាត' });
    expect(withLabel).toContain('>កត់តែកាត</button>');
  });

  it('propagates linkCard validation rules (required ctid / tokenFlag)', () => {
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });
    expect(() => payway.credentialsOnFile.getLinkCardFormHtml({ ...BASE_PARAMS, ctid: '' })).toThrow(PayWayConfigError);
    expect(() =>
      payway.credentialsOnFile.getLinkCardFormHtml({ ...BASE_PARAMS, tokenFlag: 'MITR_FIX' }),
    ).toThrow(PayWayConfigError);
    expect(() =>
      payway.credentialsOnFile.getLinkCardFormHtml({ ...BASE_PARAMS, ctid: 'CUST-005' }),
    ).toThrow(PayWayConfigError);
  });

  it('requires merchant credentials to sign (FINDING: no unsigned form can ship)', () => {
    const domain = createCredentialsOnFileDomain({} as never, vi.fn());
    expect(() => domain.getLinkCardFormHtml(BASE_PARAMS)).toThrow(PayWayConfigError);
  });
});

describe('getLinkCardFormHtml (domain-level wiring)', () => {
  it('uses the resolved base URL passed to createCredentialsOnFileDomain', () => {
    const domain = createCredentialsOnFileDomain(
      { merchantId: 'mid', apiKey: 'key' } as never,
      vi.fn(),
      'https://override.example',
    );
    const html = domain.getLinkCardFormHtml(BASE_PARAMS);
    expect(html).toContain(`action="https://override.example${ENDPOINTS.linkCard}"`);
  });

  it('falls back to the sandbox BASE_URL when no resolved URL is given', () => {
    const domain = createCredentialsOnFileDomain({ merchantId: 'mid', apiKey: 'key' } as never, vi.fn());
    const html = domain.getLinkCardFormHtml(BASE_PARAMS);
    expect(html).toContain(`action="${SANDBOX_FORM_ACTION}"`);
  });
});
