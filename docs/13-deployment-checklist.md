<!-- GENERATED STUB: copy of docs/guides/13-deployment-checklist.md for compatibility. Do not edit here. -->

# Chapter 13 — Deployment Checklist

> **Estimated reading time:** 10 minutes  
> **Goal:** Ensure your PayWay integration is ready for production, with every security and reliability measure in place.

---

## Pre-Launch Checklist

Go through **every** item before switching from sandbox to production. A missed checkbox is a potential production incident.

### Environment & Credentials

- [ ] **Environment set to `'production'`**  
  ```typescript
  environment: 'production'  // NOT 'sandbox'
  ```

- [ ] **Production Merchant ID configured**  
  Production uses a different `merchantId` than sandbox. Verify the ID is correct.

- [ ] **Production API Key configured**  
  Production uses a different `apiKey` than sandbox. The key must match the production merchant.

- [ ] **Production RSA Public Key updated** (if applicable)  
  If you use Pre-Auth, Payout, Payment Link, or Refund, the RSA public key may differ between environments.

- [ ] **All credentials are in environment variables, NOT hardcoded**  
  ```typescript
  // ✅ Good
  const payway = new PayWay({
    merchantId: process.env.PAYWAY_MERCHANT_ID!,
    apiKey: process.env.PAYWAY_API_KEY!,
  });

  // ❌ Bad
  const payway = new PayWay({
    merchantId: 'ec476910',
    apiKey: 'a1b2c3d4...',
  });
  ```

- [ ] **`.env` file is in `.gitignore`**  
  ```bash
  echo ".env" >> .gitignore
  ```

### Webhook / Callback

- [ ] **Callback URL updated to production HTTPS endpoint**  
  ```typescript
  callbackUrl: 'https://your-production-domain.com/api/payway-webhook'
  // NOT: 'https://abc123.ngrok.io/api/payway-webhook'  (ngrok is dev only)
  ```

- [ ] **Callback endpoint returns HTTP 200 within 5 seconds**  
  PayWay timeouts if your server doesn't respond quickly. Test with:
  ```bash
  curl -w "\nTime: %{time_total}s" -X POST https://your-domain.com/api/payway-webhook
  ```

- [ ] **Idempotency handling for duplicate callbacks**  
  Use `ON CONFLICT (tran_id) DO NOTHING` or equivalent in your database.

- [ ] **Webhook signature verification is active**  
  Always call `payway.verifyCallback()` — never skip this.

- [ ] **Firewall allows inbound HTTPS from PayWay IPs**  
  PayWay calls your server. Ensure no firewall blocks inbound traffic on port 443.

### Security

- [ ] **HTTPS is enforced (production only)**  
  PayWay requires HTTPS for production callbacks. Self-signed certificates will fail.

- [ ] **SSL certificate is valid and not self-signed**  
  Use Let's Encrypt or a trusted CA. Test with:
  ```bash
  curl -vI https://your-domain.com
  ```

- [ ] **All debug `console.log` statements are removed or gated behind `NODE_ENV`**  
  ```typescript
  // ✅ Conditionally enable debug logging
  if (process.env.NODE_ENV !== 'production') {
    payway.onRequest = (endpoint, body) => console.log('REQ:', endpoint);
  }
  ```

- [ ] **No credentials logged in error messages**  
  Search your error handling code for `console.error(error)` that might dump the full API key.

- [ ] **Rate limiting on your webhook endpoint**  
  Prevent abuse: limit POST requests to `/api/payway-webhook` to reasonable rates.

### Error Handling

- [ ] **All `PayWayAPIError` cases are handled**  
  At minimum, handle: wrong hash (1), invalid merchant (15), expired (22).

- [ ] **Retry logic covers transient failures (5xx, network errors)**  
  Use the SDK's built-in `maxRetries` or implement your own.

- [ ] **4xx errors are NOT retried**  
  Client errors are permanent — retrying them just wastes resources.

- [ ] **Fallback behavior when PayWay is unreachable**  
  What happens if PayWay is down? Show a "Try again later" message, not a crash.

### Transaction Lifecycle

- [ ] **`unlink()` / `removeToken()` is called when user removes a payment method**  
  See [Chapter 9 — Link / Unlink / Renew Lifecycle](09-link-unlink-renew-lifecycle.md).

