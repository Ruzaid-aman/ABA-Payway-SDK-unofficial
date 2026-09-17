---
title: "Building a PayWay SDK: CTO workflow and strategy"
date: 2026-07-15T09:44:40.367Z
platform: claude
---

### User

Plan like a CTO if you are tasked to quickly build and ship, how would you build SDK for \[[https://developer.payway.com.kh\](https://developer.payway.com.kh/](https://developer.payway.com.kh]\(https://developer.payway.com.kh/)) what will be your workflow,

---

### Assistant

```text
api_key
```

### Situation 1: No constraints (budget, team, timeline are open)

**Day 0-2 — Spec authoring**

```text
x-hmac-auth
```

**Day 2-5 — Generation**

```text
req_time
```

**Day 5-8 — Hardening & ship**

```text
jira-analytics
```

**Why this is fast:** you're paying to skip the boilerplate-writing and doc-generation labor entirely. Total elapsed time for a usable dual-language SDK: about a week if the spec is clean going in.

### Situation 2: Open-source / free only

Same spec-first discipline, different tooling:

**Spec:** identical — hand-author OpenAPI 3.1, validate manually. No shortcut here regardless of budget.

**Generation:**

```text
openapi-typescript
```

**Auth layer:** written once by hand in each language — this was always going to be custom code, paid tooling doesn't save you here either.

```text
jira-analytics
```

```text
pip-audit
```

**Docs:** Docusaurus (free) or just TypeDoc/Sphinx output committed to the repo.

**Publishing:** npm public + PyPI, both free.

**Trade-off:** roughly 2-3x the calendar time of the Stainless path — mainly because you're hand-maintaining the generated-code layer instead of a vendor doing it — but zero recurring cost and full auditability, which matters more in a fintech/banking context anyway.

```text
jira-analytics
```

Want me to draft the actual OpenAPI spec skeleton (paths + the custom HMAC security scheme) as a starting point?

---

### User

yes read these - draft the actual OpenAPI spec skeleton (paths + the custom HMAC security scheme) as a starting point be super critical about every parameters and descriptions and flow 1 - [https://developer.payway.com.kh/ecommerce-checkout-3158159f0](https://developer.payway.com.kh/ecommerce-checkout-3158159f0) 2 - [https://developer.payway.com.kh/purchase-14530820e0](https://developer.payway.com.kh/purchase-14530820e0) 3 - [https://developer.payway.com.kh/check-transaction-14530826e0](https://developer.payway.com.kh/check-transaction-14530826e0) 4 - [https://developer.payway.com.kh/close-transaction-14530822e0](https://developer.payway.com.kh/close-transaction-14530822e0)

---

### Assistant

There's a markdown export for each page. Let me pull the full detailed markdown for the four pages you asked about (plus overview for auth details).

Excellent — this markdown export includes the full raw OpenAPI. Let me pull the other three the same way.

Now the ecommerce-checkout overview page, which should describe the general flow and possibly the auth model narrative.

I pulled the actual OpenAPI fragments PayWay's docs platform (Apidog) exports under the hood — much better than scraping rendered HTML. Before I show the spec, here's what's **critical and easy to get wrong**, which is exactly why "just point a generator at the docs" doesn't work here:

### Critical findings that break a naive "one auth scheme" approach

**1\. The HMAC signature is not a uniform auth header — it's a body field, and the signed-field order is different per endpoint:**

```text
purchase
```

```text
securityScheme
```

```text
$currency
```

```text
X-PAYWAY-HMAC-SHA512
```

```text
purchase
```

```text
check-transaction
```

Now the spec:

Valid, parses clean. Let me also run a proper OpenAPI validator to catch structural issues a hand-written spec often has.

Now let me add proper media-type-level examples on the close-transaction response, then re-validate.

Valid now. Copying to outputs.

```text
openapi-spec-validator
```

**What makes this "critical" rather than a straight transcription:**

```text
x-hmac-fields
```

**Next steps I'd suggest, in order:**

```text
check-transaction-2
```

Want me to pull the remaining four endpoints and extend this spec, or move straight to scaffolding the TypeScript client with the HMAC signing middleware?

---

### User

pull the remaining four endpoints and extend this spec

---

### Assistant

Four more pulled. Big finding: **the Refund API uses a completely different, third auth mechanism** — RSA public-key encryption on top of the HMAC layer. Here's what's critical across all four:

```text
/api/merchant-portal/...
```

Let me extend the spec.

Now let me update the header description with the new rules, then add the four new paths and schemas.

Now add rules 7–10 covering the newly found inconsistencies:

Now add the four new paths. Let me view the current paths section to insert correctly.

```text
components.schemas
```

Now validate again.

Valid — all 7 Ecommerce Checkout endpoints now covered. Copying to outputs.

All 7 Ecommerce Checkout endpoints are in now, still validating clean as OpenAPI 3.1.

**The three auth mechanisms now fully mapped, side by side:**

```text
req_time
```

```text
api_key
```

**Still unverified, before you build against this in production:**

```text
-2
```

```text
openapi-typescript
```

---

### User

what is a good approch to split the openapi yaml or keep it as one

---

### Assistant

Good question — worth deciding deliberately rather than defaulting either way. Quick gut check first: at 1016 lines / ~42KB for 7 endpoints, you're still comfortably in single-file territory. But PayWay's full surface (per the sitemap I scraped) is 6 domains and ~20 endpoints — Ecommerce Checkout, Credentials on File, ABA QR, Payment Link, Pre-auth, Payout, KHQR. At that size, a single file becomes a liability. Here's how I'd think about it.

### When to keep it as one file

```text
Ctrl+F
```

Right now, honestly, staying as one file is still fine.

### When to split — and the trigger for PayWay specifically

Split once you add the remaining domains, for three concrete reasons:

```text
refund
```

### Recommended structure

```text
payway-openapi/
├── openapi.yaml                 # root: info, servers, tags, $refs into everything else
├── paths/
│   ├── ecommerce-checkout.yaml  # purchase, check-tx, close-tx, refund, tx-list, tx-detail, exchange-rate
│   ├── credentials-on-file.yaml # link-account, link-card, payment, renew-token, etc.
│   ├── qr-api.yaml
│   ├── payment-link.yaml
│   ├── pre-auth.yaml
│   └── payout.yaml
├── components/
│   ├── schemas/
│   │   ├── ecommerce-checkout.yaml
│   │   ├── credentials-on-file.yaml
│   │   └── shared.yaml          # StatusBlock, common error shapes
│   └── webhooks.yaml            # paymentCallback and any other pushbacks
└── dist/
    └── openapi.bundled.yaml     # generated, gitignored or committed as a build artifact
```

```text
$ref: './paths/ecommerce-checkout.yaml#/purchase'
```

### The bundling step — this is the part people forget

```text
openapi-generator-cli
```

```bash
npx @redocly/cli bundle openapi.yaml -o dist/openapi.bundled.yaml
```

```text
swagger-cli bundle
```

### My actual recommendation for your situation

Given you're mid-build and the immediate priority is nailing the auth layer per domain (not scaling to a 10-person spec-authoring team), I'd:

```text
$ref
```

```text
paths/
```

---

### User

Split by domain the moment you add QR API / Payment Link / Pre-auth / Payout, set up the `paths/` + `components/` split now with a Redocly bundle script wired in, so it's ready to grow into as we pull the remaining domains

---

### Assistant

Good — let's lock in the structure now while it's cheap to set up, even though only Ecommerce Checkout has content yet. I'll preserve every inline comment/annotation while moving things (not round-tripping through a YAML parser, which would silently drop them).

```text
jira-analytics
```

Got real, verifiable SHAs. Now let's build the split files.

```text
$ref
```

```text
StatusBlock
```

```text
StatusBlock
```