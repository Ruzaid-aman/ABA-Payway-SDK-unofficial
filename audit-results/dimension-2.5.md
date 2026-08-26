# Audit Results: Dimension 2.5 - CLI User Experience

**Audit Date:** 2026-08-26
**Auditor:** Kilo
**Scope:** Static code review of `src/cli.ts` and `src/cli/commands/*.ts`, plus runtime `--help` output verification.

---

## 2.5.1 Command Structure: Intuitive Hierarchy

| Aspect | Status | Details |
|--------|--------|---------|
| Top-level command naming | PASS | `payway-sdk` is clear; all verbs are action-oriented (`generate-qr`, `check-transaction`, `refund`). |
| Nested subcommands | PASS | `payment-link` groups `create` / `detail`; `profiles` groups `add`, `list`, `use`, `current`, `remove`. This matches standard CLI conventions. |
| Flatness vs depth | PASS | Maximum depth is 2 levels (e.g., `payment-link create`), which is intuitive. |
| Monolithic implementation | PARTIAL | All commands are registered in a single 2,000-line `src/cli.ts` (`src/cli.ts:367-2000`). From a UX perspective the hierarchy is fine, but maintainability is impacted. Severity: P3. Remediation: Split command registrations into separate modules under `src/cli/commands/`. |

**Evidence:** `npx tsx src/cli.ts --help` shows 25 top-level commands with clear descriptions.

---

## 2.5.2 Parameter Input: CLI Args + Env Vars + Config Files

| Aspect | Status | Details |
|--------|--------|---------|
| CLI arguments | PASS | All parameters exposed as typed Commander options with defaults (`src/cli.ts:1189-1207`). |
| Environment variables | PASS | `.env` auto-loaded via `loadDotEnvIntoProcess(process.cwd())` (`src/cli.ts:50`). Variables like `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_CALLBACK_URL` are consumed. |
| Saved profiles | PASS | `--profile <name>` global option activates stored credentials (`src/cli.ts:371`, `src/cli.ts:397-414`). Also respects `PAYWAY_PROFILE` env var (`src/cli.ts:401`). |
| Config files (JSON/YAML) | FAIL | Only `.env` format is supported. No JSON/YAML/TOML config file parsing exists. Severity: P3. Remediation: Add optional `payway.config.json` / `payway.config.yaml` support layered under `.env`. |
| Env var fallback in options | PASS | `generate-qr` falls back to `process.env.PAYWAY_CALLBACK_URL` when `--callback-url` is omitted (`src/cli.ts:1288`). |

---

## 2.5.3 Help Documentation: `--help` Clarity, Examples

| Aspect | Status | Details |
|--------|--------|---------|
| Global help examples | PASS | Main help includes a "Journey examples" block with 7 concrete commands and exit code legend (`src/cli.ts:372-386`). |
| Subcommand help detail | PASS | Every subcommand shows all options, types, defaults, and descriptions. Example: `generate-qr --help` lists 16 options with defaults clearly shown. |
| Required option labeling | PASS | Commander `.requiredOption()` is used for critical flags (e.g., `-t, --transaction-id <id>`), causing `--help` to mark them as required. |
| Inline hints in descriptions | PASS | Rate-limit warnings are embedded in descriptions (e.g., `(rate limit: 600/s)`, `strict rate limit: 10/min`). |

**Evidence:** Verified via `npx tsx src/cli.ts --help`, `generate-qr --help`, `generate-checkout --help`, `payment-link --help`, `payout --help`, `profiles --help`, `refund --help`, `transaction-detail --help`, `transaction-list --help`, `setup-webhook --help`.

---

## 2.5.4 Output Formats: JSON / Table / Plain Text

| Aspect | Status | Details |
|--------|--------|---------|
| `--json` flag availability | PASS | 13+ commands support `--json` for machine-readable output (`check-transaction`, `poll-transaction`, `transaction-detail`, `transaction-list`, `refund`, `exchange-rate`, `payout`, `sandbox-beneficiaries`, `payment-link create/detail`, etc.). |
| Plain text default | PASS | Human-friendly labeled output with ANSI colors and icons is the default when `--json` is omitted. |
| Structured table format | PARTIAL | Only `transaction-list` renders a simple ASCII table (`src/cli.ts:975-987`). Other commands use vertical key-value pairs rather than columnar tables. Severity: P3. Remediation: Add a `--table` flag or consistent columnar renderer for list/detail commands. |
| Output redaction | PASS | `config` masks `PAYWAY_API_KEY` and `PAYWAY_RSA_PUBLIC_KEY` (`src/cli.ts:559`, `src/cli.ts:585-586`). `profiles list` truncates merchant IDs (`src/cli.ts:1895`). |