- [ ] **Transaction IDs are unique per payment attempt**  
  ```typescript
  // ✅ Good
  const tranId = `order-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  // ❌ Bad — will collide if two payments happen in the same second
  const tranId = `order-${Date.now()}`;
  ```

- [ ] **Expired transactions are handled gracefully**  
  Show "Payment expired" and offer to retry, not an error.

- [ ] **App kill/restore flow tested** (mobile apps)  
  What happens if the user background's the app during payment? Test this.

- [ ] **Payment-link flows (if used) have the RSA key + a public POST receiver**
  `paymentLink.create` requires `PAYWAY_RSA_PUBLIC_KEY`; the link's
  `return_url` must be public HTTPS accepting `POST application/json` (the
  pushback carries no hash — verify via `check-transaction`). Run
  `payway-sdk doctor` to confirm the key. See
  [17. Payment Link API](17-payment-link.md).

### QR Codes

- [ ] **QR images render correctly on low-bandwidth connections (< 3G)**  
  Test on throttled network (Chrome DevTools → Network → Throttling → Slow 3G).

- [ ] **QR expiry timer is displayed to the user**  
  Show a countdown or "QR expires in X minutes" message.

- [ ] **Offline KHQR validity matches the distribution workflow**
  The SDK defaults `expiresAt` to **15 minutes** after `createdAt`, including
  static KHQR. For print or billing batches, set both explicitly and confirm
  the permitted validity window with ABA; the CLI's `--lifetime` does not
  configure offline expiry.

- [ ] **Every offline batch has a verified manifest**
  Reject duplicate references; record reference, amount/currency,
  `createdAt`, `expiresAt`, output filename, generator version, and payload
  digest; run `validateKhqrCrc()` plus `inspectKhqrPayload()` on every row.

- [ ] **Invoice references remain inquiry-safe**
  KHQR accepts 25 UTF-8 bytes, but `get-transactions-by-mc-ref` has a
  20-character cap. Use unique references of at most 20 ASCII characters
  when inquiry recovery is required.

- [ ] **Repeat and partial payment handling is production-ready**
  The supplied high-volume guidance says the same KHQR can be paid multiple
  times; confirm the provider rule with ABA. Deduplicate by `transaction_id`,
  reconcile by `merchant_ref`, and preserve separate Invoice, Payment, and
  Payment Allocation records with defined overpayment/refund handling.

- [ ] **Offline notification recovery is tested**
  Confirm ABA routing/whitelisting and its actual verification contract, then
  test both the notification path and `get-transactions-by-mc-ref` recovery.
  Treat a 50-row response as potentially incomplete because the endpoint has
  no pagination.

### Network & Infrastructure

- [ ] **Firewall allows outbound HTTPS to `checkout.payway.com.kh`** (production) or `checkout-sandbox.payway.com.kh` (sandbox)**  
  Your server must make outbound HTTPS calls on port 443.

- [ ] **DNS resolves `checkout.payway.com.kh` from your server**  
  ```bash
  nslookup checkout.payway.com.kh
  ```

- [ ] **Proxy settings configured (if your server uses a proxy)**  
  Set `HTTPS_PROXY` environment variable if needed.

### Testing

- [ ] **End-to-end flow tested in sandbox with test cards**  
  Complete at least one full payment flow: create → pay → webhook → database update.

- [ ] **Callback signature verification tested with invalid signatures**  
  Send a callback with a wrong hash and confirm your server rejects it with 400.

- [ ] **Duplicate callback handling tested**  
  Send the same callback twice and confirm the order isn't double-processed.

- [ ] **Test card numbers work for all supported payment options**  
  Cards, KHQR, ABA Pay — test each method you plan to offer.

---

## Post-Launch Monitoring (First 24 Hours)

### Watch For

| Metric | What to Monitor | Alert Threshold |
|---|---|---|
| **API errors** | `PayWayAPIError` frequency | > 5% of requests |
| **Callback latency** | Time between payment and webhook arrival | > 30 seconds |
| **Callback failures** | HTTP non-200 responses from your server | Any occurrence |
| **Duplicate callbacks** | Same `tran_id` received twice | > 10% of transactions |
| **Expired transactions** | `code: "22"` frequency | > 5% of initiated transactions |
| **SSL certificate expiry** | `checkout.payway.com.kh` cert | Expires in < 30 days |

### Quick Checks

```bash
# 1. Verify production credentials work
npx payway-sdk doctor --live  # (with production env vars)

# 2. Check webhook endpoint is accessible
curl -I https://your-production-domain.com/api/payway-webhook

# 3. Check outbound connectivity to PayWay
curl -I https://checkout.payway.com.kh

# 4. Monitor error logs for the first hour
tail -f /var/log/your-app/error.log | grep -i payway
```

---

## Rollback Plan

If issues arise after going live, revert to sandbox immediately:

```typescript
// Temporary: Switch back to sandbox while debugging
const payway = new PayWay({
  merchantId: process.env.PAYWAY_SANDBOX_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_SANDBOX_API_KEY!,
  environment: 'sandbox',  // ← Switch back
});
```

**Rollback steps:**
1. Deploy with `environment: 'sandbox'` and sandbox credentials
2. Verify sandbox transactions work again
3. Debug the production issue
4. Re-deploy to production when fixed

---

## Quick Reference Card

Print this and keep it handy during launch:

```
┌─────────────────────────────────────────────────────────────┐
│  PayWay Production URLs                                      │
│  API Base:  https://checkout.payway.com.kh                  │
│  Dashboard: https://checkout.payway.com.kh                  │
│  Support:   [ABA support contact]                           │
├─────────────────────────────────────────────────────────────┤
│  Emergency Contacts                                          │
│  Dev Lead:  [name / phone]                                  │
│  On-Call:   [name / phone]                                  │
│  ABA Support: [email / phone]                               │
├─────────────────────────────────────────────────────────────┤
│  Quick Commands                                              │
│  Test auth:   npx payway-sdk doctor --live                    │
│  Check webhook: curl -I https://your-domain.com/api/webhook │
│  View errors:  tail -f error.log | grep PayWay              │
│  Rollback:     git revert <last-deploy-commit>              │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

You've completed the implementation guide! Here's what to do next:

- **[Chapter 14 — Appendix: Code Snippets](14-appendix-code-snippets.md)** — Full copy-paste-ready examples
- **[README](../README.md)** — Documentation index with all chapters

> ← [Previous: Error Handling & Debugging](12-error-handling-and-debugging.md) | [Next: Appendix →](14-appendix-code-snippets.md)
