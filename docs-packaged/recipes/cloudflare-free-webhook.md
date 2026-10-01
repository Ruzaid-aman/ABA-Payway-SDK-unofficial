# Capture ABA PayWay Callbacks with Cloudflare Workers and D1

> You want a future-proof callback archive, not a payment-processing endpoint. This design stores every incoming PayWay callback body without parsing, validating, normalizing, or depending on specific PayWay fields, while also preserving request metadata.

> **Important security boundary:** This endpoint is suitable for capturing and archiving callbacks. Never mark an order as paid, release goods, or update a financial balance based only on an unvalidated callback. Payment processing should separately verify the transaction using ABA PayWay’s supported verification mechanism or transaction-status API.

---

## 1. What we are building

```text
ABA PayWay Sandbox
        |
        | HTTPS POST callback
        v
Cloudflare Worker
        |
        | Store raw body without parsing
        v
Cloudflare D1
```

The solution will:

- Provide a stable HTTPS callback URL.
- Accept callback POST requests.
- Read the request body as raw text.
- Store the body without calling `request.json()`.
- Preserve new or unexpected PayWay fields automatically.
- Store headers, query parameters, method, and timestamps separately.
- Return HTTP 200 only after D1 successfully saves the request.
- Provide a protected administrative endpoint for retrieving records.

Cloudflare supports deploying Workers to a `workers.dev` address, and D1 databases can be connected to Workers through environment bindings such as `env.DB`.

---

## 2. Important terminology

### Callback request versus callback response

ABA PayWay sends an HTTP request to your Worker. That incoming request may contain a body, headers, and URL query parameters.

Your Worker then sends a small HTTP response back to PayWay.

In this guide:

- **Incoming callback:** Data sent by PayWay.
- **Raw body:** The complete textual request body sent by PayWay.
- **Acknowledgement response:** The HTTP 200 response returned to PayWay.

When this guide says “save the full response from PayWay,” technically we are saving the full incoming callback request.

---

## 3. Why the callback is stored as raw text

Do not use this:

```js
const payload = await request.json();
```

That would require the body to be valid JSON and would parse it into a JavaScript object.

Instead, use:

```js
const rawBody = await request.text();
```

Then save `rawBody` directly into a D1 `TEXT` column.

This means the Worker does not:

- check whether the body is valid JSON;
- require `tran_id`, `status`, `amount` or other fields;
- rename fields;
- remove unknown fields;
- convert numbers;
- rebuild the JSON with `JSON.stringify`;
- reject a callback because its structure changed.

If PayWay adds fields in the future, the new fields remain inside `raw_body` without requiring a schema migration.

The body is stored as received text. If byte-for-byte binary preservation is required, use an `ArrayBuffer` and binary storage such as R2. For normal UTF-8 JSON callbacks, raw text is the practical approach.

---

## 4. Create the Cloudflare account

1. Open the Cloudflare dashboard: `https://dash.cloudflare.com/sign-up`
2. Create a free account.
3. Open the verification message sent to your email.
4. Verify your email address.
5. Sign in to the Cloudflare dashboard.

Cloudflare’s official Workers and D1 getting-started guides list a Cloudflare account as a prerequisite.

---

## 5. Create a PayWay Sandbox account

1. Open the ABA PayWay Sandbox: `https://sandbox.payway.com.kh/`
2. Select **Register Now** if you do not already have an account.
3. Complete the sandbox registration.
4. Obtain the sandbox merchant credentials and integration information provided by PayWay.

ABA PayWay’s developer overview recommends creating a sandbox account, using sandbox API keys during integration, testing the payment flow, and replacing sandbox credentials with production credentials only when going live.

---

## 6. Create the D1 database

Cloudflare’s navigation labels can change slightly, but the process is generally:

1. Sign in to the Cloudflare dashboard.
2. Open **Workers & Pages**.
3. Find **D1 SQL Database** or **Storage & Databases → D1**.
4. Select **Create database**.
5. Enter this database name: `aba-payway-callbacks`
6. Select **Create**.

D1 is Cloudflare’s serverless SQL database and can be created and connected to a Worker through either the dashboard or Wrangler CLI.

---

## 7. Create the database table

Open the newly created database and select its Console.

Run the following SQL:

```sql
CREATE TABLE IF NOT EXISTS payway_callback_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    request_id TEXT NOT NULL UNIQUE,

    request_method TEXT NOT NULL,
    request_url TEXT NOT NULL,
    request_path TEXT NOT NULL,
    query_string TEXT,

    content_type TEXT,
    user_agent TEXT,
    source_ip TEXT,

    headers_json TEXT NOT NULL,
    raw_body TEXT NOT NULL,

    body_size_bytes INTEGER NOT NULL,

    received_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payway_callbacks_received_at
ON payway_callback_requests(received_at);

CREATE INDEX IF NOT EXISTS idx_payway_callbacks_request_id
ON payway_callback_requests(request_id);
```

