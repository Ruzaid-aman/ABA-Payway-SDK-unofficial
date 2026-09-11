# Canadia Bank Developer Portal vs ABA PayWay SDK, CLI, and Agent Skills

**Prepared:** 2026-09-11
**Competitor:** Canadia Gateway developer suite — https://sandbox-pay.canadiabank.com.kh/developer/overview
**Scope:** Everything a merchant developer can see without credentials: the public portal (11 sections, 8 documented endpoints), the public GitHub sample monorepo `ctg-digital/public-cpg-samples`, and the SDK install instructions for Java, Android, and iOS.
**Method:** Every portal page was fetched and read (SSR HTML plus the Nuxt content chunks that hold the endpoint and FAQ data); all four sample projects in the public repo were inspected file-by-file from the GitHub tree and raw source. Claims below cite the fetched evidence stored under `.scratch/canadia-audit/`.

## Executive summary

Canadia Gateway is a *smaller* product than PayWay — 8 endpoints, 2 payment methods (KHQR and deeplink), 2 currencies, refunds only for within-Canadia transactions — run by Canadia Technology Group (CTG), the bank's technology arm. It is not competing on API breadth, and its sample code is thin (mocks and hardcoded URLs). But it is competing hard on **developer-portal experience**, and in that dimension it is ahead of both ABA's official portal and our project:

- A polished, cohesive portal with per-endpoint **Mermaid sequence diagrams**, request/response examples for every endpoint, an **interactive API editor** on 7 of 8 endpoints, semantic **error codes** (`PG_EXTERNAL_ID_EXIST`), a 24-question categorized FAQ, and a Figma UI/UX guidelines page.
- A clear **3-step onboarding narrative** (request sandbox credentials → integrate with a bank-provided sandbox app → go live) including an explicit credential-handoff contract: approved merchants receive Merchant ID, API credentials, sandbox endpoint, and access instructions by email.
- A deliberate **credential-security stance**: per-request `hash` + JWT session token, and an FAQ that flatly tells developers to never ship API credentials in mobile or web clients (matching our server-only stance, but stated as a headline FAQ item rather than a footnote).
- Platform coverage as **product strategy**: iOS (SPM + CocoaPods), Android (Gradle/Maven), Java, and Flutter samples, each platform linked from the portal.

The gap between their portal quality and their artifact quality is the story: the docs promise a lot that the public samples do not deliver (mock PaymentManagers, a PAT-gated private SDK repo, a single-file web sample, 0 stars, no license, one author, 5 commits). Our project is the mirror image — deep, tested, typed artifacts behind a plain reading experience.

**Strategic implication:** Canadia is a preview of what ABA-merchant developers will come to expect from a bank payment portal. Steal the portal patterns (sequence diagrams per flow, interactive try-it, semantic error-code registry as a public contract, categorized FAQ, template gallery with use-case prose) and the platform-first sample strategy (Flutter + SPM + CocoaPods + Maven coverage), while avoiding their delivery failures (samples must run without a PAT; every doc claim must be executable). We already own the artifact quality; the portal/presentation layer is the copyable part.

## What the portal is

Nuxt 3 SSR site, 11 nav sections: Overview, Authentication, Payments, Refunds, Transactions, Webhooks, Guidelines, Sample Code, Error Handling, SDKs, FAQs. Sandbox URL `https://sandbox-pay.canadiabank.com.kh/sandbox`, production `https://pay.canadiabank.com.kh/payment-gateway/v2`.

Documented API surface (all POST, all with per-request `hash`):

| Category | Endpoint | Notes |
|---|---|---|
| Authentication | `/api/authenticate` | username+password+hash → JWT `token` |
| Payments | `/tps/api/payment/init` (KHQR) | returns `paymentQr`, `paymentKHQRLink`, `paymentId`, `paymentTimeoutMillis` |
| Payments | `/tps/api/payment/init` (DEEPLINK) | returns `paymentDynamicLink` |
| Payments | `/tps/api/payment/generate-qr-image` | 8 template options (OPTION1–5 variants) |
| Transactions | `/tps/api/payment/status` | by `externalId`/`type:EXTERNAL_ID`; statuses PENDING/SUCCESS/FAILED/CANCELLED |
| Refunds | `/tps/api/payment/refund` | full and multiple-partial (total ≤ original) |
| Webhooks | POST to merchant `callbackUrl` | payload `{paymentId, status, refNumber}` — **no hash/signature field** |

