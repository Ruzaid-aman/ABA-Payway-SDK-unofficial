# PayWay Postman Collection — Authoring Standards

> Benchmark: the WeChat Pay team's public Postman workspace
> ([wechatpay-dev / WeChat Pay Public Workspace](https://www.postman.com/wechatpay-dev/wechat-pay-public-workspace)
> and its companion repo [wechatpay-apiv3/wechatpay-postman-script](https://github.com/wechatpay-apiv3/wechatpay-postman-script)).
> All WeChat Pay facts below are **observed** from their published workspace data and README on **2026-10-01**
> (how to re-verify: see [Sources](#sources--how-to-re-verify)). PayWay facts are governed by
> `collection-index.md` and the `test:yaml` suite. Read this guide alongside
> [README.md](README.md) (docs rules) before changing descriptions, examples, environments, or distribution.

## Why this exists

WeChat Pay runs one of the most-referenced payment-gateway Postman workspaces. We benchmarked it so this
collection keeps the patterns that make it developer-friendly, skips the ones that don't fit us, and
protects the things we already do better. The result is a set of authoring standards plus an ordered
backlog — not a rewrite.

## Side-by-side snapshot

| Dimension | WeChat Pay (observed) | PayWay (today) | Verdict |
| --- | --- | --- | --- |
| Distribution | Cloud workspace; users **fork** collection + environment; "Run in Postman" button in the GitHub README | Repo-owned dist export (`dist/*.postman_collection.json`) + Git workspace; no cloud fork story yet | Keep repo ownership; adopt fork/Run-button when we publish (pending owner check R05/WP10) |
| Request descriptions | **0 of 130** — they document inside the request body instead | ⚡ Quick test block on every request | Keep ours; add their body-comment layer where it helps |
| Parameter docs | `///` comments on every JSON field; placeholder names that read as instructions | Formdata row `description` on some fields (e.g. `items`) | Standardize per-field docs — see §2 |
| Saved examples | **126 of 130 requests** have one; all success-shaped (`200_OK` ×114, `204_无数据` ×12) | 49 examples across 26 of 41 API requests; success **and** error shapes | Expand coverage to 41/41 — our error shapes already lead |
| Test scripts | 0 (empty test event at collection level) | 84 scripts + JSON-Schema assertions on 5 endpoints | Never regress — ours are the automated tutorial |
| Signing architecture | One ~9 KB collection-level pre-request; deps (`forge` 281 KB, `sm2` 204 KB) stored as collection variables | Versioned portable helper in collection variables + `sync_portable_helper.js` | Same pattern — keep versioning + sync gate |
| Environments | Two **empty, forkable templates** (`商户参数模版`, 国密 variant); 5 vars; only the private key is `secret` | Sandbox (pre-filled demo mirror) + Production (placeholders); env YAML values carry no `type` | Add an empty Merchant Template env; add `type: secret` — see §3, §5 |
| Credentials hygiene | Workspace visibility `Personal`/`Private`; secrets in **Current value** (stays local); audit third-party scripts | Distribution scan allowlists the demo identity; secret-typed collection var; repo-level protection | Keep both policies; document Current-value practice in the FAQ |
| Workspace README | 4-step quick start as the workspace **description** field + illustrated GitHub guide + issues link | In-repo `postman/documents/README.md` + Overview tab walkthrough | Mirror a 4-step quick start into the Postman workspace description — see §4 |
| Update story | Forks don't auto-sync: **watch** the workspace → `pull changes`; re-fork as fallback | Re-import the latest dist export; CI freshness gate (`export_json.js --check`) | Document the re-import path for merchants; adopt watch/pull-changes when published |
| FAQ | Keyed to real user mistakes (Initial vs Current value, PEM format, web-vs-desktop latency) | 60-second fixes in the Overview tab | Extend with our own observed mistakes — see §6 |
| AI-tool surface | None (no spec, no machine-readable registry) | OpenAPI 3.1 parity-gated, `llms.txt`, `error-codes.json` (83 codes) | Differentiator — protect it |

## 1. The body-as-documentation pattern (their signature trick)

WeChat Pay puts a `/* */` block at the top of every raw JSON body linking the official docs URL and a
one-paragraph endpoint summary, then a `///` trailing comment on **every** field, and inline `/* */` for
multi-line notes — e.g. their Native-order body:

```json
/* 接口地址：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_1.shtml
   接口说明：商户系统先调用该接口…… */
{
  "appid": "{{appid}}", ///请求基础下单接口时请注意APPID的应用属性……
  "mchid": "{{mchid}}", ///商户号,要与请求头保持一致
  "out_trade_no": "Tencentwechatpay0000001", ///商户系统内部订单号……同一商户号下唯一
```

This works because their collection-level pre-request **strips JSON comments before signing and sending**
(`script.js`, "Strip JSON Comments"):

```js
pm.request.body.raw = rawData.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
```

**How we apply it:** the docs live where the user's eyes already are — the body — not one click away in a
description tab. For us:

- **Formdata bodies (most of the purchase/QR surface):** the equivalent is a `description` on *every*
  formdata row, not just `items`. Postman renders it next to the field.
- **Raw JSON bodies (CoF endpoints, JSON-valued flags):** adopt their `///` style **only together with**
  the comment-stripping step in our signing script. Our HMAC is a field-concatenation hash order (unaffected
  by comments), but the gateway's JSON parser is not known to tolerate comments — treat this as
  **sandbox-verify-first** before rolling out, and strip unconditionally once verified.
- **URLs as documentation:** they name path placeholders in prose (`{{将此处替换为要查询的商户订单号}}` —
  "replace this with the order number"). Our analogue: keep variable names self-explanatory and never leave
  a cryptic token in a URL without a description row or Quick-test note.

## 2. Saved examples: one per request, minimum

Their rule is nearly absolute — 126/130 — and the exceptions look like oversights, not policy. Names follow
`<status>_<meaning>`: `200_OK`, `204_无数据` ("no data"). Response bodies also carry `///` field comments,
so the example doubles as field-level documentation.

**Our standard (raised from "26 of 41"):**

- Every API/flow request in the dist export carries **at least one** saved example; target 41/41.
- Name examples `<status>_<short-meaning>` (`200_OK`, `200_hosted_page_html`, `403_96_bogus_link_id`).
- Keep error examples — sourced from `postman/documents/error-codes.json` — on every endpoint with known
  failure codes. This is where we already lead; WeChat Pay ships zero error shapes.
- Include empty/no-content shapes where the gateway returns them (their `204_无数据` habit).
- Examples remain illustrative sandbox-shaped samples per the README's limitations section; label live
  captures as such.

Gate: `_build/export_json.js --check` (CI) keeps the committed export fresh; the example registry is
`_build/examples.json`.

## 3. Environments: minimal, empty, forkable

Their template `商户参数模版` ("merchant params template") is 5 variables, **all empty**, only
`apiclient_key.pem` typed `secret`. Credentials never ship in the artifact — merchants fork the template and
fill Current values. The FAQ's most common error (script reads an empty value) is literally caused by
putting the secret in the wrong column — a failure mode of their own design they had to document.

**Our standard:** we support both postures, deliberately:

- **Demo posture (keep):** the pre-filled sandbox merchant in collection variables + the Sandbox environment
  mirror — zero-setup first send, allowlisted by the distribution scan.
- **Bring-your-own-credentials posture (add):** a third, **empty** environment
  `postman/environments/PayWay - Merchant Template.environment.yaml` — `baseUrl`, `merchant_id`,
  `secret_key` (`type: secret`), `rsa_public_key`, `ctid`, `whitelist_payee` — placeholders empty, and add
  `type: secret` to `secret_key` in the Production environment too (our env YAMLs currently omit `type`).
- Server/base URL stays out of the credential set — theirs ships `server_url` as a collection variable, and
  our `baseUrl` behaves the same way.

## 4. The workspace description is the README's elevator pitch

Their workspace description is four numbered steps, ≤ 6 lines: fork the collection → fork the environment
template → fill three variables → send any request; then one link to the illustrated guide and issues.
The Postman workspace **description field** is what every visitor sees first — before any collection opens.

**Our standard:** write the same 4-step quick start into our Postman workspace description (cloud id
`98cc8641-…`, set in the Postman app — the file-backed workspace doesn't store it on disk), mirroring:

1. Import `dist/PayWay API — Complete Collection.postman_collection.json` (or open this Git workspace).
2. Nothing to configure — the sandbox merchant is pre-filled; optionally select the Sandbox environment.
3. Send **03 - Ecommerce Checkout → 1. Purchase**, pay on the hosted page (Visualize tab), then Check Transaction.
4. For callbacks, let folder 09 create a webhook.site receiver, or paste your own into `{{callback_listener}}`.

Keep the long-form guidance in `postman/documents/README.md` — the workspace description only routes.

## 5. Distribution and the fork/update story

Their distribution contract: the workspace is the single source of truth; consumers **fork**; the GitHub
README embeds a Run-in-Postman button pointing at the fork wizard; forks don't auto-sync, so watch the
workspace → `pull changes`, re-fork if that fails; local import is documented but discouraged ("麻烦而且
容易出错，还不能同步上游的变更" — tedious, error-prone, no upstream sync).

**Our standard:** repo + CI remains the source of truth (stronger governance than a cloud workspace — keep).
For consumers:

- Document the update path in the README: "re-import the latest dist export; the export version/freshness
  is CI-gated."
- When (and only when) the release owner clears the R05/WP10 authorization check on the demo identity and
  the collection goes public on Postman: add the Run-in-Postman fork button, publish the Merchant Template
  environment as a second forkable resource, and adopt their watch → pull-changes guidance verbatim.
- Security rules they state that we should mirror in consumer docs: keep any workspace holding real
  credentials `Personal`/`Private` (never `Public`); secret values go in **Current value** (stays in the
  local session, not Postman's cloud); audit third-party scripts before use.

## 6. FAQ keyed to real mistakes

Their FAQ maps one-to-one onto actual support load. Adopt the pattern with **our** observed mistakes:

1. *"Invalid PEM"* / signature fails → value pasted into Initial value instead of **Current value** (theirs;
   will become ours the moment merchants bring their own credentials).
2. Secret shows masked/empty → Postman secret typing; the on-disk YAML is plaintext by design (already in
   our README — keep visible in FAQ).
3. Edited collection variables don't take effect in the file-backed workspace → **fully restart Postman**
   (our own observed quirk).
4. Sandbox TLS errors → the self-signed cert chain; scope the workaround to the command/session, never
   global (AGENTS.md rule).
5. Web Postman is slow / CORS → use the desktop app (theirs; worth copying for ourCallback-heavy flows).
6. "Too few bytes to parse DER"-class errors → malformed PEM block (theirs; our `rsa_public_key` guidance).

## 7. Where we deliberately differ — protect these

- **Test scripts and schema assertions.** They ship none; their model is "read the example, eyeball it."
  Ours asserts status, saves `{{last_tran_id}}` and flow variables, prints `NEXT:` hints, and validates
  shapes — the collection teaches *and* verifies. Never trade scripts for comments.
- **Error documentation.** 83-code registry + error-shaped examples vs their zero. This is a merchant-DX
  moat; keep sourcing examples from the registry.
- **Agent/AI surface.** OpenAPI 3.1 parity-gated against the collection, `llms.txt` index, machine-readable
  error registry. WeChat Pay has nothing machine-readable; our stated goal is merchant devs **and** their AI
  tools. Any structural change must keep `spec_parity.js` green.
- **DRY requests.** They duplicate query/close/refund/billing endpoints per payment channel (130 requests,
  heavy duplication) to mirror their docs' taxonomy. We keep one request per endpoint with
  `{{payment_option}}` and a Reference request for endpoint discovery. Docs-mirroring aids findability;
  DRY aids correctness — we chose correctness, and the folder numbering + index provide the map.
- **Governed demo identity.** Their artifacts are strictly empty; ours carry an owner-authorized sandbox
  demo identity, enforced by `distribution-scan.js` with an exact-value allowlist. Keep the scan as the
  gate, not human memory.

## Actionable backlog (ordered)

Status after the 2026-10-01 wave: items 1, 2, 3, and 5 are **done** (69 examples / 41 requests · `PayWay - Merchant Template.environment.yaml` + secret typing · all 93 formdata rows documented · Overview fixes table extended and README FAQ added). Item 4 is manual-in-Postman; 6–7 remain open as stated.

| # | Item | Acceptance criterion | Gate |
| --- | --- | --- | --- |
| 1 | Examples coverage 26 → 41/41 API requests (+ registry-sourced error examples, `204`-style empties) | Every API/flow request has ≥1 example; names follow `<status>_<meaning>` | `export_json.js --check` |
| 2 | `PayWay - Merchant Template.environment.yaml` (empty, `secret_key` `type: secret`) + `type: secret` on Production | Importing the template yields zero-setup-for-nothing but valid-shape env; no values | `test:yaml` import shape |
| 3 | Per-field `description` on **every** formdata row of the high-traffic requests (purchase, QR, payment-link, CoF) | No undocumented row in folders 03–08 | `test:yaml` structure |
| 4 | 4-step quick start in the Postman workspace description (Postman app; text kept in this repo for reuse) | Workspace description matches §4 text | manual (Postman app) |
| 5 | FAQ additions per §6 in the Overview tab + README | Each of the six entries present, linked from Quick start | `readme_path_audit.js` |
| 6 | Comment-documentation for raw-JSON bodies **after** sandbox-verifying the strip-and-send path | Signing script strips comments; sandbox send succeeds; recorded in MAINTAINER_REPORT | sandbox observation + `test:yaml` scripts |
| 7 | Publish story: Run-in-Postman button, fork + watch/pull-changes docs, publish Merchant Template env | Blocked on R05/WP10 owner check; do not publish before clearance | distribution-scan + owner sign-off |

## Sources — how to re-verify

Benchmark date: **2026-10-01**. Re-pull with:

```
# Collection (populated: 22 folders / 130 requests / 126 examples)
curl -s -A "Mozilla/5.0" "https://www.postman.com/_api/collection/3391715-85f478d8-2596-420a-9f21-53376fc6ad0a?populate=true"
# Environment template 商户参数模版 (5 vars, all empty, apiclient_key.pem secret-typed)
curl -s -A "Mozilla/5.0" "https://www.postman.com/_api/environment/3391715-9f0f28eb-c323-4830-b9bc-3d1394562701"
# Workspace description (4-step quick start)
curl -s -A "Mozilla/5.0" "https://www.postman.com/_api/workspace/5f619604-11ee-42a4-b148-22abec1f0611"
```

- Workspace: <https://www.postman.com/wechatpay-dev/wechat-pay-public-workspace>
- Companion repo (README + `script.js`): <https://github.com/wechatpay-apiv3/wechatpay-postman-script>
  (comment-stripping: `script.js`, "Strip JSON Comments" section; fork/security/sync/FAQ: README)
