# Storage Wave 1 — Unified Data Root + Default-On CLI Journal (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution —
> subagent dispatch is unavailable on the free-model quota) to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All local PayWay state (transaction journal, CoF linked tokens, webhook captures) resolves to
one stable data root (`PAYWAY_DATA_DIR`, default `<APPDATA|~/.config>/aba-payway-sdk/data`), and the CLI
records every API exchange to the journal BY DEFAULT (opt-out via `--no-journal`).

**Architecture:** One new resolution module (`src/config/data-root.ts`) becomes the single source of
truth for the data root; the three existing stores (journal writer, token store, webhook JSON/SQLite
storage) change only their fallback lines to call it. Store-specific env vars keep precedence over the
shared one. The CLI arms journaling in its existing `preAction` env-mutation seam, extracted into a pure
policy function for testability. `payway-output/` artifacts stay cwd-relative (user-facing deliverables,
not internal state). No migration magic for legacy `./payway-data` / `./webhook_data` — documented change.

**Tech Stack:** TypeScript (NodeNext ESM), vitest, commander. Build before vitest (Windows box,
`npm run build` then `npx vitest run`). Lint gate: `npm run lint`.

**Spec:** `.scratch/storage-service/plan.md` (this file; design rationale in the conversation
2026-09-13 + memory `storage-service-gap-analysis-2026-09-13`).

## Global Constraints

- Branch: `storage/data-root-journal` off current `modern/completions-update-check` tip (2dcb6a0).
  Commit ONLY files this wave owns; never commit `.scratch/` strangers or `HANDOFF.md` lines another
  agent may have edited concurrently (re-read before staging).
- Precedence contract everywhere: explicit arg > store-specific env (`PAYWAY_JOURNAL_DIR`,
  `PAYWAY_TOKEN_STORE_DIR`, `PAYWAY_WEBHOOK_DIR`) > `PAYWAY_DATA_DIR` > app-data default
  (`process.env.APPDATA ?? homedir()/.config`, then `aba-payway-sdk/data`) — mirrors
  `src/agent/storage.ts:31` exactly.
- Journal default mode stays `digest`; retention stays opt-in (`PAYWAY_JOURNAL_MAX_AGE_DAYS`).
- SDK library default stays opt-in (`journal: undefined` = env-only). Only the CLI defaults on.
- All fail-open contracts preserved (journal emit failures never break commands; corrupt token store
  returns []).
- Commit style: conventional commits, `git commit -F <file>` or backtick-free messages (Git Bash).
- No live API calls anywhere in this wave (NODE_TLS not needed).

---

### Task 0: Branch

- [ ] `git status --porcelain` must show NO tracked modifications (untracked `.scratch/` ok)
- [ ] `git checkout -b storage/data-root-journal`

---

### Task 1: `src/config/data-root.ts` — the unified resolver

**Files:**
- Create: `src/config/data-root.ts`
- Modify: `src/config/envValidator.ts:34` (add `PAYWAY_DATA_DIR` to the known-env array)
- Modify: `src/index.ts` (export the two resolvers next to the journal exports, ~line 105)
- Test: `src/__tests__/data-root.test.ts` (new)

**Interfaces (produced):**
```ts
export const PAYWAY_DATA_DIR_ENV = 'PAYWAY_DATA_DIR';
export function resolvePaywayDataRoot(appDataDirectory?: string, env?: NodeJS.ProcessEnv): string;
// explicit env > <appDataDirectory ?? env.APPDATA ?? homedir()/.config>/aba-payway-sdk/data
export function resolveWebhookDir(explicit?: string, env?: NodeJS.ProcessEnv): string;
// explicit > env.PAYWAY_WEBHOOK_DIR > <dataRoot>/webhook_data
```

- [ ] **Step 1: failing tests** (`src/__tests__/data-root.test.ts`)