### Why there are no payment-specific columns

The table intentionally does not contain columns such as:

- `transaction_id`
- `payment_status`
- `amount`
- `currency`
- `customer_id`

Adding those columns would couple the storage layer to the current PayWay callback structure.

Instead, the full callback is stored in:

- `raw_body`

Request headers are stored in:

- `headers_json`

The database can therefore archive callbacks even if PayWay:

- adds a field;
- removes a field;
- changes field ordering;
- sends an empty body;
- sends malformed JSON;
- changes the callback’s JSON structure;
- temporarily sends another text format.

---

## 8. Create the Cloudflare Worker

1. Return to **Workers & Pages**.
2. Select **Create**.
3. Choose **Worker**.
4. Name it: `aba-payway-callback-receiver`
5. Select **Deploy** or **Create**.
6. Open the newly created Worker.
7. Select **Edit code**.

Cloudflare’s official getting-started documentation also supports creating and deploying Workers using Wrangler, but the dashboard method is easier for a first deployment.

---

## 9. Bind the D1 database to the Worker

The Worker needs a D1 binding so that the code can access the database as `env.DB`.

1. Open the Worker.
2. Select **Settings**.
3. Find **Bindings**.
4. Select **Add binding**.
5. Choose **D1 database**.
6. Set the variable or binding name to: `DB`
7. Select the database: `aba-payway-callbacks`
8. Save the binding.

Cloudflare documents that a binding named `DB` is accessed in Worker code through `env.DB`.

---

## 10. Create an unpredictable callback path

The endpoint will not validate callback contents or signatures. However, it should not accept requests on every path.

Generate a long random value locally:

```bash
openssl rand -hex 24
```

Example result:

```text
8f21d67bcd75c260756e8cdccbbcd79da24ca89d132f914e
```

Your callback path would become:

```text
/payway/callback/8f21d67bcd75c260756e8cdccbbcd79da24ca89d132f914e
```

This is not content validation. It merely gives the callback endpoint an unpredictable URL.

Do not reuse the example value above. Generate your own value.

---

## 11. Create an administrative access token

The Worker will also expose an endpoint for developers to retrieve saved callback records.

Generate another independent random value:

```bash
openssl rand -hex 32
```

Do not use the same value for the callback path and administrative token.

In the Cloudflare Worker:

1. Open **Settings**.
2. Find **Variables and Secrets**.
3. Add a secret named: `ADMIN_TOKEN`
4. Paste the generated administrative token as its value.
5. Save it.

Do not:

- put this token in frontend JavaScript;
- commit it to Git;
- send it to PayWay;
- include it in screenshots;
- share it in public tickets.

---

## 12. Add the Worker code

Replace the default Worker code with the following.

Change `CALLBACK_PATH` to the unpredictable callback path you generated.

