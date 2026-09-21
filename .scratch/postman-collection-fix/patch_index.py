# Updates collection-index.md: workspace-local filenames, project credentials,
# current counts (42 requests / 93 vars / 37 pairs), Void row already present.
import os

os.chdir(os.path.join(os.path.dirname(__file__), '..', '..', 'payway-boilerplate', 'Postman Collection API Testing'))
FN = 'collection-index.md'
s = open(FN, encoding='utf-8').read()

def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'{n}x found (wanted {count}): {old[:70]!r}'
    s = s.replace(old, new)

sub("Navigation index for the PayWay merchant-API Postman collection built in this workspace. The collection is a self-contained playground for merchant developers: every API call signs itself (HMAC-SHA512), auto-encrypts RSA payloads when possible, saves the variables the next step needs, and documents its hash order inline. Use this file to find the right folder/request without opening the 212 KB JSON.",
    "Navigation index for the PayWay merchant-API Postman collection built in this workspace. The collection is a self-contained playground for merchant developers: every API call signs itself (HMAC-SHA512), auto-encrypts RSA payloads when possible, saves the variables the next step needs, and documents its hash order inline. Use this file to find the right folder/request without opening the 218 KB JSON.\n\n> The collection was built in the standalone `D:\\PayWay_Postman` workspace and imported here on 21 Sep 2026 (v1.3.0): credential variables now carry **this repo's sandbox merchant** (see Quick start), and folder 05 gained **Void Payment Link** (contract: `docs/17-payment-link.md` §17.4, SANDBOX-FINDINGS §23).")

sub("**Last verified:** 19 Sep 2026 (stats extracted directly from the merged collection JSON).",
    "**Last verified:** 21 Sep 2026 (stats extracted directly from the shipped collection JSON; official `postman-collection` SDK import check green).")

# At a glance table
sub("| Collection file | `PayWay_API_Postman_Collection.postman_collection.json` (~212 KB) |",
    "| Collection file | `exp-PayWay API — Complete Collection.postman_collection.json` (~218 KB) — **the deliverable** |")
sub("| Version / schema | `1.2.1`, collection format v2.1.0 |",
    "| Version / schema | unversioned export, collection format v2.1.0 (lineage: v1.2.1 in the `PayWay_Postman` workspace) |")
sub("| Folders / requests | 10 folders, 42 requests |", "| Folders / requests | 10 folders, 42 requests (37 API calls + 5 doc-only reference GETs) |")
sub("| Scripts | 36 API calls with pre-request **and** test scripts (72 scripts, 0 syntax errors); 5 doc-only reference GETs |",
    "| Scripts | 37 API calls with pre-request **and** test scripts (74) + 2 collection-level scripts = 76, 0 syntax errors |")
sub("| Collection variables | 76 (demo merchant pre-filled; `secret_key` is a Postman Secret type; `__helpers` holds the shared script library) |",
    "| Collection variables | 93 (project sandbox merchant pre-filled; `secret_key` is a Postman Secret type; `__helpers` holds the shared script library) |")
sub("| JSON-Schema assertions | 6 endpoints via shared `assertJsonSchema()` helper |",
    "| JSON-Schema assertions | 5 endpoints via shared `assertJsonSchema()` helper |")

# Workspace file map table
sub("""| `PayWay_API_Postman_Collection.postman_collection.json` | **The deliverable** — import this into Postman |
| `PayWay_CoF_Postman_Collection_v4.json` | Proven legacy CoF collection; source of truth for CoF hash orders (keep as regression baseline) |
| `Create Transaction Defualt Checkout.postman_collection.json` | Earlier scratch collection (hosted checkout) |
| `Create Transaction QR.postman_collection.json` | Earlier scratch collection (QR) |
| `Create Transaction QR on API.postman_collection.json` | Earlier scratch collection (QR on API) |""",
    """| `exp-PayWay API — Complete Collection.postman_collection.json` | **The deliverable** — import this into Postman |
| `OLD-Check Trasaction.postman_collection.json` | Legacy scratch export (renamed from `Check Trasaction…`, kept as regression baseline) |
| `OLD-Create Transaction Defualt.postman_collection.json` | Legacy scratch export (hosted checkout; signs against other merchants, secrets via a Postman environment) |
| `OLD-Create Transaction QR-AI HELMET SPA Copy.postman_collection.json` | Legacy scratch export (QR; `req_time` month bug included — historical only) |""")

# Quick start steps 1-2
sub("1. Import `PayWay_API_Postman_Collection.postman_collection.json` into Postman.",
    "1. Import `exp-PayWay API — Complete Collection.postman_collection.json` into Postman.")
