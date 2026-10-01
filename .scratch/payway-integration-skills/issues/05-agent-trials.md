# 05 — Agent effectiveness trials

Type: task
Status: claimed
Blocked by: 04

## Acceptance

Fresh Codex and Claude synthetic merchant trials: six routes, existing application adaptation, ambiguous attempt recovery, error diagnosis and enablement blocker. Record actual versions, prompts, outputs, interventions and limits.

## Current evidence

Codex CLI 0.154.0 has passed two independently prepared consumer trials and additional rejection checks. Full prompts/harness are reproducible in prepare-trials.mjs; outputs and review are recorded in AGENT-TRIALS.md. Runtime model identification and final-candidate follow-up are recorded there as completed.

Claude Code 2.1.284 initially used an unreachable localhost proxy. At the user's request, a retry excluded saved user customizations and reached regular Claude, but returned invalid OAuth access token (401). No credential/configuration edits were made. The user then explicitly said "skip claude for now". Claude behavioral validation is deferred, not passed; this acceptance issue stays open.