```ts
import { mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { PAYWAY_DATA_DIR_ENV, resolvePaywayDataRoot, resolveWebhookDir } from '../config/data-root.js';

describe('resolvePaywayDataRoot', () => {
  it('PAYWAY_DATA_DIR wins over everything', () => {
    expect(resolvePaywayDataRoot('/custom/app', { PAYWAY_DATA_DIR: '/data/here' })).toBe('/data/here');
  });
  it('defaults under the app-data root (aba-payway-sdk/data)', () => {
    expect(resolvePaywayDataRoot('/custom/app', {})).toBe(path.join('/custom/app', 'aba-payway-sdk', 'data'));
  });
  it('falls back to APPDATA then ~/.config', () => {
    expect(resolvePaywayDataRoot(undefined, {})).toBe(path.join(homedir(), '.config', 'aba-payway-sdk', 'data'));
    expect(resolvePaywayDataRoot(undefined, { APPDATA: '/roaming' })).toBe(path.join('/roaming', 'aba-payway-sdk', 'data'));
  });
  it('trims whitespace around the env value', () => {
    expect(resolvePaywayDataRoot(undefined, { [PAYWAY_DATA_DIR_ENV]: '  /data  ' })).toBe('/data');
  });
});

describe('resolveWebhookDir', () => {
  const root = resolvePaywayDataRoot('/app', {});
  it('explicit arg wins', () => {
    expect(resolveWebhookDir('/wb', {})).toBe('/wb');
  });
  it('PAYWAY_WEBHOOK_DIR beats the data root', () => {
    expect(resolveWebhookDir(undefined, { PAYWAY_WEBHOOK_DIR: '/wb' })).toBe('/wb');
  });
  it('defaults to <dataRoot>/webhook_data', () => {
    expect(resolveWebhookDir(undefined, {})).toBe(path.join(root, 'webhook_data'));
  });
});
```

- [ ] **Step 2: run, verify FAIL** — `npx vitest run src/__tests__/data-root.test.ts` (module missing)
- [ ] **Step 3: implement** `src/config/data-root.ts`

```ts
/**
 * Unified local data root — the single place every PayWay store resolves its
 * default directory from (storage wave 1, .scratch/storage-service/plan.md).
 *
 * Precedence for every store: explicit arg > store-specific env
 * (PAYWAY_JOURNAL_DIR / PAYWAY_TOKEN_STORE_DIR / PAYWAY_WEBHOOK_DIR) >
 * PAYWAY_DATA_DIR > the app-data default. The default mirrors the agent-store
 * convention (src/agent/storage.ts): `process.env.APPDATA ?? ~/.config`, then
 * `aba-payway-sdk/data`. User-facing artifacts (payway-output/) are NOT part
 * of this root — they stay cwd-relative by design.
 */

import { homedir } from 'node:os';
import path from 'node:path';

export const PAYWAY_DATA_DIR_ENV = 'PAYWAY_DATA_DIR';

const WEBHOOK_DIR_NAME = 'webhook_data';

export function resolvePaywayDataRoot(
  appDataDirectory?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env[PAYWAY_DATA_DIR_ENV]?.trim();
  if (explicit) return explicit;
  const base = appDataDirectory ?? env.APPDATA ?? path.join(homedir(), '.config');
  return path.join(base, 'aba-payway-sdk', 'data');
}

export function resolveWebhookDir(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit) return explicit;
  const fromEnv = env.PAYWAY_WEBHOOK_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(resolvePaywayDataRoot(undefined, env), WEBHOOK_DIR_NAME);
}
```

(`env` defaults to `process.env`, so ambient resolution reads live env; explicit `appDataDirectory`
and stubbed `env.APPDATA` are the two test seams — mirrors `src/agent/storage.ts`.)

- [ ] **Step 4: run, verify PASS** — same command
- [ ] **Step 5: wire envValidator** — add `'PAYWAY_DATA_DIR',` to the known-env array in
  `src/config/envValidator.ts` (next to `'PAYWAY_WEBHOOK_DIR'`, line ~34)
- [ ] **Step 6: export from the SDK barrel** — in `src/index.ts` near the journal exports:
  `export { PAYWAY_DATA_DIR_ENV, resolvePaywayDataRoot, resolveWebhookDir } from './config/data-root.js';`
