---
title: "check all the api response examples and infer abou the diffrent time format used in API response is"
date: 2026-09-14T11:17:37.226Z
platform: arena
---

### User

check all the api response examples and infer abou the diffrent time format used in API response is it aisa/phnom penh or UTC check for all APIs?  
[https://developer.payway.com.kh](https://developer.payway.com.kh)

---

### Assistant

### TL;DR (what timezone is it?)

```text
+07:00
```

```text
YYYY-MM-DD HH:mm:ss
```

```text
expire_in
```

## Time formats + timezone signals found in the response examples (audited by API area)

### 1) Payment Gateway v1 (transaction querying APIs)

These responses use **naive datetime strings** (no offset shown):

```text
transaction_date
```

```text
+07:00
```

### 2) Payment Link APIs

These responses include both **naive datetime strings** and **epoch seconds**:

```text
created_at
```

```text
expired_date
```

```text
expired_date
```

### 3) Payout API (Payment Gateway v2 direct payout)

This response is the clearest “source of truth” about timezone because it includes an offset:

```text
transaction_date
```

**Conclusion:** this is explicitly **UTC+7**, i.e. consistent with **Asia/Phnom\_Penh**. [1](https://developer.payway.com.kh/payout-14530816e0)

### 4) Credentials on File / Account on File (token flows)

You’ll see **epoch seconds** and **ISO 8601**, sometimes with an offset and sometimes without:

```text
expire_in
```

```text
expired_at
```

### 5) Whitelist / Beneficiary APIs

These responses use naive datetime strings:

```text
created_at
```

Again: consistent handling is to treat these as **Asia/Phnom\_Penh** naive local time unless PayWay states otherwise. [12](https://developer.payway.com.kh/add-a-beneficiary-to-whitelist-14530818e0)

## APIs whose response examples don’t contain timestamps

A bunch of endpoints in the docs have no time fields in the shown *responses*, so there’s nothing timezone-related to interpret there (example: **Close transaction** response is just a status object). [14](https://developer.payway.com.kh/close-transaction-14530822e0)  
Similarly, **Exchange rate** response shows rates but no time field. [15](https://developer.payway.com.kh/exchange-rate-14530823e0)  
The **QR API** response example includes QR payload + status, no time field. [16](https://developer.payway.com.kh/qr-api-14530840e0)

## Recommended parsing rules (robust and consistent)

Because the docs mix formats, the most reliable approach is:

```text
...+07:00
```

## Implementation tip (avoid common bugs)

```text
YYYY-MM-DD HH:mm:ss
```

Instead, parse with an explicit format + timezone:

### Node.js (Luxon)

```text
import { DateTime } from "luxon";

const s = "2025-02-13 13:55:25";
const dt = DateTime.fromFormat(s, "yyyy-MM-dd HH:mm:ss", { zone: "Asia/Phnom_Penh" });
const asUtcIso = dt.toUTC().toISO();  // for storage/logging
```

### Python

```text
from datetime import datetime
from zoneinfo import ZoneInfo

s = "2025-02-13 13:55:25"
dt_local = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("Asia/Phnom_Penh"))
dt_utc = dt_local.astimezone(ZoneInfo("UTC"))
```

## Bottom line

```text
+07:00
```

---

### User

rewrite it as user guide documentation

---

### Assistant

Here is the fully rewritten version as a clean, professional **User Guide** document:

# 📘 ABA PayWay API — Datetime & Timezone Reference Guide

```text
developer.payway.com.kh
```

## 1. Overview

When working with ABA PayWay APIs, you will encounter **three distinct time/date formats** across different API groups. Understanding how to correctly read, store, and convert these formats is critical to avoid bugs related to expiry logic, display times, and audit trails.

```text
+07:00
```

## 2. The Three Time Formats at a Glance

```text
2025-02-13 13:55:25
```

## 3. Format-by-Format Details

```text
YYYY-MM-DD HH:mm:ss
```

**What it looks like:**

```text
"transaction_date": "2025-02-13 13:55:25"
"created_at":       "2023-04-13 03:43:30"
"updated_at":       "2023-04-13 03:43:30"
```

**Timezone:** Not explicitly labelled in the response, but based on cross-API evidence (see §3.2), this should be treated as **Asia/Phnom\_Penh (UTC+7)**.

**Where it appears:**

```text
transaction_date
```

```text
YYYY-MM-DD HH:mm:ss
```

```text
YYYY-MM-DDTHH:mm:ss.sssssss+07:00
```

**What it looks like:**

```text
"transaction_date": "2024-09-10T15:53:27.2157019+07:00"
"expired_at":       "2026-06-07T15:47:38.8884292+07:00"
```

**Timezone:** Explicitly **UTC+7 (Asia/Phnom\_Penh)**. This is the clearest signal from the docs about PayWay's server timezone.

**Where it appears:**

```text
transaction_date
```

> ✅ **This format is unambiguous.** Any standard ISO 8601 date parser will handle this correctly because the offset is embedded in the string.

```text
expired_at
```

### 3.3 Unix Epoch Seconds — Integer

**What it looks like:**

```text
"expired_date": 1681357409
"expire_in":    1627113926
```

**Timezone:** Not applicable — Unix epoch seconds are an **absolute point in time** (seconds since 1970-01-01 00:00:00 UTC). They carry no timezone bias.

**Where it appears:**

```text
expired_date
```

```text
created_at
```

## 4. API-by-API Quick Reference

### 4.1 Payment Gateway v1

```text
transaction_date
```

### 4.2 Payment Gateway v2 — Payout

```text
transaction_date
```

### 4.3 Payment Link

```text
created_at
```

### 4.4 KHQR Webhook Notification

```text
transaction_date
```

### 4.5 Credentials on File / Account on File (Token Flows)

```text
expire_in
```

### 4.6 Whitelist / Beneficiary APIs

```text
created_at
```

### 4.7 APIs with No Timestamp in Response Examples

The following APIs return no datetime fields in their documented response examples, so there is nothing timezone-related to handle:

- Close Transaction
- Exchange Rate
- QR API (response body)
- Pre-Auth Completion

## 5. How to Parse Each Format — Code Examples

```text
YYYY-MM-DD HH:mm:ss
```

Treat this as **Asia/Phnom\_Penh** local time.

**Node.js (Luxon)**

```text
import { DateTime } from "luxon";

const raw = "2025-02-13 13:55:25";

// Parse as Asia/Phnom_Penh
const local = DateTime.fromFormat(raw, "yyyy-MM-dd HH:mm:ss", {
  zone: "Asia/Phnom_Penh",
});

console.log(local.toISO());         // → 2025-02-13T13:55:25.000+07:00
console.log(local.toUTC().toISO()); // → 2025-02-13T06:55:25.000Z
```

**Python**

```text
from datetime import datetime
from zoneinfo import ZoneInfo

raw = "2025-02-13 13:55:25"
phnom_penh = ZoneInfo("Asia/Phnom_Penh")

local_dt = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=phnom_penh)
utc_dt   = local_dt.astimezone(ZoneInfo("UTC"))

print(local_dt.isoformat())  # → 2025-02-13T13:55:25+07:00
print(utc_dt.isoformat())    # → 2025-02-13T06:55:25+00:00
```

**PHP**

```text
$raw = "2025-02-13 13:55:25";
$dt  = new DateTime($raw, new DateTimeZone("Asia/Phnom_Penh"));

echo $dt->format(DateTime::ATOM);          // → 2025-02-13T13:55:25+07:00
$dt->setTimezone(new DateTimeZone("UTC"));
echo $dt->format(DateTime::ATOM);          // → 2025-02-13T06:55:25+00:00
```

```text
+07:00
```

Any standard date parser handles this automatically.

**Node.js**

```text
const raw = "2024-09-10T15:53:27.2157019+07:00";
const dt  = new Date(raw);              // Native JS Date (stored as UTC internally)
console.log(dt.toISOString());          // → 2024-09-10T08:53:27.215Z
```

**Python**

```text
from datetime import datetime

raw = "2024-09-10T15:53:27.215700+07:00"
dt  = datetime.fromisoformat(raw)
print(dt.isoformat())   # → 2024-09-10T15:53:27.215700+07:00
```

### 5.3 Unix Epoch Seconds

**Node.js**

```text
const epoch = 1681357409;
const dt    = new Date(epoch * 1000);   // JS uses milliseconds
console.log(dt.toISOString());          // → 2023-04-13T03:43:29.000Z
```

**Python**

```text
from datetime import datetime, timezone

epoch = 1681357409
dt    = datetime.fromtimestamp(epoch, tz=timezone.utc)
print(dt.isoformat())   # → 2023-04-13T03:43:29+00:00
```

**PHP**

```text
$epoch = 1681357409;
$dt    = new DateTime("@{$epoch}");     // Always UTC when using @
echo $dt->format(DateTime::ATOM);       // → 2023-04-13T03:43:29+00:00
```

## 6. Key Rules Summary

```text
+07:00
```

## 7. Frequently Asked Questions

**Q: Does PayWay use UTC or Asia/Phnom\_Penh?**

```text
+07:00
```

```text
expired_at
```

```text
+07:00
```

```text
expired_date
```

```text
1681357409
```

**Q: Should I store PayWay timestamps in UTC in my database?**

> Yes. Always normalize to UTC for storage and internal processing. Convert to Asia/Phnom\_Penh (or your user's local timezone) only at the display/presentation layer.

*For integration support, refer to the official ABA PayWay Developer Suite at [developer.payway.com.kh](https://developer.payway.com.kh).*

---

### User

check this fidnings and update your refrence guide

No matches found. Your search pattern might be excluded completely by either the search.exclude settings or .\*ignore files.  
If you believe that it should have results, you can check into the .*ignore files and the exclude setting (here are some excluded patterns for reference:\[**/node\_modules,**/bower\_components,\*\*/*.code-search\]).  
Then if you want to include those files you can call the tool again by setting "includeIgnoredFiles" to true.

```text
expired_date|created_at|updated_at|datetime|format
```

Read , lines 1765 to 1790

Read , lines 55 to 80

Let me do one final check for any explicit documented statement about this timezone learning.

No matches found. Your search pattern might be excluded completely by either the search.exclude settings or .\*ignore files.  
If you believe that it should have results, you can check into the .*ignore files and the exclude setting (here are some excluded patterns for reference:\[**/node\_modules,**/bower\_components,\*\*/*.code-search\]).  
Then if you want to include those files you can call the tool again by setting "includeIgnoredFiles" to true.

```text
formatRequestTime|UTC
```

# PayWay API Time Format — What We've Learned

## The Core Finding: Requests are UTC, Responses are Phnom Penh (UTC+7)

There's a **timezone asymmetry** in the PayWay API that our sandbox evidence has pinned:

```text
req_time
```

```text
src/utils.ts:12-21
```

```text
transaction_date
```

```text
integration-report-2026-07-18T03-40-15-579Z.md
```

```text
**Date:** 2026-07-18T03:41:24.854Z
```

**03:41 UTC + 7 hours = 10:41** — exact match. The gateway returns Phnom Penh local time, with **no timezone marker** in the string.

## Per-API Breakdown

```text
req_time
```

## Caveats & Known Gaps

```text
transaction-list
```

## TL;DR

```text
YYYYMMDDHHmmss
```

---

### Assistant

Here is the fully updated reference guide incorporating all new findings, live sandbox evidence, and caveats:

# 📘 ABA PayWay API — Datetime & Timezone Reference Guide

```text
developer.payway.com.kh
```

## ⚡ Critical Finding — Timezone Asymmetry

```text
YYYYMMDDHHmmss
```

## 1. Overview

When working with ABA PayWay APIs, you will encounter **four distinct time/date formats** split across requests and responses. Getting this wrong causes broken expiry logic, incorrect reconciliation windows, and failed HMAC signatures.

The single most important rule is:

- Sending time to PayWay?
- Receiving time from PayWay?

## 2. Live Proof of the UTC+7 Response Timezone

This is not an inference — it is confirmed by a live sandbox test run on **2026-07-18**:

```text
2026-07-18T03:41:24.854Z
```

**Conclusion:** PayWay's gateway clock runs in **Asia/Phnom\_Penh (UTC+7)**. Response datetime strings carry no offset marker but are unambiguously UTC+7.

## 3. All Four Time Formats at a Glance

```text
20260718034124
```

## 4. Format-by-Format Details

```text
YYYYMMDDHHmmss
```

**What it looks like:**

```text
"req_time":      "20260718034124"
"request_time":  "20260718034124"
```

**Timezone:** Always **UTC**. This value is part of the **HMAC-SHA512 hash signature** — if it is not UTC, signature verification at the gateway will fail.

**Evidence:**

```text
src/utils.ts:12-21
```

**Where it appears:**

```text
req_time
```

```text
req_time
```

```text
YYYY-MM-DD HH:mm:ss
```

**What it looks like:**

```text
"transaction_date": "2026-07-18 10:41:25"
"created_at":       "2023-04-13 03:43:30"
"updated_at":       "2023-04-13 03:43:30"
```

**Timezone:** **Asia/Phnom\_Penh (UTC+7)** — proven by the 03:41Z → 10:41 sandbox match (§2). **No offset marker is included in the string.**

**Where it appears:**

```text
transaction_date
```

```text
YYYY-MM-DD HH:mm:ss
```

```text
reconcile.cjs
```

```text
YYYY-MM-DDTHH:mm:ss.sssssss+07:00
```

**What it looks like:**

```text
"transaction_date": "2024-09-10T15:53:27.2157019+07:00"
"expired_at":       "2026-06-07T15:47:38.8884292+07:00"
```

**Timezone:** Explicitly **UTC+7 (Asia/Phnom\_Penh)**. This is the only response format where the offset is embedded in the string.

**Where it appears:**

```text
transaction_date
```

> ✅ **This format is fully unambiguous.** Any ISO 8601-compliant parser will handle it correctly.

```text
expired_at
```

```text
"0"
```

**What it looks like:**

```text
"expired_date": 1681357409
"expired_date": "0"
"expire_in":    1627113926
```

**Timezone:** Not applicable — Unix epoch seconds are an **absolute point in time** (seconds elapsed since 1970-01-01 00:00:00 UTC). They carry no timezone bias and are the only fully timezone-safe format in the PayWay API surface.

```text
expired_date
```

**Where it appears:**

```text
expired_date
```

```text
created_at
```

## 5. API-by-API Quick Reference

### 5.1 All API Requests (Universal)

```text
req_time
```

### 5.2 Payment Gateway v1 — Responses

```text
transaction_date
```

### 5.3 Transaction List — Date Filter Request Fields

```text
fromDate
```

```text
fromDate
```

### 5.4 Payment Gateway v2 — Payout

```text
transaction_date
```

### 5.5 Payment Link

```text
req_time
```

### 5.6 KHQR Webhook Callback

```text
transaction_date
```

```text
scripts/mock-callback.cjs:82
```

### 5.7 Credentials on File / Account on File — Token Flows

```text
request_time
```

### 5.8 Whitelist / Beneficiary APIs

```text
created_at
```

### 5.9 APIs with No Timestamp in Response

The following APIs return no datetime fields in their documented response examples:

- Close Transaction
- Exchange Rate
- QR API (response body)
- Pre-Auth Completion

## 6. How to Parse Each Format — Code Examples

```text
req_time
```

**Node.js**

```text
// Mirrors src/utils.ts formatRequestTime()
function formatRequestTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear()        +
    pad(date.getUTCMonth() + 1)  +
    pad(date.getUTCDate())       +
    pad(date.getUTCHours())      +
    pad(date.getUTCMinutes())    +
    pad(date.getUTCSeconds())
  );
}
console.log(formatRequestTime()); // → "20260718034124"
```

**Python**

```text
from datetime import datetime, timezone

def format_request_time():
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

print(format_request_time())  # → "20260718034124"
```

**PHP** *(mirrors ABA's own boilerplate)*

```text
$req_time = (new DateTime("now", new DateTimeZone("UTC")))->format("YmdHis");
echo $req_time; // → "20260718034124"
```

```text
YYYY-MM-DD HH:mm:ss
```

**Node.js (Luxon)**

```text
import { DateTime } from "luxon";

const raw = "2026-07-18 10:41:25";  // from transaction_date

const local = DateTime.fromFormat(raw, "yyyy-MM-dd HH:mm:ss", {
  zone: "Asia/Phnom_Penh",
});

console.log(local.toISO());          // → 2026-07-18T10:41:25.000+07:00
console.log(local.toUTC().toISO()); // → 2026-07-18T03:41:25.000Z  ← matches sandbox UTC time
```

**Python**

```text
from datetime import datetime
from zoneinfo import ZoneInfo

raw = "2026-07-18 10:41:25"
phnom_penh = ZoneInfo("Asia/Phnom_Penh")

local_dt = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=phnom_penh)
utc_dt   = local_dt.astimezone(ZoneInfo("UTC"))

print(local_dt.isoformat())  # → 2026-07-18T10:41:25+07:00
print(utc_dt.isoformat())    # → 2026-07-18T03:41:25+00:00  ← matches sandbox UTC
```

**PHP**

```text
$raw = "2026-07-18 10:41:25";
$dt  = new DateTime($raw, new DateTimeZone("Asia/Phnom_Penh"));

echo $dt->format(DateTime::ATOM);           // → 2026-07-18T10:41:25+07:00
$dt->setTimezone(new DateTimeZone("UTC"));
echo $dt->format(DateTime::ATOM);           // → 2026-07-18T03:41:25+00:00
```

```text
fromDate
```

```text
import { DateTime } from "luxon";

// Always build the window in Phnom Penh time — NOT machine local time
const now    = DateTime.now().setZone("Asia/Phnom_Penh");
const from   = now.startOf("day").toFormat("yyyy-MM-dd HH:mm:ss"); // "2026-07-18 00:00:00"
const to     = now.endOf("day").toFormat("yyyy-MM-dd HH:mm:ss");   // "2026-07-18 23:59:59"

// ✅ Safe regardless of what timezone your server runs in
```

### 6.4 Parsing ISO 8601 with Offset

```text
// Native JS — offset is embedded, no extra library needed
const raw = "2024-09-10T15:53:27.2157019+07:00";
const dt  = new Date(raw);
console.log(dt.toISOString());  // → 2024-09-10T08:53:27.215Z
```

```text
from datetime import datetime

raw = "2024-09-10T15:53:27.215700+07:00"
dt  = datetime.fromisoformat(raw)
print(dt.isoformat())  # → 2024-09-10T15:53:27.215700+07:00
```

### 6.5 Parsing Unix Epoch Seconds

```text
const epoch = 1681357409;
if (epoch && epoch !== "0") {
  const dt = new Date(epoch * 1000);  // JS uses milliseconds
  console.log(dt.toISOString());      // → 2023-04-13T03:43:29.000Z
}
```

```text
from datetime import datetime, timezone

epoch = 1681357409
if epoch:
    dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
    print(dt.isoformat())  # → 2023-04-13T03:43:29+00:00
```

```text
$epoch = 1681357409;
if ($epoch) {
    $dt = new DateTime("@{$epoch}");  // Always UTC with @
    echo $dt->format(DateTime::ATOM); // → 2023-04-13T03:43:29+00:00
}
```

## 7. Open Questions & Known Gaps

The following items remain unresolved and should be directed to ABA PayWay support:

```text
expired_at
```

```text
docs/09-link-unlink-renew-lifecycle.md:287
```

## 8. Known Mock vs. Production Inconsistency

```text
mock-callback.cjs
```

```text
mock-callback.cjs:82
```

**Impact:** Any reconciliation, webhook validation, or time-comparison logic tested exclusively against the mock will exhibit a **7-hour offset** in production. Do not use the mock for timezone-sensitive integration testing.

## 9. Key Rules Summary

```text
getUTCFullYear()
```

## 10. Frequently Asked Questions

**Q: Does PayWay use UTC or Asia/Phnom\_Penh?**

```text
req_time
```

```text
+07:00
```

> The gateway emits naive local-time strings without an offset marker. This is a documentation and API design gap. The timezone is confirmed via live sandbox evidence, not documentation.

```text
fromDate
```

```text
pytz
```

```text
expired_at
```

> Treat all instances as UTC+7. The Renew Token callback is the definitive example — the offset is missing from the other callback doc examples, but the underlying timezone is the same.

```text
expired_date
```

```text
1681357409
```

**Q: Can I trust the mock callback for timezone testing?**

```text
transaction_date
```

**Q: Should I store PayWay timestamps in UTC in my database?**

> Yes. Always normalise to UTC for storage and internal processing. Convert to Asia/Phnom\_Penh only at the display or filter construction layer.

*For integration support, refer to the official ABA PayWay Developer Suite at [developer.payway.com.kh](https://developer.payway.com.kh).* *Report open questions (§7) directly to ABA PayWay technical support with reference to your sandbox Merchant ID.*