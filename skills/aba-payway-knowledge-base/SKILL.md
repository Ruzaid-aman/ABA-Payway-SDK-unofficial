---
name: aba-payway-knowledge-base
description: Use when you need PayWay integration guidance offline — the built-in knowledge base of 30 topics (setup, web/QR/COF/payment-link/settlement guides, error-code hints, sandbox-verified lessons) served by `payway-sdk docs list|<topic>|search` and the agent's query_knowledge tool.
metadata:
  version: 1.0.0
---

# PayWay Knowledge Base (offline docs)

The CLI ships a curated 30-topic corpus (~530 KB) generated from the SDK's
documentation: every integration guide, the sandbox learnings, the full
error-code registry, and the machine reference. No network, no credentials.

## Quick Start (CLI)

```sh
payway-sdk docs list                        # all topics with one-line descriptions
payway-sdk docs quickstart                  # first sandbox payment, end to end
payway-sdk docs errors-and-debugging        # every error code + sandbox-verified hints
payway-sdk docs search "lifetime minutes"   # AND-search the whole corpus
payway-sdk docs payment-link --json         # metadata + full content as one JSON doc
```

## Topics worth knowing by name

| Topic | What it settles |
|---|---|
| `quickstart` / `quickstart-1-page` | install → first paid sandbox transaction |
| `setup` | merchant portal, sandbox credentials, ABA Mobile simulator |
| `web-implementation` / `native-apps` / `webviews` | per-platform checkout flows |
| `qr-handling` | online vs offline KHQR, scan-time validity windows |
| `callbacks-webhooks` | single best-effort delivery, HMAC verification, workbench |
| `errors-and-debugging` | every PayWay code with actionable hints |
| `payment-link` | full link lifecycle incl. pushbacks and VOIDED |
| `settlement-disputes` | settlement timing, chargebacks, refund boundaries |
| `sdk-cli-reference` | every SDK method and CLI command |
| `error-codes` | the machine-readable registry (JSON) |

## From the agent

The agent's `query_knowledge` tool (read-only, no approval) reads the same
corpus mid-plan: `query: "search"` with `pattern` keywords, or `query: "read"`
with a `topic` slug. Prefer it over guessing gateway behavior; the planning
prompt already carries the highest-value constraints as its DOMAIN CONSTRAINTS
digest.

## Notes

- The corpus is generated (`npm run sync:knowledge`) and freshness-gated —
  always current with the repository docs at release time.
- Internal audit dossiers (SANDBOX-FINDINGS, ABA question registers) are
  deliberately NOT in the corpus; their distilled facts live in `explain`,
  this skill set, and the digest.

## Error Handling

```sh
payway-sdk docs bogus-topic --json    # → { "error": { kind: "validation", exitCode: 1, … } }, exit 1
payway-sdk docs search                # → validation envelope: at least one term required
```

Ambiguous prefixes (e.g. `docs e` matches several topics) return the list of
matches instead of guessing; unknown topics point to `docs list`. All failures
follow the uniform `{error:{kind,exitCode,…}}` envelope under `--json`.

## Related Skills
- [Agent CLI](../aba-payway-agent/SKILL.md) (query_knowledge tool)
- [SDK Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [First Payment](../aba-payway-first-payment/SKILL.md) (route selection)