- [ ] **Step 7: commit** — `feat(storage): unified PAYWAY_DATA_DIR data-root resolver`

---

### Task 2: Journal defaults to the data root

**Files:**
- Modify: `src/journal/writer.ts:37-39` (`defaultJournalDir`) and `:164-166` (`resolveJournalDir` fallback)
- Modify: `src/cli/commands/doctor.ts:153-157` (`checkJournal` dir default; `cwd` param becomes unused for the dir)
- Modify: `src/cli/commands/journal.ts:172` (`--webhook-dir` help copy)
- Test modify: `src/__tests__/journal.test.ts:64-67` (default dir now under data root)
- Test modify: `src/__tests__/journal-improvements.test.ts:155-200` (doctor oversized-journal test)

- [ ] **Step 1: update the failing assertions first**

`journal.test.ts` — replace the env-alone test's dir assertion:
```ts
it('env alone enables when config omits the setting', () => {
  const appData = mkdtempSync(path.join(tmpdir(), 'payway-appdata-'));
  process.env.APPDATA = appData; // restore in afterEach if the file doesn't already
  const resolved = resolveJournalConfig(undefined, { PAYWAY_JOURNAL: '1' });
  expect(resolved?.mode).toBe('digest');
  expect(resolved?.dir).toBe(path.join(appData, 'aba-payway-sdk', 'data'));
});
```
(If mutating `process.env` is awkward there, use `vi.stubEnv('APPDATA', appData)` — the file already
imports vitest. Keep the assertion exact-path, not `toContain`.)

`journal-improvements.test.ts` doctor test (~line 155): it currently relies on "doctor uses
cwd/payway-data when enabled without _DIR" and creates `path.join(dir, 'payway-data')`. Change it to
stub `PAYWAY_DATA_DIR` to the temp `dir` (via `vi.stubEnv`), keep `PAYWAY_JOURNAL: '1'` stub, point the
oversized journal at `path.join(dir, 'journal.jsonl')`, and keep the `PAYWAY_WEBHOOK_DIR` stub as-is
(line 199). Assert the doctor output still reports the warning.

- [ ] **Step 2: run the two files, verify FAIL**
  `npx vitest run src/__tests__/journal.test.ts src/__tests__/journal-improvements.test.ts`
- [ ] **Step 3: implement**

`writer.ts`:
```ts
import { resolvePaywayDataRoot } from '../config/data-root.js';
...
function defaultJournalDir(): string {
  return resolvePaywayDataRoot();
}
...
export function resolveJournalDir(explicit?: string): string {
  return explicit ?? resolveJournalConfig(undefined, process.env)?.dir ?? resolvePaywayDataRoot();
}
```
(Leave `DEFAULT_JOURNAL_DIR_NAME` exported from types.js for API compat but drop both cwd usages.)

`doctor.ts`:
```ts
const dir = env.PAYWAY_JOURNAL_DIR?.trim() || resolvePaywayDataRoot(undefined, env);
```
plus import; keep the `cwd` parameter (caller at :281 still passes it) but it is now unused for the
journal path — if lint flags the unused param, prefix `_cwd` and update the caller comment. Also update
the "not enabled" fix copy at :166 later in Task 5 (journal is CLI-default-on there).

`src/cli/commands/journal.ts:172`: copy → `'Webhook capture directory (default: <data root>/webhook_data)'`.

- [ ] **Step 4: run both test files, verify PASS**
- [ ] **Step 5: commit** — `feat(journal): default journal dir follows PAYWAY_DATA_DIR data root`

---

### Task 3: Token store defaults to the data root

**Files:**
- Modify: `src/webhook/token-store.ts:60-64` (`resolveTokenStoreDir` fallback)
- Test modify: `src/__tests__/cof-token-capture.test.ts:126-130`
- Test modify: `src/__tests__/cli-cof-token-store.test.ts:24-110` (chdir isolation → env stub)

- [ ] **Step 1: failing test updates**

