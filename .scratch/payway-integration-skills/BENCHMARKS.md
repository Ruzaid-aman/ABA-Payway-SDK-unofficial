# Benchmark findings — reviewed 2026-10-01

These sources informed structure, not PayWay's cryptography or payment contracts.

| Source | Adopt | Avoid transferring |
|---|---|---|
| https://github.com/pradeepsiddappa/razorpay-integration | Compact router, conditional references, gotchas/recovery, community identity | Paise, raw-body SHA256 signatures, retryable refunds, India-specific KYC/tax |
| https://docs.cloudbase.net/en/mp-skill/recipe-5-payment | Executable assets, server configuration, validation, complete result journey | Mini Program deployment/runtime conventions, WeChat amount units and callback crypto |
| https://github.com/ant-intl/antom-ai-tools | Product/stack routing, real SDK symbol confirmation, one source of truth across providers | Provider-specific signing and mandatory complete request/response logs |
| https://docs.antom.com/ac/ref/skill | Install → requirements → sandbox → go-live, selective product guidance | Asking for private keys in chat, unsupported SDK symbol assumptions |
| https://docs.alipayplus.com/alipayplus/integration-skill-acq | Role/prerequisite clarity and verification limits | Acquirer/ACQP role as a merchant prerequisite |
| https://docs.stripe.com/skills | Discoverability, updates, portable guidance; separate optional MCP | Auto-update/plugin capabilities the PayWay installer does not provide |
| https://docs.stripe.com/agents | Guidance/tools distinction and machine-readable navigation | Agentic commerce/paying others as an implied integration task |

Review method: public docs and reachable skill/README sources; no benchmark installation or execution. Stripe catalog/docs were readable; direct individual skill endpoints and the Alipay+ ClawHub artifact were not accessible through the browsing tool. No claim of complete source audit for those artifacts.
