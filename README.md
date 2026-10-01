# ABA PayWay TypeScript SDK

A community-maintained, typed server-side SDK and CLI for ABA PayWay: online QR, hosted checkout, payment links, transaction management, and optional coding-agent skills.

This is not an official gateway-provider SDK. ABA and PayWay names identify the gateway being integrated; no endorsement is claimed.

Use it to accept payments in your application and verify their outcome before delivering an order. ABA PayWay processes the payment; this project supplies the integration tools.

| You want to… | Use |
|---|---|
| Add payments to your application | The TypeScript/JavaScript **SDK**, running on your server |
| Try payments and inspect transactions from a terminal | The **CLI** included with the SDK package |
| Guide a coding assistant through an integration | Optional **agent skills**, alongside the SDK and CLI |
| Drive the SDK from an AI agent over MCP | The built-in **MCP server** (`payway-sdk mcp`), read-only by default |

You can explore the simulated demo without an ABA account. Gateway testing requires sandbox credentials issued by ABA.

**Runtime:** Node.js 22.12 or later. CI targets the minimum runtime and Node 22/24 on Linux and Windows. Keep merchant credentials on your server.

## Try it locally

This checkout is preparing its first public release. Package metadata remains at `1.5.0`; do not assume that version is available on npm. From the repository root:

```bash
npm ci
npm run build
npm exec -- payway-sdk demo
```

The demo serves a simulated checkout on localhost. It requires no credentials and makes no gateway payments. For a non-interactive check, run `npm exec -- payway-sdk demo --check`.

To install this checkout in another application, run `npm pack`, then install the resulting tarball. After publication, use `npm install aba-payway-ts` and run the installed CLI with `npm exec -- payway-sdk`. Avoid bare `npx payway-sdk`: the CLI binary name is not the SDK package name.

## Create your first sandbox payment

Follow [QUICKSTART.md](QUICKSTART.md): try the demo → obtain sandbox credentials → prepare a callback URL → create and pay → verify → integrate your server. It includes ABA's official registration link and test-payment guidance. The same create, verify, and fulfill-once journey applies to the SDK, CLI, and skills.

The [first-payment reference app](docs-packaged/guides/FIRST-PAYMENT-WALKTHROUGH.md) demonstrates server-side pricing, verification, idempotent fulfillment, and reconciliation. It starts in simulated mode without credentials.

## Integration rules

- Run the SDK on the server. Never expose merchant API keys or COF payment tokens to browser code or an AI provider.
- Creation acceptance is not payment confirmation. Verify the transaction, amount, and currency before fulfilling an order, and fulfill only once.
- Callback verification depends on the payment route. Payment-link pushbacks are unsigned and require a status lookup; online checkout verification does not apply to offline KHQR notifications.
	- Test callback handling locally without the ABA Simulator: `setup-webhook --forward-to <your-app-url>` captures and forwards deliveries, and `webhook trigger --event payment.approved` sends a correctly-signed fixture to your receiver (see [Chapter 16](docs-packaged/guides/16-webhook-setup-guide.md)).
- Expired or closed transactions can still read `PENDING`. Hosted-card sessions may remain payable after close. Enforce local order policy and reconcile late payments.
- Saved CLI profiles contain plaintext credentials. Use protected local storage for development and a secret manager with explicit SDK configuration in deployed services.

## For AI coding agents

- **Skills:** install the portable merchant integration skill with `npm exec -- payway-sdk skills add claude --only aba-payway-integration` (also `codex`, `opencode`, `cursor`, `copilot`) — see [skills/README.md](skills/README.md). Omit --only for all workflow guides.
- **MCP server:** expose the SDK to any MCP host with `npm exec -- payway-sdk mcp` (stdio; 12 read-only tools by default, `--allow-mutations` adds the create tools; preview with `mcp --list-tools`) — see the [reference](docs-packaged/reference/SDK-AND-CLI-REFERENCE.md#mcp-server).
- **Offline knowledge base:** `npm exec -- payway-sdk docs list` / `docs <topic>` / `docs search "<terms>"` serves the curated integration and support topics without network access; the machine-readable index is [llms.txt](llms.txt).

## Explore the SDK

| Task | Guide |
|---|---|
| Set up your first payment | [Quickstart](QUICKSTART.md) |
| Browse commands and SDK examples | [SDK and CLI reference](docs-packaged/reference/SDK-AND-CLI-REFERENCE.md) |
| Choose an integration path | [Documentation index](docs-packaged/README.md) |
| Understand verification limits | `payway-sdk docs support` |
| Install coding-agent guides | [Skills](skills/README.md) |
| Review changes | [Changelog](CHANGELOG.md) |

## Contribute and get support

Start with `payway-sdk docs contributing` (or see the repository `CONTRIBUTING.md`). Most contributions can be tested without gateway credentials.

Report reproducible SDK bugs through the issue tracker once the public repository is available. See `payway-sdk docs support` for support scope and `payway-sdk docs security` for private vulnerability reporting. Never attach credentials, raw callbacks, or customer data to an issue.

Documentation links target the development branch during preparation. Release preparation must pin them to the actual published tag and verify the destination repository.

Licensed under the [MIT license](LICENSE).
