# Updates MAINTAINER_REPORT.md for the v1.3.0 workspace import: project
# credentials, Void Payment Link (§23), payment_link_id chaining fix, new counts.
import os

os.chdir(os.path.join(os.path.dirname(__file__), '..', '..', 'payway-boilerplate', 'Postman Collection API Testing'))
FN = 'MAINTAINER_REPORT.md'
s = open(FN, encoding='utf-8').read()

def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'{n}x found (wanted {count}): {old[:70]!r}'
    s = s.replace(old, new)

# 1) header Updated chain — prepend v1.3.0
sub("Updated: 19 Sep 2026 (v1.2.1 —",
    "Updated: 21 Sep 2026 (v1.3.0 — **workspace import + Void Payment Link + project credentials**: the collection now lives in the SDK repo at `payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json`; credential variables re-pointed from the public demo merchant to this project's sandbox merchant (merchant `ec476910`, `secret_key` Postman **Secret** type, full RSA public PEM, seeded beneficiary `500000001`, `ctid customer123`); folder 05 gains **Void Payment Link** — the live-verified (§23) permanently-cancel-an-unpaid-link endpoint — plus the create→`payment_link_id` chaining fix; 42 requests, 76 scripts, 0 syntax errors, official SDK import check green; v1.2.1 —")

# 2) §1 deliverable name note
sub("A single, self-contained Postman Collection (`PayWay_API_Postman_Collection.postman_collection.json`, schema v2.1.0, **v1.1.1**)",
    "A single, self-contained Postman Collection (originally `PayWay_API_Postman_Collection.postman_collection.json`; since v1.3.0 this repo carries it as `exp-PayWay API — Complete Collection.postman_collection.json`, schema v2.1.0)")

# 3) new §1.5 after §1.4 heading block (insert before "## 2.")
section15 = """### 1.5 v1.3.0 — workspace import, project credentials, Void Payment Link (21 Sep 2026)

The collection was imported from the standalone `D:\\PayWay_Postman` workspace into the PayWay SDK repo (`payway-boilerplate/Postman Collection API Testing/`). Changes, all verified by `.scratch/postman-collection-fix/` tooling (script parse in per-script vm scopes + variable resolution + official `postman-collection` SDK import):

- **Credentials re-pointed to this project's sandbox merchant (user-directed).** `merchant_id` `sonitatest` → `ec476910`; `secret_key` → the repo `.env` API key, kept as a Postman **secret**-type variable (masked in UI/exports); `rsa_public_key` placeholder → the project's full multi-line public-key PEM (first patch attempt had silently stored only the `-----BEGIN PUBLIC KEY-----` header — the `.env` value spans lines and a line-based parser truncates it); `whitelist_payee` docs sample `318111111358…` → **`500000001`** (a seeded sandbox beneficiary; the docs example is not in this merchant's whitelist); the payout pre-request's default fallback beneficiary → `500000001`; CoF `ctid` `TESTCONSUMER01` → `customer123`. Everything is seeded as **collection variables** — no external Postman environment is required.
- **NEW request — folder 05 "Void Payment Link"**: `POST /api/merchant-portal/merchant-access/payment-link/void`, the undocumented permanently-cancel-an-unpaid-link endpoint. Contract learned from the SDK implementation (`src/domains/payment-link.ts`) and SANDBOX-FINDINGS §23: signs like detail — `merchant_auth` = RSA `{mc_id, id}` (id = create's `data.id`), hash = base64 HMAC over `request_time + merchant_id + merchant_auth`, JSON body accepted. Test script maps all four live-observed outcomes: 200 "00" (VOIDED; `tran_id` is the numeric gateway log id), 403 `PTL188` already-voided (terminal state, treated as success — void is NOT idempotent), 403 `96` unknown id, plus the standard RSA-skip branch and a hard pre-request guard explaining `{{payment_link_id}}`. Description carries the ⚡ Quick test, the response table and the rules of thumb (irreversible; unpaid links only; post-void detail reads `VOIDED`, hosted page renders the invalid-data shell code 07).
- **Chaining bug fixed (see §6 #17):** create's test never saved `payment_link_id` although the index promised "Saved by Create" — Details ran on a `'1'` placeholder. Create's test now saves `data.id` and prints a `NEXT:` hint; the Create → Details → Void chain works end-to-end.
- **Docs counters refreshed** in `collection-index.md` (42 requests, 93 variables, 37 pre+test pairs, 5 schema assertions) and the demo-merchant wording in the overview/folder descriptions replaced with the project-credentials wording. `_build/part_05_paymentlink.json` mirrors the new request so a future merge keeps it.

QA: collection validator — 10 folders, **42 requests, 76 scripts, 0 parse errors**, all `{{variables}}` resolve; postman-faithful simulation of the void scripts with real crypto backends — the pre-request's `hash` is byte-identical to `HMAC-SHA512(req_time + merchant_id + merchant_auth)` under the project secret, `merchant_auth` encrypts to a correct 128-byte RSA block for the project's 1024-bit key, the missing-id guard throws its clear message, and all four test branches pass; official `postman-collection` SDK import check — importable, 42 items, 93 variables, 0 malformed hosts, `secret_key` secret-typed.

"""
sub("## 2. Live verification matrix (sandbox, demo merchant `sonitatest` / `sonitatestinstore`)",
    section15 + "## 2. Live verification matrix (sandbox — v1.3.0 uses this project's merchant `ec476910`; earlier rows ran on the demo merchants `sonitatest` / `sonitatestinstore`)")