`cof-token-capture.test.ts` (current line 129):
```ts
expect(resolveTokenStoreDir(undefined, {})).toBe(join(process.cwd(), 'payway-data'));
```
→
```ts
const appData = mkdtempSync(path.join(tmpdir(), 'payway-appdata-'));
expect(resolveTokenStoreDir(undefined, { APPDATA: appData })).toBe(join(appData, 'aba-payway-sdk', 'data'));
expect(resolveTokenStoreDir(undefined, { PAYWAY_DATA_DIR: '/data', APPDATA: appData })).toBe('/data');
```

`cli-cof-token-store.test.ts`: it chdirs into `tempDir` and saves to `path.join(tempDir, 'payway-data')`
(lines 71/103/104) relying on the cwd default. Make it hermetic against the new default: in the
`beforeEach` (line ~30, next to `process.chdir(tempDir)`) add
`vi.stubEnv('PAYWAY_DATA_DIR', tempDir)` (add `vi` to the vitest import if absent), keep the
`saveLinkedToken(..., tempDir)` explicit dirs as-is (explicit beats env), and `unstubAllEnvs()` in
afterEach.

- [ ] **Step 2: run, verify FAIL**
  `npx vitest run src/__tests__/cof-token-capture.test.ts src/__tests__/cli-cof-token-store.test.ts`
- [ ] **Step 3: implement** — `token-store.ts`:
```ts
import { resolvePaywayDataRoot } from '../config/data-root.js';
...
export function resolveTokenStoreDir(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit) return explicit;
  if (env[TOKEN_STORE_DIR_ENV]) return env[TOKEN_STORE_DIR_ENV] as string;
  return resolvePaywayDataRoot(undefined, env);
}
```
Update the doc comment above it (fallback is now the data root, not `<cwd>/payway-data`).
- [ ] **Step 4: run, verify PASS**
- [ ] **Step 5: commit** — `feat(cof): linked-token store defaults to the PAYWAY_DATA_DIR data root`

---

### Task 4: Webhook capture stores default to the data root

**Files:**
- Modify: `src/webhook/storage-json.ts:14` and `src/webhook/storage-sqlite.ts:14` (DEFAULT_PATH)
- Modify: `src/cli/commands/webhook.ts:50` (`loadDefaultStorage`)
- Modify: `src/journal/reconcile.ts:111` (`resolveWebhookCaptureDir`)
- Modify: `src/cli/commands/journal.ts:46` (`--webhook-dir` default derivation)
- Test modify: `src/__tests__/cli-webhook-commands.test.ts:78,158` (temp isolation)

- [ ] **Step 1: implementation (tests below pin it)**

`storage-json.ts` / `storage-sqlite.ts` (replace the const):
```ts
import { resolveWebhookDir } from '../config/data-root.js';
const DEFAULT_PATH = () => path.join(resolveWebhookDir(), 'callbacks.jsonl'); // or callbacks.db
```
and use `DEFAULT_PATH()` at the two resolve sites (`resolve(DEFAULT_PATH)` → `resolve(DEFAULT_PATH())`).
Keep the `filePath` param precedence unchanged (explicit wins).