```js
const CALLBACK_PATH =
  "/payway/callback/REPLACE_WITH_YOUR_RANDOM_PATH";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * Public health check.
     *
     * This endpoint does not expose database records.
     */
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(
        {
          service: "aba-payway-callback-receiver",
          status: "running",
          timestamp: new Date().toISOString()
        },
        200
      );
    }

    /*
     * Protected administrative endpoint.
     *
     * This is separate from the PayWay callback endpoint.
     */
    if (request.method === "GET" && url.pathname === "/admin/callbacks") {
      return listCallbacks(request, env, url);
    }

    /*
     * Reject requests sent to unrelated paths.
     *
     * This does not inspect or validate callback content.
     */
    if (url.pathname !== CALLBACK_PATH) {
      return jsonResponse(
        {
          success: false,
          message: "Not found"
        },
        404
      );
    }

    /*
     * The callback endpoint accepts POST requests.
     */
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "POST"
        }
      });
    }

    /*
     * Save the callback without parsing or validating its body.
     */
    return saveCallback(request, env, url);
  }
};

async function saveCallback(request, env, url) {
  /*
   * Read the incoming body as text.
   *
   * Deliberately do not call:
   *   request.json()
   *   JSON.parse()
   *
   * The body is stored even when it is not valid JSON.
   */
  const rawBody = await request.text();

  /*
   * Copy request headers into a plain object.
   *
   * We serialize our own metadata object, but the incoming request
   * body itself is not parsed or re-serialized.
   */
  const headers = {};

  for (const [name, value] of request.headers.entries()) {
    headers[name] = value;
  }

  const requestId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();

  /*
   * TextEncoder calculates the UTF-8 byte size of the stored body.
   */
  const bodySizeBytes = new TextEncoder()
    .encode(rawBody)
    .byteLength;

  try {
    await env.DB
      .prepare(`
        INSERT INTO payway_callback_requests (
          request_id,
          request_method,
          request_url,
          request_path,
          query_string,
          content_type,
          user_agent,
          source_ip,
          headers_json,
          raw_body,
          body_size_bytes,
          received_at
        )
        VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6,
          ?7, ?8, ?9, ?10, ?11, ?12
        )
      `)
      .bind(
        requestId,
        request.method,
        url.toString(),
        url.pathname,
        url.search,
        request.headers.get("content-type"),
        request.headers.get("user-agent"),
        request.headers.get("cf-connecting-ip"),
        JSON.stringify(headers),
        rawBody,
        bodySizeBytes,
        receivedAt
      )
      .run();

    /*
     * Acknowledge the callback only after the insert succeeds.
     */
    return jsonResponse(
      {
        success: true,
        request_id: requestId,
        received_at: receivedAt
      },
      200
    );
  } catch (error) {
    /*
     * Log only the database error.
     * Avoid printing the raw payment callback into application logs.
     */
    console.error("Failed to save PayWay callback", {
      requestId,
      errorName: error?.name,
      errorMessage: error?.message
    });

    /*
     * Do not return HTTP 200 when storage fails.
     * A non-success response allows the sender to treat delivery
     * as unsuccessful, depending on its retry policy.
     */
    return jsonResponse(
      {
        success: false,
        request_id: requestId,
        message: "Callback could not be stored"
      },
      500
    );
  }
}

async function listCallbacks(request, env, url) {
  const authorization = request.headers.get("authorization");
  const expectedAuthorization = `Bearer ${env.ADMIN_TOKEN}`;

  if (
    !env.ADMIN_TOKEN ||
    authorization !== expectedAuthorization
  ) {
    return jsonResponse(
      {
        success: false,
        message: "Unauthorized"
      },
      401
    );
  }

  /*
   * Pagination is only for the administrative listing endpoint.
   */
  const requestedLimit = Number(url.searchParams.get("limit") || "20");
  const requestedOffset = Number(url.searchParams.get("offset") || "0");

  const limit =
    Number.isInteger(requestedLimit) &&
    requestedLimit >= 1 &&
    requestedLimit <= 100
      ? requestedLimit
      : 20;

  const offset =
    Number.isInteger(requestedOffset) &&
    requestedOffset >= 0
      ? requestedOffset
      : 0;

  const result = await env.DB
    .prepare(`
      SELECT
        id,
        request_id,
        request_method,
        request_url,
        request_path,
        query_string,
        content_type,
        user_agent,
        source_ip,
        headers_json,
        raw_body,
        body_size_bytes,
        received_at,
        created_at
      FROM payway_callback_requests
      ORDER BY id DESC
      LIMIT ?1 OFFSET ?2
    `)
    .bind(limit, offset)
    .all();

  return jsonResponse(
    {
      success: true,
      limit,
      offset,
      records: result.results
    },
    200
  );
}

function jsonResponse(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
```

The database insert uses a D1 prepared statement and bound parameters. Cloudflare recommends prepared statements and documents numbered placeholders such as `?1`, `?2`, and the `.bind()` method.

---

## 13. Deploy the Worker

- Double-check that `CALLBACK_PATH` contains your generated random path.
- Select **Save and deploy**.
- Copy the assigned Worker URL.

It will look similar to:

`https://aba-payway-callback-receiver.your-subdomain.workers.dev`

The complete PayWay callback URL will be:

`https://aba-payway-callback-receiver.your-subdomain.workers.dev/payway/callback/YOUR_RANDOM_PATH`

Cloudflare Workers can be deployed to a `workers.dev` subdomain using the dashboard or `wrangler deploy`.

---

## 14. Test the health endpoint

Open this URL in a browser:

`https://aba-payway-callback-receiver.your-subdomain.workers.dev/health`

Expected response:

```json
{
  "service": "aba-payway-callback-receiver",
  "status": "running",
  "timestamp": "2026-07-17T04:53:00.000Z"
}
```

The timestamp will be different each time.

This confirms the Worker is deployed. It does not confirm that D1 inserts are working.

---

## 15. Test a normal JSON callback

Replace the URL with your actual Worker URL and callback path:

```bash
curl --request POST \
  "https://aba-payway-callback-receiver.your-subdomain.workers.dev/payway/callback/YOUR_RANDOM_PATH?environment=sandbox" \
  --header "Content-Type: application/json" \
  --header "X-Test-Source: developer-curl" \
  --data-raw '{
    "tran_id": "SANDBOX-10001",
    "status": "APPROVED",
    "amount": 10.50,
    "currency": "USD",
    "future_field": {
      "added_later": true
    }
  }'
```

Expected response:

```json
{
  "success": true,
  "request_id": "generated-uuid",
  "received_at": "generated-timestamp"
}
```

The complete body, including `future_field`, should be stored in `raw_body`.

---

## 16. Prove that the body is not being validated

Send deliberately invalid JSON:

```bash
curl --request POST \
  "https://aba-payway-callback-receiver.your-subdomain.workers.dev/payway/callback/YOUR_RANDOM_PATH" \
  --header "Content-Type: application/json" \
  --data-raw '{"tran_id":"TEST-INVALID","status":'
```

Even though this is invalid JSON, the expected response is still:

```json
{
  "success": true,
  "request_id": "generated-uuid",
  "received_at": "generated-timestamp"
}
```

This proves the Worker is not using `JSON.parse()` or `request.json()` before saving.

---

## 17. Prove that unknown future fields are preserved

Send a callback containing fields the application does not know about:

```bash
curl --request POST \
  "https://aba-payway-callback-receiver.your-subdomain.workers.dev/payway/callback/YOUR_RANDOM_PATH" \
  --header "Content-Type: application/json" \
  --data-raw '{
    "tran_id": "FUTURE-10001",
    "new_payway_field": "new-value",
    "new_nested_structure": {
      "version": 7,
      "items": [
        {
          "code": "ABC",
          "enabled": true
        }
      ]
    }
  }'
```

No Worker or database change should be necessary. The entire body is stored in `raw_body`.

---

## 18. Verify data in the D1 console

Open:

`Cloudflare Dashboard → Storage & Databases → D1 → aba-payway-callbacks → Console`

Run:

```sql
SELECT
    id,
    request_id,
    content_type,
    body_size_bytes,
    received_at,
    raw_body
FROM payway_callback_requests
ORDER BY id DESC
LIMIT 20;
```

To inspect only the most recently saved request:

```sql
SELECT *
FROM payway_callback_requests
ORDER BY id DESC
LIMIT 1;
```

To count all captured callbacks:

```sql
SELECT COUNT(*) AS callback_count
FROM payway_callback_requests;
```

---

## 19. Retrieve callbacks through the protected API

Use the administrative token created earlier:

```bash
curl \
  "https://aba-payway-callback-receiver.your-subdomain.workers.dev/admin/callbacks?limit=20&offset=0" \
  --header "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Expected structure:

```json
{
  "success": true,
  "limit": 20,
  "offset": 0,
  "records": [
    {
      "id": 3,
      "request_id": "f78dcaf9-4c16-40b3-b0ca-b75e2ca81525",
      "request_method": "POST",
      "request_url": "https://example.workers.dev/payway/callback/secret",
      "request_path": "/payway/callback/secret",
      "query_string": "",
      "content_type": "application/json",
      "user_agent": "curl/8.0.0",
      "source_ip": "203.0.113.10",
      "headers_json": "{\"content-type\":\"application/json\"}",
      "raw_body": "{\"tran_id\":\"FUTURE-10001\"}",
      "body_size_bytes": 31,
      "received_at": "2026-07-17T04:53:00.000Z",
      "created_at": "2026-07-17 04:53:00"
    }
  ]
}
```

Do not create a public `/admin/callbacks` endpoint without authentication. Callback data could contain transaction information or customer-related data.

---

## 20. Configure ABA PayWay Sandbox

In the PayWay Sandbox integration settings, use the complete Worker callback URL:

`https://aba-payway-callback-receiver.your-subdomain.workers.dev/payway/callback/YOUR_RANDOM_PATH`

The exact field name can depend on the PayWay integration flow. It may be presented as a callback URL or return-related configuration. Follow the applicable ABA PayWay integration documentation for your payment product.

After configuring it:

- Create a sandbox transaction.
- Complete the sandbox payment flow.
- Check the PayWay sandbox transaction list.
- Check the D1 table.
- Confirm that a new row was inserted.
- Compare `raw_body` with the callback PayWay sent.
- Check that duplicate deliveries, if any, appear as separate rows.

---

## 21. Expected behavior