# 4) §2 matrix: add void row after the payment-link-ish rows (before the closing "Not live-verifiable")
sub("| Payout / Whitelist / Pre-auth / Payment Link (RSA) | ⚠️ SKIP | Same RSA skip handling as Refund |",
    "| Payout / Whitelist / Pre-auth / Payment Link (RSA) | ⚠️ SKIP | Same RSA skip handling as Refund |\n| **Void Payment Link** (v1.3.0) | ✅ contract-verified | Contract live-verified through the SDK/CLI e2e (SANDBOX-FINDINGS §23 addendum, all six legs green); the Postman request itself was verified by simulation — its computed hash is byte-identical to the SDK's composition and all four response branches (00 / PTL188 / 96 / other) pass their assertions. Not yet fired live **from Postman** |")

# 5) §4 verdict block
sub("""JSON.parse: OK (212 KB) — sdk.Collection instantiated
10 folders, 41 requests, 76 collection variables
request prerequest=36, request test=36, collection prerequest=1, collection test=1
URL issues: none — secret-typed variables: secret_key
VERDICT: importable in Postman""",
    """JSON.parse: OK (218 KB) — sdk.Collection instantiated
10 folders, 42 requests, 93 collection variables
request prerequest=37, request test=37, collection prerequest=1, collection test=1
URL issues: none — secret-typed variables: secret_key
VERDICT: importable in Postman (re-run 2026-09-21 after the v1.3.0 import)""")

# 6) §6 add bug 17
sub("| 16 | Missing `{{return_params}}` seed broke the callback sample sender | Seeded in collection variables |",
    "| 16 | Missing `{{return_params}}` seed broke the callback sample sender | Seeded in collection variables |\n| 17 | Create's test never saved `payment_link_id` although the index said \"Saved by Create\" — Details ran on a `'1'` placeholder (found when adding Void, v1.3.0) | Create's test appends the save: `payment_link_id` = create response `data.id`, plus a `NEXT:` hint pointing at Details/Void |")

# 7) DX/security paragraph
sub("DX/security changes: `merchant_id`/`secret_key` pre-filled with the **public sandbox demo merchant** (`sonitatest`) so the collection works on first Send; `secret_key` is a Postman **secret**-type variable with a replace-me description; every prerequisite throws a clear, actionable message instead of a cryptic failure.",
    "DX/security changes: since v1.3.0 `merchant_id`/`secret_key`/`rsa_public_key` are pre-filled with **this project's sandbox merchant** (`ec476910` + repo `.env` API key + full public PEM) so the collection works on first Send; `secret_key` stays a Postman **secret**-type variable with a replace-me description; `whitelist_payee` and the payout pre-request fallback use the seeded sandbox beneficiary `500000001`; every prerequisite throws a clear, actionable message instead of a cryptic failure.")

# 8) §7 part_00 variables count
sub("`part_00_info.json` — info + **Get Started guide** (source: `_build/get_started.md`, rendered in Postman's Overview tab), 76 collection variables (incl. the `__helpers` library)",
    "`part_00_info.json` — info + **Get Started guide** (source: `_build/get_started.md`, rendered in Postman's Overview tab), 93 collection variables (incl. the `__helpers` library)")

