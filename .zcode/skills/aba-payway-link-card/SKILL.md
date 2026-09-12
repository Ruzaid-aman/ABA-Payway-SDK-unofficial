---
name: aba-payway-link-card
description: Link a payment card for ABA PayWay credential-on-file payments.
metadata:
  version: 1.3.0
---

# Link Card

`link-card` is PayWay's **hosted card-linking** endpoint: it always answers
with the gateway's card-entry page (Visa/Mastercard/JCB/UPI form) — on success
AND error — and the resulting token (`pwt`) is delivered to your
`callback_url`, never in the response body.

## Quick Start — browser form (recommended, no server roundtrip)

Because the endpoint requires `application/x-www-form-urlencoded` (JSON is
rejected unread) and always answers HTML, the natural integration is a plain
browser form POST — same pattern as `checkout-form`:

```ts
// Hidden fields + §16-verified HMAC, byte-identical to linkCard()'s wire body.
const html = payway.credentialsOnFile.getLinkCardFormHtml({
  requestId: 'link001',          // [a-zA-Z0-9]{5,24} — no hyphens/underscores
  ctid: 'customerabc',          // same rule; your customer token identifier
  tokenFlag: 'CITI_FLEX',        // CITI_FLEX | CITO_FLEX (live-documented)
  frequency: '1M',               // 1W|1M|2M — live-documented as REQUIRED; omit at your own risk (advisory warning)
  callbackUrl: 'https://merchant.example/cof-callback', // how the pwt arrives
  continueSuccessUrl: 'https://merchant.example/cards/done', // Done-button target
});
res.type('html').send(html);     // customer lands on the hosted card form
```

Options: `{ formId, autoSubmit, submitLabel, omitSubmitButton }`. There is no
`popupMode` — the AbaPayway popup plugin is documented for the purchase
endpoint only.

## Quick Start — API call

```ts
await payway.credentialsOnFile.linkCard({
  requestId: 'link001',
  ctid: 'customerabc',
  tokenFlag: 'CITI_FLEX',
  currency: 'USD',               // defaults to USD
  callbackUrl: 'https://merchant.example/cof-callback',
});
// ⚠️ v1.3.6: returnUrl/returnDeeplink are NO LONGER SENT (deprecated params,
// absent from the live request). Use continueSuccessUrl for the Done target.
// ⚠️ The call throws PayWayBusinessError with the hosted page in `rawBody` —
// that page IS the success artifact; serve/redirect to it (string), or prefer
// getLinkCardFormHtml() above which needs no roundtrip.
```

## CLI

```sh
# Local signed form (NO API call): HTML to stdout or -o <path>; opens on TTY
payway-sdk cof link-card-form --ctid customerabc --token-flag CITI_FLEX \
  --callback-url https://merchant.example/cof-callback -o link-card.html

# API call: saves the hosted page to payway-output/link-card-<request-id>.html, exits 0
payway-sdk cof link-card -r link001 --ctid customerabc --token-flag CITI_FLEX
```

> In the SDK repository checkout, the same commands run as
> `npx tsx src/cli.ts <args>` (requires `aba-payway-ts` installed or linked).

## Sandbox Facts (2026-09-01, re-verified 2026-09-12)

- Form-urlencoded only (SDK handles encoding); `request_id`, `ctid`,
  `token_flag` required, `currency` defaults USD. `frequency` (1W|1M|2M) is
  live-documented as **required** — the SDK accepts its omission but warns
  (advisory) because card linking may fail without it.
- Live-verified 2026-09-01: the locally-built form's hidden fields POST
  exactly like a browser → HTTP 200 + the 42 KB hosted "PayWay - Checkout"
  page. 2026-09-12 nuance (§24 LC-2): that body is a static shell — the REAL
  result travels in the `302 → /add-card/<base64 JSON>` redirect target, so
  the shell alone proves nothing about success.
- Hosted outcome is machine-readable: the thrown `PayWayBusinessError` now
  carries `responseUrl` (post-redirect URL) and `hostedPage`
  (`{ url, payload, code, message }` decoded from `/add-card/<base64>`).
  Live: a profile without token flags renders code **104** "Merchant not
  enabled token flag" (SANDBOX-FINDINGS §24 LC-1) — ask ABA to enable card
  tokenization; no callback fires for a failed attempt (§24 LC-4).
- Hash order (§16-verified, merchant_id first):
  `merchant_id.request_time.ctid.callback_url.request_id.token_flag.frequency.amount.currency.continue_success_url`
  — `amount` is a hash position with NO body field (live-doc quirk; hashes the
  literal empty string regardless of any amount value supplied); `frequency`
  hashes its supplied value, or `''` when omitted.
- Hash IS enforced in sandbox (2026-09-12 controlled replays, §24 LC-3 — the
  earlier "sandbox skips hash" note was wrong): a corrupted hash answers
  hosted `01 Wrong Hash`; a missing hash answers HTTP 400
  `04 errors.hash = "The hash field is required."`.
- The `pwt` token arrives ONLY via `callback_url` — verify it with
  `verifyCallback(body, signature, { stripHash: true })`.

## Error Handling

```ts
import { PayWayBusinessError, PayWayConfigError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.linkCard(params); }
catch (error) {
  if (error instanceof PayWayBusinessError && typeof error.rawBody === 'string'
      && /<!doctype html|<html/i.test(error.rawBody)) {
    // Expected on the API path — rawBody is the hosted card form. The decoded
    // hosted result (e.g. status.code "104") is on error.hostedPage.
  } else if (error instanceof PayWayConfigError) console.error(error.message);
}
```
Malformed payloads get HTTP 400 code `"04"` with a per-field `errors{}` map in
`error.rawBody.status.errors`.

## Related Skills
- [Token Purchase](../aba-payway-token-purchase/SKILL.md)
- [Link Account](../aba-payway-link-account/SKILL.md)