| Scenario | Result |
|---|---|
| Valid JSON body | Save it |
| Invalid JSON body | Save it |
| Empty POST body | Save it |
| Unknown fields | Save them |
| Nested JSON | Save it |
| New PayWay fields | Save them |
| Different Content-Type | Save it |
| Database insertion succeeds | Return HTTP 200 |
| Database insertion fails | Return HTTP 500 |
| Request uses a different path | Return HTTP 404 |
| Request uses GET on callback path | Return HTTP 405 |
| Admin endpoint has no token | Return HTTP 401 |

“No content validation” does not mean the system must accept every HTTP method or every URL. It means the callback body is not inspected or rejected because of its content or structure.

---

## 22. Duplicate callbacks

Payment providers can deliver the same notification more than once. Because this service is intended to archive everything without interpreting the callback, every delivery is saved as a separate row.

That is intentional.

For example:

- Row 101 → first delivery
- Row 102 → retry of the same callback
- Row 103 → another retry

Do not deduplicate inside the raw-capture endpoint unless you have a verified, stable PayWay delivery identifier and a clear business requirement.

A downstream payment-processing service can handle deduplication separately.

---

## 23. Recommended production architecture

Do not combine unvalidated archival with financial processing.

Use two stages:

```text
PayWay callback
      |
      v
Raw capture Worker
      |
      +--> D1 raw callback archive
      |
      v
Separate payment processor
      |
      +--> Validate signature or authenticity
      +--> Check transaction with PayWay
      +--> Confirm amount and currency
      +--> Apply idempotency rules
      +--> Update the order
```

The raw inbox preserves evidence of what was received. The payment processor determines whether the callback is trustworthy and actionable.

---

## 24. Security and operational checklist

Before production use:

- Use an unpredictable callback path.
- Keep the callback path private.
- Protect administrative endpoints with a secret.
- Never expose callback records publicly.
- Do not log the complete callback body unnecessarily.
- Do not store API keys in Worker source code.
- Separate sandbox and production Workers.
- Separate sandbox and production D1 databases.
- Apply an appropriate data-retention policy.
- Review whether callback data contains personal information.
- Restrict Cloudflare account access.
- Enable multi-factor authentication on Cloudflare.
- Never mark a transaction as paid using unvalidated raw data.
- Verify payment status separately before fulfilling an order.
- Monitor D1 usage and storage.
- Test database failure behavior.
- Document who can retrieve or delete callback records.

Suggested separation:

- Sandbox Worker: `aba-payway-callback-sandbox`
- Sandbox database: `aba-payway-callbacks-sandbox`
- Production Worker: `aba-payway-callback-production`
- Production database: `aba-payway-callbacks-production`

Do not send sandbox callbacks into the production database.

---

## 25. Troubleshooting

### Error: `env.DB` is undefined

Check that:

- a D1 binding exists;
- the binding name is exactly `DB`;
- the correct D1 database is selected;
- the binding was saved;
- the Worker was redeployed after adding the binding.

D1 databases are accessed through the binding name configured for the Worker.

### HTTP 404

The URL path does not match `CALLBACK_PATH`.

Compare:

`const CALLBACK_PATH = "/payway/callback/your-random-value";`

with the path in the URL sent by curl or configured in PayWay.

### HTTP 405

The callback endpoint received something other than POST.

### HTTP 500

The Worker could not save the record.

Check:

- Worker logs.
- The D1 binding.
- Whether the table exists.
- Whether the SQL column names match.
- Whether the database or platform has reached a limit.

### HTTP 401 from `/admin/callbacks`

Check:

- `ADMIN_TOKEN` exists as a Worker secret;
- the Worker was redeployed if necessary;
- the header uses Bearer;
- there are no extra spaces or line breaks.

Correct format:

`Authorization: Bearer YOUR_ADMIN_TOKEN`

### Callback does not arrive from PayWay

Check:

- the complete callback URL is configured;
- the URL starts with `https://`;
- the Worker is deployed;
- the callback path is correct;
- the sandbox transaction completed;
- the applicable PayWay integration supports callbacks;
- PayWay received a successful HTTP response.

---

## Final result

After completing this guide, you will have a stable callback endpoint similar to:

`https://aba-payway-callback-receiver.example.workers.dev/payway/callback/random-secret`

Every PayWay callback sent to it will be stored with:

- the untouched textual request body;
- all unknown and future fields;
- request headers;
- URL and query string;
- content type;
- source IP reported by Cloudflare;
- request size;
- receipt timestamp;
- unique archive request ID.

The storage layer remains independent of PayWay’s current JSON schema, which allows the callback format to evolve without requiring changes to the database table or capture logic.
