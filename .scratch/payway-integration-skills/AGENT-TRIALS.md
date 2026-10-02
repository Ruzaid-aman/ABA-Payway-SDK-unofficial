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

## Enhancement and second-pass trials — 2026-10-02

Fresh independent packed consumers used the installed 1.1.0 skill, existing synthetic merchant orders/session and injected providers. No checkout imports, gateway calls, actual credentials or Claude run. CLI 0.154.0, Node 24.21.0; runtime metadata confirms default model gpt-6-astra with approval never. No model override or saved user configuration/credential change.

First enhancement fixture: payway-agent-trials-1mHX3a; thread 01a0fa94-daed-7360-afc2-bd3036d0844a. Six Express/Next QR/hosted/link cases, restart and ambiguous-create recovery passed, plus three extra security cases. Diagnostic review found a stale code-104 example; public corpus now matches current CLI endpoint/profile enablement wording.

Second-pass fixture: payway-agent-trials-PHyp9B; thread 01a0fab6-dc77-71d1-ae96-64aa386c69f5. Reproducible prompt/harness: prepare-trials.mjs --codex-only. Core harness was unchanged: SHA-256 46c0048c788c3cd77c5a2c731c1369a1680679e8f916dcdbf83ed31c62b1fff9. It checks six routes/frameworks and recovery. The agent added 42 cases across replay, signed/unsigned identity, durable failure, local reads, concurrent lookup, restart and paid/review versus late success/timeout/configuration failure.

The first harness execution failed because DIAGNOSIS.md had not yet been written; the agent completed that deliverable and reran successfully. Evaluator inspection found the adapter had redefined fulfillmentQueued as durable job existence. One explicit follow-up required the documented per-call insertion meaning; the agent corrected its code/checks and used store.jobs() for durable existence. This is a pass with intervention, not a zero-intervention effectiveness claim.

Two useful trial findings were propagated upstream: rejectLocal must retain inquiry if it did not transition a creating attempt; joined concurrent calls must return fulfillmentQueued=false. The first was reproduced with a failing canonical regression before repair. Final canonical service matches the corrected trial service; SQLite retains the same recovery guard, while the merchant trial deliberately makes initial seeding restart-safe. Both preserve the immutable obligation/history and one outbox job.

Evaluator rerun of TypeScript build, unchanged six-case/recovery harness and all 42 extra cases passed. Diagnostics correctly distinguish callback hints, verified receipt/job creation, completed delivery and settlement; 104 enablement and Wrong Hash use endpoint-specific dated sources; missing link-ID recovery escalates rather than creates again. Sandbox/production/finance gates remain unrun/blocked.

Final canonical candidate/archive identity and fresh repository/package/runtime checks are in ENHANCEMENTS-2026-10-02.md. Raw outputs, generated source and transcripts are retained in the ignored trials/codex-second-pass/ directory. Final Next build/HTTP evidence is recorded separately; this synthetic agent trial alone does not prove deployed Next or physical-device behavior. Claude stays user-deferred and the two-agent release gate stays open.

## Usage-only help trial — 2026-10-02

Candidate skill 1.1.1 was physically copied as a complete standalone folder from a fresh extracted package into a separate synthetic merchant directory. No SDK dependencies, private checkout imports, actual credentials or provider calls were needed. prepare-usage-trial.mjs retains the prompt and before-file manifest outside that directory and checks unchanged files afterward. Exact archive identity and fresh distribution checks are in ENHANCEMENTS-2026-10-02.md.

Prompt: Use aba-payway-integration. Explain how I should use this skill for the synthetic Express invoicing project described in merchant-context.txt. Compare QR, hosted checkout and payment links, list the information I need and give the next prompt. This is guidance only: do not change files, install dependencies, configure credentials or contact PayWay.

Codex CLI 0.154.0; session metadata confirms default gpt-6-astra, approval never, danger-full-access. User configuration was excluded; no model override or credentials/settings edits. Thread: 01a0fb08-ab9a-7e71-a906-7834d0cc6825. Fixture: payway-skill-usage-Z96K0Q. Result/transcript/prompt/identity/before manifest remain under the temporary fixture root, outside the package and merchant directory.

PASS without intervention: explained skill invocation and available tasks; compared all three core routes; identified architecture, invoice/access and merchant prerequisites without requesting secrets; distinguished a merchant invoice URL from direct PayWay links; recommended a suitable planning prompt; kept advanced enablement/live/production/settlement evidence unconfirmed. Transcript review shows three local read-only command executions and no other tool operations. After-run manifest matches every merchant/skill file, including absence of new files. Agent outputs are evaluator-directed files outside the merchant directory.

This pass establishes bounded guidance behavior. It does not replace integration/runtime trials or the required user-deferred Claude trial. No actual gateway call, file change, dependency installation, credential provisioning, money movement or publication occurred in the agent trial.
