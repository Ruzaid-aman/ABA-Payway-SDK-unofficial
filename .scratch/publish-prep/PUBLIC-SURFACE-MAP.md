# Public Surface Map — what becomes public when you push out

**Generated:** 2026-09-15 · tip `1a17972` · **uncommitted working artifact** (fold into `docs/RELEASE-READINESS.md` evidence or delete before RC if stale)

There are **three distinct surfaces**. The npm tarball is a curated 104-file subset;
a git push exposes the full 1,330-path tree **plus all 359 commits of history**
(deleted files stay fetchable). Deciding the *destination repo strategy* (register
item C) decides how much of Surface 1 actually goes out.

---

## Surface 1 — git push (the wide surface)

### 1a. Tip tree — 1,330 tracked paths, by directory

| Paths | Directory | What it is | Exposure notes |
|---:|---|---|---|
| 355 | `docs/` | Integration guides + internal dossiers | Includes SANDBOX-FINDINGS (live gateway facts), INTEGRATION-GAPS (ABA questions), CLOSE-TRANSACTION-FINDINGS, PRODUCTION-VERIFICATION-PLAN, HISTORY-SECRET-TRIAGE — all become public |
| 292 | `src/` | SDK + CLI source (+ tests) | Public-intended; the load-bearing surface |
| 211 | `.scratch/` | Internal working artifacts: campaign specs, audit notes, session STATE files, AOF cycle docs | AI-agent working notes go public verbatim |
| 81 | `sdk/` | **Vendored ABA mobile SDKs** (Android `com.ababank.payway` + iOS) | Third-party/ABA-proprietary code — **register item B redistribution rights** |
| 79 | `.zcode/` | Skills mirror + `plans/plan-sess_*.md` AI session plans | Session plans are internal notes; normally stripped pre-push |
| 69 | `payway-boilerplate/` | **Vendored ABA official boilerplate** (PHP samples, KHQR builder HTML) | ABA-authored material — **item B** |
| 46 | `scripts/` | Live-probe + codegen scripts | Public-intended (they reference sandbox only) |
| 44 | `skills/` | 34 packaged agent skills | Public-intended (also in npm tarball) |
| 37 | `audit-results/` | Internal audit dossiers incl. `pillar-c-security-posture.md`, `technical-debt-register.md`, `final-report.md` | Self-assessments public; review before push |
| 32 | `knowledge/` | Generated offline corpus + MANIFEST | Public-intended (also in npm tarball) |
| 22 | `.superpowers/` | AI campaign briefs/reports (`sdd/2026-08-22-*`) | Internal working notes |
| 18 | `payway-openapi/` | **ABA's shared OpenAPI spec copy** (paths/components/bundled) | ABA-authored spec — **item B**; 21 spec errors are documented in our audits |
| 11 | `examples/` | First-payment example app | Public-intended |
| 4 | `.github/` | CI workflows | Public-intended |
| 3 | `.kilo/` | AI session plans | Internal working notes |
| 1 | `.agents/AGENTS.md` | Deep project rules | Public-intended (agent-doc value) |
| ~20 | root files | README, QUICKSTART, CHANGELOG, LICENSE, CONTRIBUTING, SECURITY.md, SUPPORT.md, **HANDOFF.md, AGENTS.md, llms.txt**, package.json, package-lock.json, tsup/tsconfig/vitest/biome/stryker/typedoc configs, `.gitignore`, `.gitattributes`, `.gitleaks.toml`, `.npmignore` | HANDOFF/AGENTS are internal but high-value agent docs — consciously include or strip |

### 1b. Per-file watchlist (semi-sensitive content in the tip tree)

- **Sandbox merchant ID `ec476910` appears in 35 tracked files** — docs/02/03/12/13,
  CHANGELOG, HANDOFF, audit-results/, .scratch/. Not a secret (sandbox), but it
  identifies your test merchant → register **item B identity review**.
- **Commit identity:** all 359 commits authored by `Ruzaid-aman
  <18544936+Ruzaid-aman@users.noreply.github.com>` — exactly **one** identity in all
  history, and it's the GitHub noreply form. No personal emails leaked. ✓
