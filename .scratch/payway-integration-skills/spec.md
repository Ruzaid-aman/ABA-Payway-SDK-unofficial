# Publishable merchant integration skill

Status: implementation candidate complete; publication gates open
Branch: codex/payway-integration-skills
Base: 1b491f96ce61fc7f7b037b3128c24e46335afbcc (reviewed local main)

Implement the approved plan: portable aba-payway-integration, TS/JS first, Express and Next.js recipes, all documented workflow routing with evidence/enablement limits, Codex and Claude forward trials, five-target installation. Retain the existing 34 skill names and public SDK/MCP contracts.

Acceptance: standalone skill resources have no required private/sibling dependencies; all routes protect order ownership/server prices, save attempts before submission, reject unverified fulfillment, durably queue callback hints and fulfillment jobs, and recover without create replay. Documented advanced flows can ship with explicit external blockers.

Public sources and assets are generated through sync:knowledge with source/output hashes. Keep benchmark reports, trial transcripts, audit evidence and publication decisions private. Main checkout's pre-existing changes are excluded.

Execution order: 01 inventory → 02 entrypoint/corpus → 03 recipes → 04 distribution → 05 forward trials → 06 candidate gates. Existing whole-project publishing audit remains authoritative for publication dependencies. No push, tag, publication, history rewrite or live payment operation is authorized here.
