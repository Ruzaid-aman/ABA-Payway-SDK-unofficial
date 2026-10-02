# 11 — Help users use the integration skill

Type: task
Status: resolved

## Acceptance

The skill recognizes requests for its own usage help; explains installation/discovery, flow selection, available task types, useful non-secret context, expected results and recovery prompts. Guidance-only requests do not turn into implementation or gateway operations. Reuse the existing curated agent-integration guide without adding a new topic or dependency. Validate standalone distribution and a fresh guidance-only agent trial.

## Answer

Added a concise usage-help route and starter prompt to skill 1.1.1. The existing agent-integration guide now explains discovery/invocation, seven task choices, useful non-secret project context, expected evidence and continuation/recovery prompts. Guidance-only questions stay explanatory; implementation requests retain their authorized scope. Generated local references, provenance and recursive mirrors remain standalone, with 35 skills, 42 topics and nine assets.

Fresh validation: UTF-8 frontmatter validation; 15 knowledge/distribution tests; package navigation/boundary, public docs, repository and packed-consumer smoke pass. The exact extracted archive has zero Gitleaks findings. A fresh packed-folder Codex trial compares the three core routes and provides a suitable next prompt with no interventions, file changes or gateway calls. See the usage follow-up in ENHANCEMENTS-2026-10-02.md and AGENT-TRIALS.md. Existing payment behavior evidence and external release gates retain their stated limits.

## Comments

2026-10-02: User asked whether the integration skill can also teach how to use itself. Existing payment/runtime contracts and release gates stay within their previous scope.

2026-10-02: Fresh guidance-only trial and independent package checks completed. Claude remains explicitly deferred by the user. No new ABA contract question arose from this usage guidance.