`webhook.ts` (`loadDefaultStorage`):
```ts
import { resolveWebhookDir } from '../../config/data-root.js';
...
const dir = resolveWebhookDir();
```
(drop the `'webhook_data'` literal; keep the trailing-slash strip + json-then-sqlite logic and the
comment at :39-41 — reword "PAYWAY_WEBHOOK_DIR or <cwd>/webhook_data" to "PAYWAY_WEBHOOK_DIR or
<data root>/webhook_data").

`reconcile.ts:111`:
```ts
options.webhookDir ?? resolveWebhookDir(undefined, process.env)
```
(keep `DEFAULT_WEBHOOK_DIR_NAME` only if still referenced — delete if orphaned; run a grep first).
Update the doc comment at :51.

`cli/commands/journal.ts:46`:
```ts
resolveWebhookDir()
```

- [ ] **Step 2: failing test updates**

`cli-webhook-commands.test.ts` lines ~78/~158 create `path.join(tempDir, 'webhook_data')` then invoke
CLI commands; verify how the test isolates (chdir like the token-store test, or PAYWAY_WEBHOOK_DIR
stub). Make both deterministic with `vi.stubEnv('PAYWAY_DATA_DIR', tempDir)` in beforeEach (mirroring
Task 3) — the CLI then resolves `tempDir/webhook_data` through the new default chain without chdir
dependence. Keep the explicit-dir constructions unchanged.

Add one default-path test (new `it` in the same file or `src/__tests__/data-root.test.ts`):
```ts
it('webhook default path lands under the data root', async () => {
  const { JsonWebhookStorage } = await import('../webhook/storage-json.js');
  const appData = mkdtempSync(path.join(tmpdir(), 'payway-appdata-'));
  const store = new JsonWebhookStorage(undefined, { APPDATA: appData });
  expect(store.filePath).toBe(path.join(appData, 'aba-payway-sdk', 'data', 'webhook_data', 'callbacks.jsonl'));
});
```
If `JsonWebhookStorage` doesn't accept an env param, construct it with no args after
`vi.stubEnv('APPDATA', appData)` instead, and assert on the exposed `filePath`.

- [ ] **Step 3: run, verify PASS**
  `npx vitest run src/__tests__/cli-webhook-commands.test.ts src/__tests__/data-root.test.ts src/__tests__/journal-intelligence.test.ts`
- [ ] **Step 4: sweep for stragglers**
  `grep -rn "webhook_data\|'payway-data'" src --include=*.ts | grep -v __tests__` — every remaining hit
  must be a comment/constant explicitly about the data root; fix copy where it still says `<cwd>`.
- [ ] **Step 5: commit** — `feat(webhook): capture stores default to the PAYWAY_DATA_DIR data root`

---

### Task 5 (Phase B): CLI journal default-on + `--no-journal`

**Files:**
- Create: `src/cli/journal-policy.ts` (pure policy fn + exemption set)
- Modify: `src/cli.ts:952-956` (add `--no-journal`, update `--journal` help copy), `:1020-1024` (preAction calls the policy)
- Modify: `src/cli/commands/doctor.ts:166` (fix copy when explicitly disabled)
- Modify: `src/cli/commands/setup-webhook.ts` (`--journal` option description — now "pins PAYWAY_JOURNAL=1 into .env for SDK/embedded runs")
- Test: `src/__tests__/cli-journal-policy.test.ts` (new)

**Interfaces (produced):**
```ts
export const CLI_JOURNAL_EXEMPT_COMMANDS: ReadonlySet<string>;
// doctor, status, journal, completions, docs, skills, profiles, init, demo,
// onboard, explain, webhook, sandbox-test-cards, sandbox-beneficiaries
export function applyCliJournalPolicy(topLevelCommand: string, flag: boolean | undefined, env: NodeJS.ProcessEnv): void;
// flag === false  -> env.PAYWAY_JOURNAL = '0'   (--no-journal wins over ambient truthy env)
// flag === true   -> env.PAYWAY_JOURNAL = '1'
// flag === undefined && command NOT exempt && env value not explicitly falsy ('0'|'false'|'no'|'off') && env unset
//                 -> env.PAYWAY_JOURNAL = '1'
// exempt commands and explicit-falsy env: env left untouched
```

- [ ] **Step 1: failing tests** (`src/__tests__/cli-journal-policy.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { applyCliJournalPolicy } from '../cli/journal-policy.js';

const run = (env: Record<string, string>) => {
  const carrier: Record<string, string> = { ...env };
  return (top: string, flag: boolean | undefined) => applyCliJournalPolicy(top, flag, carrier as NodeJS.ProcessEnv) ?? carrier;
};

describe('applyCliJournalPolicy', () => {
  it('defaults ON for API commands with no flag and no env', () => {
    const carrier: Record<string, string> = {};
    applyCliJournalPolicy('generate-qr', undefined, carrier as NodeJS.ProcessEnv);
    expect(carrier.PAYWAY_JOURNAL).toBe('1');
  });
  it('respects an explicitly falsy env', () => {
    for (const v of ['0', 'false', 'no', 'OFF']) {
      const carrier: Record<string, string> = { PAYWAY_JOURNAL: v };
      applyCliJournalPolicy('generate-qr', undefined, carrier as NodeJS.ProcessEnv);
      expect(carrier.PAYWAY_JOURNAL).toBe(v);
    }
  });
  it('leaves an explicitly truthy env alone', () => {
    const carrier: Record<string, string> = { PAYWAY_JOURNAL: '1' };
    applyCliJournalPolicy('cof', undefined, carrier as NodeJS.ProcessEnv);
    expect(carrier.PAYWAY_JOURNAL).toBe('1');
  });
  it('--no-journal forces off even against a truthy env', () => {
    const carrier: Record<string, string> = { PAYWAY_JOURNAL: '1' };
    applyCliJournalPolicy('generate-qr', false, carrier as NodeJS.ProcessEnv);
    expect(carrier.PAYWAY_JOURNAL).toBe('0');
  });
  it('--journal forces on', () => {
    const carrier: Record<string, string> = {};
    applyCliJournalPolicy('generate-qr', true, carrier as NodeJS.ProcessEnv);
    expect(carrier.PAYWAY_JOURNAL).toBe('1');
  });
  it('exempt local-only commands never arm the journal', () => {
    for (const cmd of ['doctor', 'status', 'journal', 'completions', 'docs', 'webhook', 'profiles', 'init', 'skills', 'explain', 'demo', 'onboard', 'sandbox-test-cards', 'sandbox-beneficiaries']) {
      const carrier: Record<string, string> = {};
      applyCliJournalPolicy(cmd, undefined, carrier as NodeJS.ProcessEnv);
      expect(carrier.PAYWAY_JOURNAL).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: run, verify FAIL**
- [ ] **Step 3: implement** `src/cli/journal-policy.ts`

```ts
/**
 * CLI journal policy — the CLI is an app, not a silent library, so every
 * gateway-touching command records to the transaction journal by default
 * (storage wave 1, task 5). Exempt commands are pure-local reads/locals where
 * arming would distort diagnostics (doctor must report the AMBIENT env, not
 * its own force-on) or produce no PayWay exchanges at all.
 */

const FALSY = new Set(['0', 'false', 'no', 'off']);

export const CLI_JOURNAL_EXEMPT_COMMANDS: ReadonlySet<string> = new Set([
  'doctor', 'status', 'journal', 'completions', 'docs', 'skills', 'profiles',
  'init', 'demo', 'onboard', 'explain', 'webhook', 'sandbox-test-cards',
  'sandbox-beneficiaries',
]);

export function applyCliJournalPolicy(
  topLevelCommand: string,
  flag: boolean | undefined,
  env: NodeJS.ProcessEnv,
): void {
  if (flag === false) {
    env.PAYWAY_JOURNAL = '0';
    return;
  }
  if (flag === true) {
    env.PAYWAY_JOURNAL = '1';
    return;
  }
  if (CLI_JOURNAL_EXEMPT_COMMANDS.has(topLevelCommand)) return;
  const current = (env.PAYWAY_JOURNAL ?? '').trim().toLowerCase();
  if (current !== '' && !FALSY.has(current)) return; // already on — leave it
  if (current === '') env.PAYWAY_JOURNAL = '1';
}
```

Wire into `src/cli.ts` preAction (replace lines ~1020-1024):
```ts
// Storage wave 1: the CLI journals by default. --journal/--no-journal override;
// an explicitly falsy PAYWAY_JOURNAL in the environment is respected; pure-local
// commands are exempt so doctor/status report ambient truth.
applyCliJournalPolicy(topLevelCommandName(actionCommand), program.opts<{ journal?: boolean }>().journal, process.env);
```
Add the `--no-journal` option right after `--journal` and update the `--journal` copy
(path is now `<data root>/journal.jsonl`, "on by default"):
```ts
.option('--journal', 'Force the transaction journal on (<data root>/journal.jsonl; on by default for API commands)')
.option('--no-journal', 'Disable the transaction journal for this invocation')
```
Plus a small `topLevelCommandName(cmd: Command): string` helper next to `isProfilesCommand`
(walk `.parent` until the node whose parent is the program; return its `.name()`).

- [ ] **Step 4: run policy tests, verify PASS; then the journal CLI suite**
  `npx vitest run src/__tests__/cli-journal-policy.test.ts src/__tests__/journal-improvements.test.ts src/__tests__/cli.test.ts`
  (cli.test.ts is the widest consumer of preAction behavior — expect fallouts here if any command
  assertion assumed a silent journal; fix by stubbing `PAYWAY_JOURNAL=0` in those tests rather than
  weakening the default.)
- [ ] **Step 5: doctor + setup-webhook copy**
  - doctor.ts:166 fix copy → `'The CLI journals by default — something disabled it (--no-journal or PAYWAY_JOURNAL=<falsy>). Remove the override to keep a local record of every exchange (docs/18)'`
  - setup-webhook `--journal` description → `'Persist PAYWAY_JOURNAL=1 into .env (pins the default-on CLI journal for SDK/embedded runs too)'`
- [ ] **Step 6: integration pin** — crib the dist-CLI spawn pattern from `cli.test.ts:339-374`
  (spawnSync dist/cli.js with minimal env incl. stubbed `APPDATA` + fake credentials): run
  `check-transaction -t x --json` with a stubbed fetch? spawnSync can't stub fetch — instead run the
  in-process `runCli(['check-transaction', '-t', 't1', '--json'])` with credentials env set and global
  fetch stubbed to a canned response (pattern already used elsewhere in cli tests for API commands);
  assert `path.join(appData, 'aba-payway-sdk', 'data', 'journal.jsonl')` now exists and contains an
  `execution.response` event, and that `--no-journal` leaves it absent.
- [ ] **Step 7: commit** — `feat(cli): journal on by default; --no-journal opt-out; exempt local commands`

---

### Task 6 (Phase C): Docs, handoff, knowledge corpus

**Files:**
- Modify: `AGENTS.md` (env/journal bullets + canonical-command comments that say `<cwd>/payway-data`)
- Modify: `.agents/AGENTS.md` env table (add `PAYWAY_DATA_DIR`; update `PAYWAY_JOURNAL*`/`PAYWAY_WEBHOOK_DIR` defaults; journal-facts bullet at :77)
- Modify: `docs/18-transaction-journal.md` (Enabling section: CLI default-on; path sections: data root)
- Modify: `docs/16-webhook-setup-guide.md` + `docs/12-error-handling-and-debugging.md` where they print `<cwd>/webhook_data` / `payway-data` defaults
- Modify: `HANDOFF.md` (current-state entry + behavior-contract line)
- Regen: `npm run sync:knowledge` (corpus + llms.txt — freshness gate will fail the suite without this)

- [ ] **Step 1:** grep the docs: `grep -rln "payway-data\|webhook_data" docs/*.md AGENTS.md .agents/AGENTS.md` and update every default-path/default-off statement (keep historical/audit records untouched — only live-contract docs).
- [ ] **Step 2:** `npm run sync:knowledge`
- [ ] **Step 3:** commit — `docs(storage): data-root contract + CLI-default journal across docs, AGENTS, handoff; corpus resync`

---

### Task 7: Full verification (verification-before-completion)

- [ ] `npm run build` (required before vitest on this box)
- [ ] `npx vitest run` — full suite green (baseline 1910+; new tests add ~15)
- [ ] `npm run lint`
- [ ] Manual smoke (no API): `PAYWAY_DATA_DIR= npx tsx src/cli.ts doctor --json` shows journal enabled via ambient env; `npx tsx src/cli.ts journal stats` after one stubbed run writes `<data root>/journal.jsonl`
- [ ] Update HANDOFF.md current state (uncommitted-work line) if not already in Task 6 commit
- [ ] Report per delivery protocol; leave branch unmerged (no merges unless told)