Hashing contract: SHA-256 over an endpoint-specific ordered parameter list + `{timestamp}{apiKey}` — including a quirky **amount normalization rule table** (integers → 1 decimal `100.0`, `.5` → 1 decimal, other fractions → 2 decimals) documented inline on every amount-bearing endpoint. The status envelope is `{status:{code,message,errorCode,timestamp},data:{...}}` with named `errorCode`s.

## What Canadia does better

### 1. Portal presentation: every endpoint gets a sequence diagram, examples, and a try-it editor

Each endpoint page has a Mermaid sequence diagram of the whole flow (merchant → gateway → customer → bank app → webhook/polling), a parameter table with types and required flags, a request-body example, and a response example. Seven of eight endpoints carry `apiEditor:!0` — an interactive "try it" console on the doc page itself. The webhook page documents the full merchant-side handling steps (validate source, authenticate, process, respond 200) inside its diagram.

Our typed API reference (`docs/api/`), 18 guide chapters, and 40+ skills contain more truth than their portal, but the truth arrives as prose and code lists. We have four hand-written diagrams in `docs/diagrams/` covering four flows; they have one generated diagram per endpoint, inline, at the point of use.

**Learning:** make per-flow sequence diagrams a generated, enforced part of every domain guide (checkout, QR, payment-link, COF, payout, pre-auth, refund, webhook), and treat a runnable example block per endpoint as the docs acceptance bar. Our `docs-examples.test.ts` already executes doc examples — extend that harness to assert every public endpoint page has a diagram + request/response pair.

### 2. Semantic, public error-code contract

Their error page is a single table mapping HTTP status + code + description (`PG_UNAUTHORIZED`, `PG_EXTERNAL_ID_EXIST`, `PYM_NOT_FOUND`, `PG_GET_STATUS_FAILED` = "KHQR payment has expired", `PG_SYSTEM_UNDER_MAINTENANCE`, …) plus a four-step "key practice" recipe (log, display friendly message, retry transient, contact support). One glance tells an integrator every failure they must branch on.

Our `PayWayError` hierarchy and per-domain error families (docs/12) are deeper — typed kinds, `paywayCode`, `fieldErrors`, correlation metadata — but the full PayWay error-code space is scattered across SANDBOX-FINDINGS sections, per-chapter tables, and gateway live-verifications. We never published one consolidated machine-readable registry (only the CLI `explain` command decodes it).

**Learning:** publish a consolidated, versioned error-code registry (JSON + a single docs table) covering every gateway code we have live-verified, with branch advice. It doubles as the input for `explain` and for the OpenAPI coverage audit artifacts already in flight.

### 3. Amount-format and hashing rules are a documented public contract

The amount normalization table (integers hash as `100.0`, `.5` as one decimal, other fractions as two) appears inline on every endpoint where amounts enter the hash, with concrete input→normalized examples. The per-endpoint hash parameter order is spelled out on each page (`hash(amount,externalId,ccy,{timestamp},{apiKey})`).

Our SDK hides this entirely inside `signRequest`/hash utilities — strictly better for users — but the underlying rule is only documented in deep guides, which is exactly what a non-TypeScript integrator (PHP shop, Python shop) porting the signature needs. We corrected real hash-order bugs against the live gateway (SANDBOX-FINDINGS §16 per-endpoint shapes); none of that verified knowledge is published as a one-page portable contract.

**Learning:** ship a "porting the signature" one-pager with the exact canonicalization rules per endpoint family, verified against the live sandbox — it is the single most-ported artifact for any KHQR gateway integrator and a differentiator vs the official ABA docs.

