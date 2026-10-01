# Support and compatibility

This is a community-maintained integration SDK, not an official ABA Bank SDK. Gateway access, merchant enablement, settlements, disputes, and production approval remain with ABA PayWay. No bank endorsement or support SLA is implied.

## Runtime and releases

The development checkout requires Node.js 22.12 or later. CI covers the minimum version, Node 22, and Node 24 on Linux and Windows. Newer major versions are not claimed as verified until added to CI. Browser/mobile applications call your backend; they must not import this SDK with merchant credentials.

Package metadata remains at the unpublished 1.5.0 baseline. The raised runtime requirement is a breaking change requiring a new major release. Fixes target the latest public release; historical tags do not imply maintained release branches.

## Feature verification

| Surface | Support and limits |
|---|---|
| Online QR and hosted checkout | SDK, CLI, mocked contracts, and recorded sandbox observations. Merchant-specific production validation is still required. |
| Payment links | Creation/detail and unsigned pushback parsing. Verify through status lookup. Enforce expiry locally; remote status can remain OPEN. |
| Offline KHQR | Requires ABA-issued merchant fields. Generic API credentials cannot substitute. Callbacks use a separate trust model. |
| COF and subscriptions | Typed endpoints and CLI implemented. Subscription completion needs an enabled merchant profile; current evidence does not prove end-to-end registration. |
| Payout and beneficiaries | Require RSA configuration, enablement, and whitelisted accounts. Current sandbox profile limits prevent complete payout validation. |
| Transaction journal | CLI API commands record by default; the SDK library is opt-in. Digest mode is default. Cannot reconstruct unrecorded events or prove non-payment from a missing callback. |
| Agent CLI | Optional provider integration with typed tools and approval gates. Review provider privacy settings; deployed applications should use explicit SDK configuration. |

Creation success is not fulfillment authorization. Verify transaction, amount, and currency and fulfill idempotently. `PENDING` does not prove QR validity; closure may not prevent payment through an existing hosted-card session.

## Asking for help

Use the issue tracker for SDK defects and feature requests once the public repository is available. Include SDK/Node versions, OS, command or API method, expected behavior, and a minimal sanitized reproduction. Prefer the credential-free demo or a mocked response.

Do not attach profile files, `.env`, payment tokens, QR payloads, signed forms, raw journals, customer details, or bank correspondence. CLI profiles contain plaintext credentials; deployed services should use a secret manager and typed SDK configuration.

Security reports belong in [SECURITY.md](SECURITY.md)'s private channel. Community support is best effort; no response time is guaranteed.