- **`package.json` metadata publishes as-is:** `"author": "Antigravity
  <info@antigravity.dev>"`, `repository`/`homepage` point at
  `github.com/antigravity-google/aba-payway-ts` — a repo that doesn't exist yet
  (no git remote configured). Item C's destination must match this metadata, or the
  metadata must be updated at RC time.
- `docs/HISTORY-SECRET-TRIAGE.csv` (tracked) is the *index* of historical secret
  locations — the tip copy is redacted (ValueIds only), safe, but it advertises where
  history holds values.
- Test PEMs in `src/__tests__/utils.test.ts` / `agent-privacy-session.test.ts` are
  truncated **fixtures**, not real keys. ✓ `.gitleaks.toml` allowlists only fake
  values (`test-api-key-…`, canary AWS id). ✓

### 1c. History — 359 commits (the part people forget)

- Register item A evidence (2026-09-14): **36 occurrences / 19 distinct values /
  217 commits** carry secret-shaped strings. Per `HISTORY-SECRET-TRIAGE.csv` they are
  GL001 "authentication-payload-or-token" values in **deleted** paths — old
  `test-logs/*.jsonl`, `newsession.txt`, `payway-openapi.yaml` (old root copy), old
  `docs/09` revisions, `src/types.ts` history. Sandbox-scoped, but on push every blob
  is fetchable by SHA forever.
- `.env` was **never committed** in any commit on any ref. ✓ (verified
  `git log --all -- .env` → empty)
- Options at item A: rotate at ABA + push as-is / history rewrite / fresh
  start-point (squash) repo. The fresh-squash option also collapses 1c exposure AND
  shrinks 1a to a curated tree.

---

## Surface 2 — npm publish (the narrow surface)

Tarball `aba-payway-ts-1.5.0.tgz`: **104 files, 941.3 kB packed / 3.5 MB unpacked**
(dry-run verified 2026-09-15). Governed by the `files` field:

| In the tarball | From |
|---|---|
| `dist/**` | Built ESM/CJS/DTS — gitignored, so npm-only (never in git) |
| `skills/**` (34 skills) + `skills/README.md` | packaged agent guides |
| `knowledge/**` (31 topics + MANIFEST.json) | offline corpus |
| `llms.txt` | machine-readable index |
| QUICKSTART.md, CHANGELOG.md, LICENSE, README.md, package.json | npm always-includes |

**Never in the tarball:** docs/ dossiers, src/ (dist only), audit-results/, .scratch/,
`sdk/`, `payway-boilerplate/`, `payway-openapi/`, `.zcode/`, `.superpowers/`, `.kilo/`,
HANDOFF.md, AGENTS.md. The vendored-ABA material (item B) does **not** ship via npm —
only via a repo push.

---

## Surface 3 — stays local (verified non-public)

| Path | Why |
|---|---|
| `.env` | gitignored AND never committed — live sandbox credentials stay local |
| `PaywAySandboxkey.txt`, `*key*.txt`, `*secret*.txt` | gitignored patterns |
| `test-output/`, `payway-output/` | gitignored live-probe evidence & artifacts |
| `webhook_data/`, `payway-data/` | gitignored capture stores (plus the APPDATA data root, which is outside the repo entirely) |
| `dist/`, `node_modules/`, `coverage/`, `reports/`, `stryker-tmp/`, `.worktrees/`, logs | gitignored build/runtime output |

---

## How this maps to the register (`docs/RELEASE-READINESS.md` A–I)

| Item | This map's input |
|---|---|
| **A** history disposition | §1c — 217 commits / 19 values; `.env` clean; fresh-squash option shrinks both §1c and §1a |
| **B** redistribution/identity | §1a vendored dirs (`sdk/`, `payway-boilerplate/`, `payway-openapi/` are ABA-authored, package claims MIT) + §1b merchant-ID sweep |
| **C** destination repo | package.json already names `github.com/antigravity-google/aba-payway-ts`; no remote exists yet; choice of fresh-squash vs full-history determines §1a/§1c exposure |
| **G/H** RC + publish | Surface 2 is already tight (104 curated files) — npm is the low-risk leg; the repo push is the one needing decisions |

**Bottom line:** npm publish is ready-shaped today; the git push is where every open
decision concentrates — history (A), ABA-authored material + merchant identity (B),
and whether the destination is a curated fresh repo or the full 359-commit history (C).