# 9) §8 rebuild block + deliverable
sub("""node _build\\merge.js                     # parts -> PayWay_API_Postman_Collection.postman_collection.json
node _build\\syntaxcheck.js               # every script parses
node _build\\validate.js                  # structure, vars, setNextRequest targets
node _build\\verify_postman_import.js     # official postman-collection SDK import check
node _build\\smoketest.js                 # sim pass: all 41 scripts execute, all body vars set
node _build\\smoketest.js live            # LIVE pass against sandbox (demo merchant, safe endpoints only)""",
    """cd "payway-boilerplate/Postman Collection API Testing"   # from the repo root
node _build\\merge.js                     # parts -> merged collection (legacy deliverable name)
node _build\\syntaxcheck.js               # every script parses
node _build\\validate.js                  # structure, vars, setNextRequest targets
node _build\\verify_postman_import.js     # official postman-collection SDK import check (needs postman-collection + @faker-js/faker in _build)
node _build\\smoketest.js                 # sim pass: all scripts execute, all body vars set
node _build\\smoketest.js live            # LIVE pass against sandbox (safe endpoints only)

# repo-side validator (no _build dependency):
node .scratch/postman-collection-fix/validate_exp.cjs "exp-PayWay API — Complete Collection.postman_collection.json\"""")

sub("Deliverable: `D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json` (~212 KB, 10 folders, 41 requests, 72 scripts — every request and folder documented, 24 ⚡ Quick-test blocks; helper library in the `__helpers` variable since v1.2.0).",
    "Deliverable in this repo: `payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json` (~218 KB, 10 folders, 42 requests, 76 scripts — every request and folder documented, ⚡ Quick-test blocks; helper library in the `__helpers` variable). NOTE: `_build/merge.js` still writes the legacy `PayWay_API_Postman_Collection.postman_collection.json` name and legacy variable set — reconcile part_00 with the shipped export before re-merging (the shipped `exp-` file is the source of truth).")

# 10) §9 gap 5
sub("5. Optional hardening: move `secret_key`/`merchant_id` into a Postman environment (Sandbox/Prod) instead of collection defaults; add `newman run` in CI with `smoketest.js` sim pass as pre-commit.",
    "5. Credential placement (decided 2026-09-21): the project sandbox credentials stay **in the collection** (`secret_key` is Postman Secret-typed) so the file stays self-contained — switching to Sandbox/Prod Postman environments remains optional hardening. Still open: `newman run` in CI with the `smoketest.js` sim pass as pre-commit.")

# 11) §10 reference lines
sub("- PayWay sandbox: `https://checkout-sandbox.payway.com.kh` (live-tested 2026-09-18)",
    "- PayWay sandbox: `https://checkout-sandbox.payway.com.kh` (live-tested 2026-09-18; project merchant `ec476910` since v1.3.0)")
sub("- Docs index: `D:\\PayWay_Postman\\llms.txt` (each `*.md` doc is fetchable — used to verify the KHQR endpoint)",
    "- Docs index: `llms.txt` in this folder (each `*.md` doc is fetchable — used to verify the KHQR endpoint)")
sub("- Sandbox demo merchants: `sonitatest` (ecommerce), `sonitatestinstore` (QR/in-store), ctid `TESTCONSUMER01` for CoF",
    "- Sandbox merchants: this project `ec476910` (ctid `customer123` for CoF); public demo merchants `sonitatest` (ecommerce) / `sonitatestinstore` (QR/in-store) remain available for read-only doc demos")
sub("- Postman collection schema: `https://schema.getpostman.com/json/collection/v2.1.0/collection.json`",
    "- Postman collection schema: `https://schema.getpostman.com/json/collection/v2.1.0/collection.json`\n- Full audit, incidents and roadmap (pre-import history): `MAINTAINER_REPORT.md` in this folder; repo-side SDK contract: `docs/17-payment-link.md` §17.4 + `docs/internal/SANDBOX-FINDINGS.md` §23 for the void endpoint")

open(FN, 'w', encoding='utf-8', newline='\n').write(s)
print('MAINTAINER_REPORT.md updated:', s.count('v1.3.0'), 'v1.3.0 mentions')
