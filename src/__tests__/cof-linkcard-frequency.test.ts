/**
 * D5 audit pin: the live OpenAPI link-card spec marks `frequency` "Required
 * for Link Card" (enum 1W|1M|2M), but the wire field is optional for legacy
 * merchants — so the shared `buildLinkCardPayload` (used by BOTH
 * `linkCard()` and `getLinkCardFormHtml()`) warns via the advisory framework
 * instead of throwing, escalating to `PayWayConfigError` under
 * `strictValidation`.
 *
 * Note on the warn-once dedup: `warnAdvisory` (utils.ts) prints each distinct
 * message once per process via a module-level Set — the form-builder case
 * re-imports the domain under a fresh module registry so its emission is
 * observable after the linkCard() case already warned the same message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayWayConfig } from '../client.js';
import { createCredentialsOnFileDomain } from '../domains/credentials-on-file.js';
import { PayWayConfigError } from '../errors.js';

const FREQUENCY_WARNING =
  '[payway] link-card frequency is live-documented as required for Link Card (1W|1M|2M); card linking may fail without it';

const BASE_PARAMS = {
  requestId: 'link67890',
  ctid: 'customerabc123',
  tokenFlag: 'CITI_FLEX',
  callbackUrl: 'https://mywebsite.com/payway/link-callback',
};

/**
 * Minimal capturing request spy — resolves the CoF success shape so the
 * domain layer runs to completion; the captured body is not under test
 * here (the hash order is pinned by other suites).
 */
function makeRequestSpy() {
  return vi.fn(
    async (_path: string, _body: Record<string, unknown>, _hmacFields: string[]) =>
      ({ status: { code: '00' } }) as never,
  );
}

/** Config with signing credentials so getLinkCardFormHtml() passes its guard. */
const SIGNING_CONFIG: PayWayConfig = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox',
};

describe('link-card frequency advisory (D5, shared builder)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('linkCard() without frequency warns the [payway] advisory message', async () => {
    const request = makeRequestSpy();
    const domain = createCredentialsOnFileDomain(SIGNING_CONFIG, request as never);

    await domain.linkCard({ ...BASE_PARAMS });

    expect(warnSpy).toHaveBeenCalledWith(FREQUENCY_WARNING);
  });

  it('linkCard() with frequency: "1M" emits no frequency warning', async () => {
    const request = makeRequestSpy();
    const domain = createCredentialsOnFileDomain(SIGNING_CONFIG, request as never);

    await domain.linkCard({ ...BASE_PARAMS, frequency: '1M' });

    expect(warnSpy).not.toHaveBeenCalledWith(FREQUENCY_WARNING);
  });

  it('linkCard() without frequency throws PayWayConfigError under strictValidation', () => {
    const request = makeRequestSpy();
    const domain = createCredentialsOnFileDomain({ ...SIGNING_CONFIG, strictValidation: true }, request as never);

    expect(() => domain.linkCard({ ...BASE_PARAMS })).toThrow(PayWayConfigError);
    expect(() => domain.linkCard({ ...BASE_PARAMS })).toThrow(
      'link-card frequency is live-documented as required for Link Card (1W|1M|2M); card linking may fail without it',
    );
  });

  it('getLinkCardFormHtml() without frequency also warns (shared builder)', async () => {
    // Fresh module registry → fresh warnAdvisory dedup Set, so the identical
    // message emitted on the form-builder path is observable here.
    vi.resetModules();
    const { createCredentialsOnFileDomain: freshCreateDomain } = await import('../domains/credentials-on-file.js');
    const request = makeRequestSpy();
    const domain = freshCreateDomain(SIGNING_CONFIG, request as never);

    const html = domain.getLinkCardFormHtml({ ...BASE_PARAMS });

    expect(html).toContain('<form');
    expect(html).not.toContain('name="frequency"');
    expect(warnSpy).toHaveBeenCalledWith(FREQUENCY_WARNING);
  });
});
