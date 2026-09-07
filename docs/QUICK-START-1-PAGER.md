# First Payment

The [canonical quickstart](../QUICKSTART.md) contains installation, sandbox setup, and the first runnable payment. Start there.

**Create -> show the artifact -> verify -> fulfill once.**

| Result | Next action |
|---|---|
| `created` | Show the QR, signed form, or link; retain the transaction ID. |
| `pending` | Check the existing transaction again. |
| `approved` | Match order ID, amount, and currency; fulfill once atomically. |
| `failed` | Inspect the confirmed rejection before offering a fresh attempt. |
| `unknown` | Look up the existing transaction before creating a replacement. |

Expiry and closure are local policy, not durable gateway statuses. A redirect, timeout, or missing callback is not proof of payment or failure. Payment-link notifications are unsigned and require a server-side lookup.

Use the [documentation index](./README.md) to choose a route, verify payments, or troubleshoot.

## Automation

Use `--output json` for one create result or `--output ndjson` for a stream. Existing gateway statuses and exit codes remain unchanged; command success does not mean payment approval.

## Agentic PayWay CLI

For optional conversational workflows, see the [agent CLI guide](./AGENTIC-PAYWAY-CLI-USER-GUIDE.md) and [skills](../skills/README.md). They are not required for your first payment.
