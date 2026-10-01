# Integration skill implementation map

## Decisions so far

- [01 inventory](issues/01-inventory.md): isolated branch, benchmark comparison and complete capability matrix.
- [02 entrypoint](issues/02-entrypoint.md): standalone references/assets generated from the public corpus.
- [03 recipes](issues/03-recipes.md): durable acceptance and recoverable attempts; real Next build/HTTP proof.
- [04 distribution](issues/04-distribution.md): all five installer targets and independent packed assets.
- [05 agent trials](issues/05-agent-trials.md): Codex behavior passes; Claude explicitly deferred.
- [06 publication](issues/06-publication-gates.md): candidate checks pass locally; inherited owner/runtime gates remain open.

## Fog / next work

Resume Claude after regular authentication is restored, run the same fresh fixture, then address the existing publication audit dependencies on the curated release candidate. Do not publish the private development checkout or move tags.