### 4. Onboarding narrative with an explicit credential handoff

The overview's three steps state exactly what a merchant receives after approval (Merchant ID, API credentials, sandbox endpoint, access instructions), that a **bank-provided sandbox app simulates payments** ("all transactions are simulated and no real funds are processed"), and that go-live is a credential swap with no logic change. The FAQ repeats this in question form ("Which API should I integrate first?" gives the ordered sequence; "Why is my payment still Pending?" enumerates causes and prescribes status inquiry).

We make developers assemble this timeline from QUICKSTART.md, docs/02, and SANDBOX-FINDINGS, and our sandbox payment-completion story genuinely is harder (ABA PAY app access is arrange-by-contact; the simulated demo can't pay a gateway QR). Canadia's simulated sandbox app is a real product advantage over ABA's sandbox — and our `webhook trigger` fixtures + `demo` are our local answer, but we don't say that in a comparison-ready way.

**Learning:** name the sandbox-completion story explicitly in QUICKSTART.md ("how do I get a PAID transaction today: simulated path vs ABA PAY app path"), and keep hardening the local simulator until it covers the pending→approved→reconciled arc that ABA's sandbox needs a bank app for.

### 5. Platform breadth as a headline feature

The Sample Code page advertises Android, iOS, Web, and Flutter samples; the SDKs page covers Java (GitHub Packages/Maven), Android (GitHub Packages/Gradle), and iOS (SPM + CocoaPods) with step-by-step install instructions. Flutter support — absent from both ABA's official portal and our `docs/examples/` — is a first-class citizen. The Figma-based UI/UX guidelines page gives merchants visual rules (spacing, color, responsive, typography, form validation states) for payment UI.

**Learning:** Flutter is a cheap reach win — a `docs/examples/flutter/` deeplink+webview sample mirroring our existing `PaymentActivity.kt`/`PaymentViewController.swift` docs examples would close a visible platform gap vs a bank that treats cross-platform as a selling point. The Figma-embed pattern (design tokens for payment UI) is worth considering for our VISUAL-GUIDE.md evolution.

### 6. QR template gallery with use-case prose

Their generate-qr-image endpoint documents 8 templates, each with a one-line placement recommendation ("minimal, unbranded... compact digital displays, fast scanning on POS terminals", "bank-branded... optimized for thermal printers", "horizontal... wide digital displays"). A merchant can choose a template by business need, not by trying each.

We pass PayWay's templates through (`--template template3_color` etc.) but document them as flag values, not as a use-case gallery. ABA's sandbox actually has more template variety than Canadia documents (per our generate-qr work), and we render the PNG locally — an advantage nobody can see.

**Learning:** add a template gallery to docs/07-qr-code-handling.md: each template code, rendered sample image, and one-line use case (POS display / thermal receipt / wide screen / branded). The PNG artifacts already exist in payway-output land; this is a docs-only win.

## Where our project is stronger

| Dimension | Our advantage | Their state |
|---|---|---|
| API/domain breadth | Checkout, QR (online+offline EMVCo KHQR), payment links, refunds, payouts+split, pre-auth, COF link/charge/renew/remove, exchange rates, transaction list/detail/close, void | 8 endpoints; KHQR + deeplink only; refunds within-Canadia only |
| Installable SDK | Published TypeScript package, typed API, npm distribution | SDKs are **private GitHub repos requiring a PAT**; Android artifact `com.ctg:cpg-android` exists but samples don't actually use it |
| CLI | 40+ commands: generation, polling, journal, webhook workbench, skills installer, doctor | None |
| Agent support | 32 packaged skills, agent quick reference, execution ledger | None |
| Webhook tooling | Signature verification (`verifyCallbackDetailed`), fixtures, trigger/resend/capture store, forwarder, guides | Payload has **no hash field at all**; docs suggest "check headers/IP" |
| Webhook security | HMAC-SHA512 with timing-safe compare, canonicalization shared with fixtures | No documented payload authentication |
| Testing/verification | 1600+ tests, contract harness, sandbox probes, live-verified findings ledger | Mock-only samples; no test content in web sample |
| Reconciliation | Local journal, timeline/reconcile/anomalies, correlation IDs | Nothing |
| Multi-provider posture | PayWay domain with provider abstraction (`checkout`, `purchase`) | Single bank product |

## Gaps and risks in Canadia's offering (our opportunity window)

1. **Samples don't run.** The Android `PaymentManager` is a mock (random success, hardcoded deeplink); the Flutter sample hardcodes a UAT URL; the web sample is one `index.html` with a placeholder variable. The samples demonstrate UX shape, not integration.
2. **SDK access requires a GitHub PAT.** Java/Android/iOS SDKs live in private `ctg-digital/*` repos; the public Podfile literally contains `token = 'REPLACE_WITH_PAT'`. No merchant can `pod install` or `mvn install` without contacting the bank. Our `npm install` story (post-publication) is friction-free by comparison — say so loudly.
3. **Webhooks have no payload signature.** `{paymentId, status, refNumber}` arrives with no hash/MAC; the recommended verification is source headers/IP — strictly weaker than PayWay's HMAC and our verification tooling. For security-conscious merchants this is a disqualifier, and a comparison-table line we should keep updated.
4. **Zero community signal.** 0 stars, no license file (samples are legally ambiguous to copy), single author, 5 commits, last activity 2026-02-25, `local.properties` (developer-machine paths) committed to the repo, `.DS_Store` files in-tree. No changelog, no versioning story for the docs.
5. **No operations surface.** No pagination, no list endpoint at all (status by externalId only), no payout/pre-auth/COF, no idempotency contract, no retry policy documented, no rate limits, no webhook redelivery/replay controls (our `webhook resend` exists precisely for this).
6. **JWT + per-request hash double-auth.** Every request still carries an ordered-param SHA-256 `hash` even after JWT login — two auth concepts to keep in sync, and the amount-normalization rule is a silent failure mode for exactly the amounts (.50, .05) merchants use most.

## Competitive opportunities for our SDK, CLI, and Agent Skills

### P0: Generated per-flow sequence diagrams + example blocks as a docs acceptance bar
Extend the docs-examples test harness to assert every public endpoint/flow chapter carries (a) a Mermaid sequence diagram and (b) an executable request/response pair. Start with the domains Canadia diagrams but we don't: COF link→charge, payout with beneficiary whitelist, pre-auth complete, payment-link pushback, webhook verify→fulfill→recover.

### P0: Publish the consolidated error-code registry
One versioned JSON + one docs table of every live-verified PayWay code (`paywayCode` semantics, HTTP-ish envelope, branch advice), wired into `explain` and the OpenAPI coverage audit. Canadia's single table page is the UX bar; our registry has strictly more content.

### P1: Flutter docs example
`docs/examples/flutter/` mirroring the existing Android/iOS payment-activity examples (deeplink launch + webview KHQR landing), cited from docs/04. Closes the only platform gap vs Canadia's headline coverage.

### P1: QR template gallery in docs/07
Template code + rendered sample + one-line use case for each PayWay QR template. Docs-only; reuses existing render pipeline.

### P2: "Signature porting" one-pager
The exact canonicalization/hash-order rules per endpoint family in one portable page for non-TypeScript integrators. This is also the artifact PHP/Python merchants would use to *leave* Canadia-style APIs — making it a customer-acquisition surface, not just docs.

### P2: Figma-class visual guidelines
Evaluate elevating VISUAL-GUIDE.md toward a token-based design contract (spacing/color/status states) for payment UI, the way Canadia ships Figma guidelines. Lowest priority; largest effort.

## Monitoring note

Re-check the portal quarterly (`sandbox-pay.canadiabank.com.kh/developer/*` pages are SSR, fetched artifacts in `.scratch/canadia-audit/`). The product is young (portal copyright 2026, samples Feb 2026); the interactive editor (`apiEditor`) landing publicly on all payment endpoints and any move to publish the SDKs without a PAT are the two signals that would escalate them from "polish leader" to "adoption threat."
