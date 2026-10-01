# Agent effectiveness evidence — 2026-10-01

## Fixture and scope

`prepare-trials.mjs` packs the candidate, installs it into an independent temporary consumer, and copies the installed skill plus dependencies physically into a synthetic merchant project. It never imports the private checkout. The project already supplies server orders/prices and a demonstration session resolver; agents implement merchant.ts and DIAGNOSIS.md without editing acceptance.mjs or dependencies.

The unchanged harness compiles TypeScript, runs actual Express HTTP and standard Next Request/Response handlers for QR/hosted/link, checks ownership/server pricing, pending versus approved inquiry, callback acceptance, one fulfillment, restart durability and lost-response recovery without another create. A separate real Next production build/HTTP test verifies the documented bundler adaptation. All providers/credentials are synthetic. This evidence does not establish a paid PayWay cycle or a production database adaptation.

## Codex

- CLI: 0.154.0. Final-candidate follow-up model: **gpt-6-astra**, provider openai, independently read from that trial's local runtime metadata; reasoning setting unspecified. No model override was requested or applied.
- Initial configured-model attempt failed before work: the saved gpt-6.1-sol model was unsupported by CLI account access. A retry with user configuration excluded hit the local workspace-write execution policy and produced no implementation. These runs are not passes.
- Successful runs excluded user configuration and used the same local full-access execution profile as this task, with TASK.md explicitly restricting writes to the synthetic directory and forbidding real gateway/credential access. Dependencies were not changed.
- Two fresh fixtures completed all six route/framework cases plus unknown-outcome recovery. Agents also checked invalid signatures, PRE-AUTH/refund, wrong identity/amount/currency and extra artifact fields. Both compiled and passed the unchanged harness without implementation fixes supplied by the evaluator.
- Agent improvements: durable inquiry on reservation, filtered artifacts, and restart-safe demo seeding. Reservation queueing and artifact filtering were carried into canonical recipes. Production seeding remains an application responsibility.
- Final follow-up read regenerated candidate resources and reran the unchanged harness successfully. Runtime thread metadata: `01a0f7d6-b71c-77e3-a871-33b259695076`. Earlier ephemeral runs did not persist model metadata; the explicit model observation above applies to this final run.

Diagnostic review: code 104 is correctly treated as endpoint/profile enablement with dated blocker evidence; Wrong Hash uses existing SDK endpoint-specific signing, not another provider's algorithm. Ambiguous creates retain their original attempt and query it, with missing-link-ID recovery explicitly requiring merchant records/ABA. The report distinguishes simulated provider recovery from real PayWay capability and identifies missing scheduled workers, shared production DB, operational controls and paid sandbox validation.

Raw transcripts are retained locally under ignored trials files; generated changes and diagnosis are saved under trials/codex. Prompts and harness are reproducible from the preparation script. Temporary fresh fixture roots were payway-agent-trials-Gw87G9 and payway-agent-trials-ffkPOR; they are not publication inputs.

## Claude — deferred by user

Claude Code 2.1.284 was attempted against the candidate. Saved user settings selected `big-pickle` through a localhost proxy that refused connections. The user asked to use regular Claude. Retrying with only project/local setting sources, safe mode and no configured MCP servers reached regular Claude but returned **401: OAuth access token is invalid**, before any model generation or code changes. Saved settings/credentials were not edited.

The user then explicitly instructed **"skip claude for now"**. No Claude model/version or behavior success is claimed. Issue 05 remains open. When resumed, restore authentication in the user's own session, prepare a fresh fixture, run the same unchanged harness and review diagnostics/artifacts for all required scenarios. The two-agent publication gate is not satisfied by the Codex or runtime tests.