---

## 2.5.5 Interactive Mode: Prompts for Missing Params, Secure Input

| Aspect | Status | Details |
|--------|--------|---------|
| Interactive prompts for missing params | PARTIAL | `generate-qr` prompts for lifetime override and confirmation (`src/cli.ts:1314-1343`). `setup-webhook` prompts for public URL and tunnel choice (`src/cli/commands/setup-webhook.ts:79-115`). `profiles add` prompts for all credential fields (`src/cli.ts:1830-1882`). However, many commands fail fast without prompting (e.g., `generate-checkout` rejects missing `--return-url` without prompting). Severity: P3. Remediation: Add optional prompt-for-missing behavior or clearer error suggestions. |
| Secure input masking | PASS | `readMaskedInput` is used for API key entry in `profiles add` (`src/cli.ts:1838`) and `payway-sdk data` entry (`src/cli.ts:1855`). |
| `--non-interactive` / `-y` bypass | PASS | `generate-qr` supports `--non-interactive, -y` to skip prompts (`src/cli.ts:1203`). `close-transaction` and `refund` support `-y, --force` to skip confirmation (`src/cli.ts:812`, `src/cli.ts:1003`). |
| TTY-aware behavior | PASS | QR image auto-open is suppressed for non-interactive TTYs (`src/cli.ts:1402-1403`). Agent/CI environments keep stdout clean. |

---

## 2.5.6 Exit Codes: 0 Success, Non-Zero Failures

| Aspect | Status | Details |
|--------|--------|---------|
| Documented exit code contract | PASS | Help text documents: `0 success · 1 input/validation · 2 PayWay API failure · 3 network/timeout/rate-limit` (`src/cli.ts:384`). |
| Consistent implementation | PASS | `EXIT_OK=0`, `EXIT_VALIDATION=1`, `EXIT_API_FAILURE=2`, `EXIT_NETWORK=3` defined at `src/cli.ts:89-92`. `classifyError` maps error types to codes (`src/cli.ts:94-103`). `mapPollOutcomeToExitCode` in `src/cli/journey.ts:22-29` follows the same contract. |
| Non-zero on failure | PASS | All catch blocks set `process.exitCode` via `printApiError` or direct assignment. `program.parseAsync().catch(...)` sets exit code 1 for unhandled parse errors (`src/cli.ts:1997-2000`). |
| Success path returns 0 | PASS | Explicit `process.exitCode = EXIT_OK` on success paths (e.g., `close-transaction` at `src/cli.ts:840`, `refund` at `src/cli.ts:1096`). |

---

## 2.5.7 Progress Indication: For Long Operations

| Aspect | Status | Details |
|--------|--------|---------|
| Polling progress | PASS | `runPolling` shows elapsed/remaining clock, attempt number, and status for every poll (`src/cli.ts:196-273`). Terminal events include outcome and next-step hints. JSON mode emits structured events (`poll`, `terminal`, `aborted`). |
| Pre-flight / lookup progress | PARTIAL | `refund` prints `Pre-flight: fetching original transaction (10/min rate limit)...` (`src/cli.ts:1039`) and `transaction-detail --wait` prints `not indexed yet — retrying...` (`src/cli.ts:883`). However, there is no spinner, ETA, or percentage for these waits. Severity: P3. Remediation: Add elapsed-time logging or simple spinner for multi-attempt synchronous waits. |
| Long-running server commands | PARTIAL | `setup-webhook` prints `Starting Cloudflare Tunnel...` and `Tunnel established` (`src/cli/commands/setup-webhook.ts:135-138`), but no ongoing progress while the server is running (expected for a daemon-like command). |

---

## Summary

| Checkpoint | Status | Severity |
|------------|--------|----------|
| 2.5.1 Command structure | PASS | — |
| 2.5.2 Parameter input | PARTIAL | P3 |
| 2.5.3 Help documentation | PASS | — |
| 2.5.4 Output formats | PARTIAL | P3 |
| 2.5.5 Interactive mode | PARTIAL | P3 |
| 2.5.6 Exit codes | PASS | — |
| 2.5.7 Progress indication | PARTIAL | P3 |

## Overall Assessment

**PASS with minor gaps.** The PayWay SDK CLI delivers a solid user experience with intuitive command hierarchy, comprehensive `--help` documentation, robust `--json` output, proper exit codes, and good interactive behavior where it matters (QR generation, webhook setup, profiles). The primary gaps are: absence of structured config files beyond `.env`, limited table-format output, and minimal progress feedback for synchronous multi-attempt operations. None of these are blockers; all are P3 enhancements.
