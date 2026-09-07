# Historical secret triage — 2026-09-07

Publication remains blocked. Static triage is complete; provider revocation and
history disposition are not complete. No credential was tested against a provider.

Gitleaks 8.30.1 scanned all 217 local commits at baseline `6ecca2b`:
56 occurrences, 24 distinct exact values. The [occurrence register](HISTORY-SECRET-TRIAGE.csv)
records every rule, commit, path, line and a SHA-256-derived value ID without
including secret values or matched text. Counts describe this scanner's coverage,
not proof that no other sensitive material exists.

Register rule codes: GL001 = generic-api-key; GL002 = curl-auth-header.
Exclusions target the relevant rule as well as file and value. With Gitleaks on
PATH (or `GITLEAKS_BINARY` set to its executable), run
`npm run check:secret-allowlists` to verify both positive and negative controls.

| Classification | Occurrences | Distinct values | Disposition |
|---|---:|---:|---|
| Credential assignments in scripts, setup examples and Postman collections | 12 | 7 | Potentially issued credentials. Owner must confirm provenance and revoke/rotate any genuine values, including sandbox credentials. |
| Authentication payloads or payment tokens in schemas, notes and captured logs | 20 | 9 | Treat as sensitive until provenance and replayability are confirmed. Revoke any genuine payment tokens; ask the provider about captured authentication payloads. These are not all API keys. |
| Generated Next.js signing/encryption keys in build output | 4 | 3 | Remove from public history. If any associated build was deployed, retire it and its generated keys; provider API-key rotation alone does not address this category. |
| Explicit test fixtures and a literal documentation placeholder | 20 | 5 | Reviewed synthetic: narrowly excluded by exact file AND exact value. Other values in the same files remain scanned. |

With those five precise exclusions the history scan reports 36 occurrences.
The prior claim that these shared one eight-character credential was incorrect:
it compared the literal `REDACTED` strings in a fully redacted report.

## Evidence and owner actions

The synthetic cases are the CLI mock gateway key, loopback timeout-test key,
privacy redaction canary, Android local HMAC fixture and `YOUR_ADMIN_TOKEN`.
Their exact exclusions are reviewable in `.gitleaks.toml`; entire directories and
documents are never excluded.

For each of the remaining value IDs, record privately: owner/provider, whether
issued or demonstrably synthetic, revocation or invalidation evidence, date,
and any affected deployment. Do not paste values, provider screenshots containing
secrets, or raw scan reports into issues or this repository. Absence of a value
from today's source is not revocation evidence.

## Proposed history decision — awaiting maintainer approval

Recommend a **new public repository with one reviewed source snapshot**, while
keeping this checkout and its history private. No remote is currently configured.
This avoids publishing historical captures, generated output and unresolved
third-party material. It does not replace credential revocation. The maintainer
must approve the exact snapshot, redistribution boundary and new public destination
before export or publication. No history rewrite or export has been performed.

If preserving history is required, prepare a separate mirror, filter all affected
paths/values, rescan all refs, review rights and sensitive artifacts beyond scanner
matches, and agree on collaborator migration before replacing any shared history.

Completion requires: owner dispositions for all 19 non-synthetic value IDs,
necessary revocations/invalidation, approved history choice, and a clean scan of
the exact public candidate and all refs intended for publication.