sub("2. Nothing to configure for a first test — the **public sandbox demo merchant is pre-filled**. For your own merchant replace: `secret_key` (HMAC-SHA512 signing secret — store as a Postman *Secret*), `rsa_public_key` (PEM), `merchant_id`, `ctid`; switch `baseUrl` sandbox/production.",
    "2. Nothing to configure for a first test — **this repo's sandbox merchant is pre-filled** (merchant `ec476910`, `secret_key` Postman *Secret*, full `rsa_public_key` PEM, seeded beneficiary `500000001`, `ctid customer123`) — all as collection variables, no environment needed. For another merchant replace `merchant_id`/`secret_key`/`rsa_public_key`; switch `baseUrl` sandbox/production.")

# Core flows: add payment-link lifecycle
sub("- **Payment Link:** *(missing)*", "- **Payment Link:** *(missing)*") if False else None
sub("- **Payout (07):** Add payee to whitelist → Payout to up to 250 beneficiaries.",
    "- **Payment link lifecycle (05):** Create → share the URL → the pushback hits `return_url` (no hash — verify via Check Transaction) → Details. Cancel an unpaid link with **Void** (irreversible, `PTL188` = already voided).\n- **Payout (07):** Add payee to whitelist → Payout to up to 250 beneficiaries.")

# Variables section
sub("## Collection variables (76, grouped)", "## Collection variables (93, grouped)")
sub("| **Must set** | `baseUrl`, `merchant_id`, `secret_key`, `rsa_public_key`, `ctid` | `secret_key` = HMAC-SHA512 secret (store as Postman Secret, not an API key); `rsa_public_key` = PEM for portal APIs |",
    "| **Pre-filled (this repo's sandbox merchant)** | `baseUrl`, `merchant_id` (`ec476910`), `secret_key` (Postman Secret), `rsa_public_key` (PEM), `ctid` (`customer123`), `whitelist_payee` (`500000001`) | Replace only for another merchant; `secret_key` = HMAC-SHA512 secret (Postman Secret type, not an API key); `rsa_public_key` = PEM for portal APIs |")

# Scripting architecture counts
sub("- **Per-request:** each request description documents its exact hash field order (and PHP samples); 36 API calls carry scenario pre+test scripts (error-code handling, variable chaining, approval-code asserts, JSON-Schema assertions).",
    "- **Per-request:** each request description documents its exact hash field order (and PHP samples); 37 API calls carry scenario pre+test scripts (error-code handling, variable chaining, approval-code asserts, JSON-Schema assertions).")
sub("- **JSON-Schema assertions (6):** Purchase, Check Transaction, Refund, Generate QR, Get Token Details (folder 08) and B2 Get Token Details (Flow B).",
    "- **JSON-Schema assertions (5):** Purchase, Check Transaction, Generate QR, Get Token Details (folder 08) and B2 Get Token Details (Flow B).")

# part_00 variables count
sub("| `part_00_info.json` | `info` + README, 76 variables (incl. `__helpers` library), collection-level events (library loader + test hook) |",
    "| `part_00_info.json` | `info` + README, 93 variables (incl. `__helpers` library), collection-level events (library loader + test hook) |")

# Build PowerShell block paths
sub("""node D:\\PayWay_Postman\\_build\\merge.js
node D:\\PayWay_Postman\\_build\\syntaxcheck.js
node D:\\PayWay_Postman\\_build\\validate.js
node D:\\PayWay_Postman\\_build\\audit.js
node D:\\PayWay_Postman\\_build\\standards.js""",
    """cd "payway-boilerplate/Postman Collection API Testing"   # from the repo root
node _build\\merge.js
node _build\\syntaxcheck.js
node _build\\validate.js
node _build\\audit.js
node _build\\standards.js""")

# merge note: the shipped deliverable is the exp file
sub("The merged JSON is generated — edit parts, never the merged file.",
    "The merged JSON is generated — edit parts, never the merged file. **Since v1.3.0 the shipped deliverable is `exp-PayWay API — Complete Collection.postman_collection.json`** (the postman-agent's latest export, which `part_00_info.json` does not fully reflect — reconcile before re-merging); `_build/part_05_paymentlink.json` already mirrors the Void request.")

# Source docs
sub("- Per-page Markdown index: `D:\\PayWay_Postman\\llms.txt`.",
    "- Per-page Markdown index: `llms.txt` in this folder.")
sub("- Full audit, incidents and roadmap: `D:\\PayWay_Postman\\MAINTAINER_REPORT.md`.",
    "- Full audit, incidents and roadmap: `MAINTAINER_REPORT.md` in this folder.")

open(FN, 'w', encoding='utf-8', newline='\n').write(s)
print('collection-index.md updated')
