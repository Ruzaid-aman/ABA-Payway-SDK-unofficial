# CLI Modernization Phase 1 — Completions + Update Checker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `payway-sdk completions <bash|zsh|fish|powershell>` (runtime-derived from the live Commander registry) and a stderr-only, never-intrusive update notifier.

**Architecture:** Two zero-dependency modules: (1) a Commander-introspection tree (`collectCompletionTree`) feeding four shell-script generators, exposed as a new top-level `completions` command; (2) an update-check module (`maybeNoticeUpdate`) wired ONLY into the direct-invocation bare/`--help` paths of `src/cli.ts`, cached 24h in the existing `aba-payway-sdk` app-data dir.

**Tech Stack:** TypeScript (ESM, Node ≥22.12), commander 15, vitest. No new dependencies.

**Spec:** `.scratch/cli-modernization/design.md` (§4 Phase 1, §3 shared conventions, §8 governance/pins)

## Global Constraints

- Branch `modern/completions-update-check` off `main`; strictly sequential tasks; check `git branch --show-current` before EVERY commit.
- No new runtime or dev dependencies. Update-cache writes reuse `atomicWriteJson` from `src/agent/storage.js`.
- Scripts generated at RUNTIME from the live `program` — no hand-maintained command lists in generators.
- Script → stdout only; install hint and errors → stderr only.
- Update notice → stderr only, TTY-only, suppressed by `PAYWAY_NO_UPDATE_CHECK=1`, never on real commands, never alters exit codes.
- Pins to update in the same change: `COMMAND_GROUPS` (src/cli/ui/help.ts) + `REGISTERED_COMMANDS` (src/__tests__/cli-help.test.ts) + AGENTS.md canonical commands + docs/SDK-AND-CLI-REFERENCE.md + HANDOFF.md + CHANGELOG.md. Agent tool count (14) and skills count (34) UNCHANGED.
- Gates before each commit: `npx vitest run <new tests>`; full gates before the final commit: `npm run build && npm run test && npm run typecheck && npm run lint`.
- Commander facts (verified): `cmd.hidden` is a boolean-ish property (`undefined` when visible) — never call `.hidden()`; `command.options` does NOT include the auto `--help` option — generators append it; auto `--version` exists only on the root.
- In-process test pattern: `process.chdir(tempDir)` BEFORE `await import('../cli.js')`; use `captureConsole()` from `src/test/test-utils.js` (has `.stdout()`, `.stderr()`, `.text()`); save/restore `process.exitCode`.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Verify branch state and create the phase branch**

```bash
git branch --show-current   # expect: main
git status --short          # note pre-existing dirt; commit nothing that isn't ours
git checkout -b modern/completions-update-check
```

Expected: on `modern/completions-update-check` with `main` as base.

---

### Task 1: Completion tree introspection

**Files:**
- Create: `src/cli/completions/introspect.ts`
- Test: `src/__tests__/completions-introspect.test.ts`

**Interfaces:**
- Consumes: commander `Command` (v15).
- Produces: `CompletionOption {long?: string; short?: string; description: string}`, `CompletionCommand {name; description; options: CompletionOption[]; subcommands: CompletionCommand[]}`, `collectCompletionTree(root: Command): CompletionCommand`. Tasks 2–3 consume these types/functions.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/completions-introspect.test.ts
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { collectCompletionTree } from '../cli/completions/introspect.js';

function fixtureProgram(): Command {
  const program = new Command();
  program.name('payway-sdk').description('CLI').version('1.0.0');
  program.option('--profile <name>', 'Use a saved credential profile');
  const qr = program.command('generate-qr').description('Online QR');
  qr.option('-a, --amount <n>', 'Amount to charge');
  const hiddenOpt = program.command('secret').description('Hidden command');
  hiddenOpt.option('--token <t>', 'Do not suggest me');
  hiddenOpt.hideHelp();
  return program;
}

describe('collectCompletionTree', () => {
  it('walks commands, subcommands, and options with long/short/description', () => {
    const tree = collectCompletionTree(fixtureProgram());
    expect(tree.name).toBe('payway-sdk');
    const qr = tree.subcommands.find((c) => c.name === 'generate-qr');
    expect(qr).toBeDefined();
    expect(qr?.description).toBe('Online QR');
    expect(qr?.options).toEqual([{ long: '--amount', short: '-a', description: 'Amount to charge' }]);
    expect(tree.options).toEqual([{ long: '--profile', short: undefined, description: 'Use a saved credential profile' }]);
  });

  it('excludes hidden commands and hidden options', () => {
    const tree = collectCompletionTree(fixtureProgram());
    expect(tree.subcommands.map((c) => c.name)).not.toContain('secret');
  });

  it('keeps a nested subcommand two levels deep', () => {
    const program = new Command();
    const cof = program.command('cof').description('Credentials on file');
    cof.command('token').description('Token lifecycle').option('--request-id <id>', 'Request id');
    const tree = collectCompletionTree(program);
    expect(tree.subcommands[0]?.subcommands[0]?.name).toBe('token');
    expect(tree.subcommands[0]?.subcommands[0]?.options[0]?.long).toBe('--request-id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/completions-introspect.test.ts`
Expected: FAIL — module `../cli/completions/introspect.js` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/cli/completions/introspect.ts
/**
 * Commander-introspection for shell completion generators.
 *
 * Walks a live `Command` tree into plain data so generators never depend on
 * commander types and never duplicate a hand-maintained command list — new
 * commands and flags appear in completions automatically (spec §4.1).
 *
 * Commander facts this module relies on: `command.hidden` is a property
 * (undefined when visible), `command.options` excludes the auto `--help`
 * option, and `summary() || description()` matches how bare-invocation help
 * labels commands (src/cli.ts:923).
 */

import type { Command } from 'commander';

export interface CompletionOption {
  long?: string;
  short?: string;
  description: string;
}

export interface CompletionCommand {
  name: string;
  description: string;
  options: CompletionOption[];
  subcommands: CompletionCommand[];
}

/** Walks the program (root) and all nested commands into a completion tree. */
export function collectCompletionTree(root: Command): CompletionCommand {
  return collect(root);
}

function collect(command: Command): CompletionCommand {
  return {
    name: command.name(),
    description: (command.summary() || command.description()).trim(),
    options: command.options
      .filter((option) => !option.hidden)
      .map((option) => ({
        long: option.long,
        short: option.short,
        description: option.description,
      })),
    subcommands: command.commands.filter((sub) => !sub.hidden).map(collect),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/completions-introspect.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli/completions/introspect.ts src/__tests__/completions-introspect.test.ts
git commit -m "feat(cli): completion-tree introspection over the live commander registry"
```

---

### Task 2: Shell script generators

**Files:**
- Create: `src/cli/completions/generators.ts`
- Test: `src/__tests__/completions-generators.test.ts`

**Interfaces:**
- Consumes: `CompletionCommand`, `CompletionOption` from Task 1.
- Produces: `type CompletionShell = 'bash'|'zsh'|'fish'|'powershell'`; `COMPLETION_SHELLS: readonly CompletionShell[]`; `flattenTree(root: CompletionCommand): FlatEntry[]` where `FlatEntry = { path: string; children: CompletionCommand[]; options: CompletionOption[] }` (root path `''`); `generateCompletionScript(shell: CompletionShell, root: CompletionCommand): string` (throws `Error` on unknown shell); per-shell `generateBashScript/generateZshScript/generateFishScript/generatePowerShellScript(root): string`. Task 3 consumes `COMPLETION_SHELLS` + `generateCompletionScript` + `collectCompletionTree`.

Shared semantics for all four dialects (locked so tests can pin lines):
- Path model: `path` = space-joined command chain (`''` = root, `'payment-link'`, `'cof token'`, `'cof token renew'`).
- Root word in scripts is literally `payway-sdk`.
- Every entry's flag set = its own options ∪ root's options (globals `--profile/--no-color/--journal` inherit), dedup by long flag, plus a synthetic `--help` ("Show help"); root additionally gets `--version`.
- Non-dash completion at a path = that path's child command names; dash completion = that path's flag tokens.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/completions-generators.test.ts
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { collectCompletionTree } from '../cli/completions/introspect.js';
import {
  COMPLETION_SHELLS,
  flattenTree,
  generateBashScript,
  generateCompletionScript,
  generateFishScript,
  generatePowerShellScript,
  generateZshScript,
} from '../cli/completions/generators.js';

function fixtureProgram(): Command {
  const program = new Command();
  program.name('payway-sdk').description('CLI').version('1.0.0');
  program.option('--profile <name>', 'Use a saved credential profile');
  const qr = program.command('generate-qr').description('Online QR');
  qr.option('-a, --amount <n>', "Amount to charge — it's \"quoted\"");
  const link = program.command('payment-link').description('Payment links');
  link.command('create').description('Create a link').option('--title <t>', 'Link title');
  link.command('detail').description('Link detail by id');
  const cof = program.command('cof').description('Credentials on file');
  cof.command('token').description('Token lifecycle');
  return program;
}

describe('flattenTree', () => {
  it('keys entries by command chain with root at empty path', () => {
    const entries = flattenTree(collectCompletionTree(fixtureProgram()));
    const paths = entries.map((entry) => entry.path);
    expect(paths).toEqual(['', 'generate-qr', 'payment-link', 'payment-link create', 'payment-link detail', 'cof', 'cof token']);
  });
});

describe('generateBashScript', () => {
  const script = generateBashScript(collectCompletionTree(fixtureProgram()));

  it('wires the completer to the binary', () => {
    expect(script).toContain('complete -F _payway_sdk payway-sdk');
  });

  it('completes top-level commands and child commands per path', () => {
    expect(script).toContain('case "$w" in (init|generate-qr|payment-link|cof)') // tracking arm for root
      .or // biome/or-free assertion below
      .toContain('generate-qr|payment-link|cof');
    expect(script).toContain('create|detail');
  });

  it('completes per-path flags including inherited globals and --help', () => {
    const qrArm = script.split('\n').find((line) => line.includes('"generate-qr") COMPREPLY'));
    expect(qrArm).toBeDefined();
    expect(qrArm).toContain('-a');
    expect(qrArm).toContain('--amount');
    expect(qrArm).toContain('--profile');
    expect(qrArm).toContain('--help');
  });

  it('keeps the root --version flag only at the root', () => {
    const rootArm = script.split('\n').find((line) => line.includes('"" ) COMPREPLY') || line.includes('") COMPREPLY'));
    expect(rootArm).toContain('--version');
    expect(script.split('\n').filter((line) => line.includes('COMPREPLY') && line.includes('--version'))).toHaveLength(1);
  });
});

describe('generateZshScript', () => {
  const script = generateZshScript(collectCompletionTree(fixtureProgram()));

  it('declares compdef for the binary', () => {
    expect(script).toContain('#compdef payway-sdk');
    expect(script).toContain('compdef _payway_sdk payway-sdk');
  });

  it('carries descriptions with single-quote escaping', () => {
    expect(script).toContain("'generate-qr:Online QR'");
    expect(script).toContain(String.raw`it'\''s "quoted"`);
  });
});

describe('generateFishScript', () => {
  const script = generateFishScript(collectCompletionTree(fixtureProgram()));

  it('disables file completion and emits root children', () => {
    expect(script).toContain('complete -c payway-sdk -f');
    expect(script).toContain("-n '__fish_use_subcommand' -a 'generate-qr'");
  });

  it('scopes subcommand flags with seen_subcommand_from and long+short', () => {
    expect(script).toContain("-n '__fish_seen_subcommand_from generate-qr' -l amount -s a");
  });

  it('guards two-level children against sibling leakage', () => {
    expect(script).toContain(
      "-n '__fish_seen_subcommand_from payment-link; and not __fish_seen_subcommand_from create; and not __fish_seen_subcommand_from detail' -a 'create'",
    );
  });
});

describe('generatePowerShellScript', () => {
  const script = generatePowerShellScript(collectCompletionTree(fixtureProgram()));

  it('registers a native argument completer', () => {
    expect(script).toContain("Register-ArgumentCompleter -CommandName 'payway-sdk' -Native");
  });

  it('completes top-level commands and flags', () => {
    expect(script).toContain("'generate-qr'");
    expect(script).toContain("'--amount'");
  });
});

describe('generateCompletionScript', () => {
  const tree = collectCompletionTree(fixtureProgram());

  it('dispatches every declared shell', () => {
    for (const shell of COMPLETION_SHELLS) {
      expect(generateCompletionScript(shell, tree)).toContain('payway-sdk');
    }
  });

  it('rejects unknown shells with the known list', () => {
    expect(() => generateCompletionScript('tcsh' as never, tree)).toThrow(/bash, zsh, fish, powershell/);
  });
});
```

Note on the bash "completes top-level commands" test: the `.or` chain above is illustrative — write exactly ONE assertion per `it`. Use this final form (drop the `.or` fragment):

```ts
expect(script).toContain('generate-qr|payment-link|cof');
expect(script).toContain('create|detail');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/completions-generators.test.ts`
Expected: FAIL — module `../cli/completions/generators.js` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/cli/completions/generators.ts
/**
 * Shell completion script generators for payway-sdk.
 *
 * All four dialects are emitted from the same flattened command tree
 * (see flattenTree), so the scripts can never drift from the live CLI
 * registry. Semantics locked by spec §4.1:
 *   - non-dash completion at a path → child command names
 *   - dash completion at a path → that path's flags ∪ inherited root globals
 *   - `--help` everywhere; `--version` only at the root
 * Descriptions are shell-escaped per dialect; word lists never need escaping
 * (command names and flags are [a-z0-9-_]).
 */

import type { CompletionCommand, CompletionOption } from './introspect.js';

export type CompletionShell = 'bash' | 'zsh' | 'fish' | 'powershell';

export const COMPLETION_SHELLS: readonly CompletionShell[] = ['bash', 'zsh', 'fish', 'powershell'];

export interface FlatEntry {
  /** Space-joined command chain; '' is the root. */
  path: string;
  children: CompletionCommand[];
  options: CompletionOption[];
}

const HELP_OPTION: CompletionOption = { long: '--help', description: 'Show help' };
const VERSION_OPTION: CompletionOption = { long: '--version', description: 'Show version' };

/** Flattens the tree into path-keyed entries, root first, breadth-first. */
export function flattenTree(root: CompletionCommand): FlatEntry[] {
  const entries: FlatEntry[] = [];
  const visit = (node: CompletionCommand, path: string): void => {
    const options: CompletionOption[] = [];
    const seen = new Set<string>();
    for (const option of node.options) {
      if (option.long && seen.has(option.long)) continue;
      if (option.long) seen.add(option.long);
      options.push(option);
    }
    entries.push({ path, children: node.subcommands, options });
    for (const sub of node.subcommands) visit(sub, path ? `${path} ${sub.name}` : sub.name);
  };
  visit(root, '');
  return entries;
}

/** Flag tokens (short + long) for a path: own options ∪ root globals ∪ --help. */
function flagOptions(entry: FlatEntry, rootOptions: CompletionOption[]): CompletionOption[] {
  const merged: CompletionOption[] = entry.path === '' ? [VERSION_OPTION, ...entry.options] : [...entry.options, ...rootOptions];
  merged.push(HELP_OPTION);
  const seen = new Set<string>();
  return merged.filter((option) => {
    if (!option.long || seen.has(option.long)) return false;
    seen.add(option.long);
    return true;
  });
}

function flagTokens(options: CompletionOption[]): string {
  return options
    .map((option) => [option.short, option.long].filter(Boolean).join(' '))
    .join(' ');
}

/** POSIX single-quote escaping (bash/zsh/fish description strings). */
function shQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

function pathCaseGuard(entry: FlatEntry): string {
  return entry.path === '' ? '' : entry.path;
}

// --- bash -------------------------------------------------------------------

export function generateBashScript(root: CompletionCommand): string {
  const entries = flattenTree(root);
  const [rootEntry] = entries;
  const rootFlags = flagOptions(rootEntry, []);
  const lines: string[] = [
    '# bash completion for payway-sdk (generated by `payway-sdk completions bash`; do not edit)',
    '# Install: source this file from ~/.bashrc',
    '_payway_sdk() {',
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    '  local path=""',
    '  local i w',
    '  for ((i = 1; i < COMP_CWORD; i++)); do',
    '    w="${COMP_WORDS[i]}"',
    '    if [[ "$w" == -* ]]; then continue; fi',
    '    case "$path" in',
  ];
  for (const entry of entries) {
    if (entry.children.length === 0) continue;
    const names = entry.children.map((child) => child.name).join('|');
    const action = entry.path === '' ? 'path="$w"' : `path="$path $w"`;
    lines.push(`      ${pathCaseGuard(entry)}) case "$w" in ${names}) ${action};; esac ;;`);
  }
  lines.push('    esac');
  lines.push('  done');
  lines.push('  if [[ "$cur" == -* ]]; then');
  lines.push('    case "$path" in');
  for (const entry of entries) {
    const flags = flagTokens(flagOptions(entry, rootFlags));
    lines.push(`      ${pathCaseGuard(entry)}) COMPREPLY=( $(compgen -W "${flags}" -- "$cur") ) ;;`);
  }
  lines.push('    esac');
  lines.push('  else');
  lines.push('    case "$path" in');
  for (const entry of entries) {
    if (entry.children.length === 0) continue;
    const names = entry.children.map((child) => child.name).join(' ');
    lines.push(`      ${pathCaseGuard(entry)}) COMPREPLY=( $(compgen -W "${names}" -- "$cur") ) ;;`);
  }
  lines.push('    esac');
  lines.push('  fi');
  lines.push('}');
  lines.push('complete -F _payway_sdk payway-sdk');
  return lines.join('\n');
}

// --- zsh --------------------------------------------------------------------

export function generateZshScript(root: CompletionCommand): string {
  const entries = flattenTree(root);
  const [rootEntry] = entries;
  const rootFlags = flagOptions(rootEntry, []);
  const lines: string[] = [
    '#compdef payway-sdk',
    '# zsh completion for payway-sdk (generated by `payway-sdk completions zsh`; do not edit)',
    '# Install: source this file from ~/.zshrc (after compinit)',
    '_payway_sdk() {',
    '  local cur="$words[CURRENT]"',
    '  local path=""',
    '  local i w',
    '  for (( i = 2; i < CURRENT; i++ )); do',
    '    w="${words[i]}"',
    '    if [[ "$w" == -* ]]; then continue; fi',
    '    case "$path" in',
  ];
  for (const entry of entries) {
    if (entry.children.length === 0) continue;
    const names = entry.children.map((child) => child.name).join('|');
    const action = entry.path === '' ? 'path="$w"' : 'path="$path $w"';
    lines.push(`      ${pathCaseGuard(entry)}) case "$w" in (${names}) ${action} ;; esac ;;`);
  }
  lines.push('    esac');
  lines.push('  done');
  lines.push('  if [[ "$cur" == -* ]]; then');
  lines.push('    case "$path" in');
  for (const entry of entries) {
    const flags = flagOptions(entry, rootFlags)
      .map((option) => `${option.long}:${shQuote(option.description)}`)
      .join(' ');
    lines.push(`      ${pathCaseGuard(entry)})`);
    lines.push('        local -a opts');
    lines.push(`        opts=(${flags})`);
    lines.push("        _describe -o option opts");
    lines.push('        ;;');
  }
  lines.push('    esac');
  lines.push('  else');
  lines.push('    case "$path" in');
  for (const entry of entries) {
    if (entry.children.length === 0) continue;
    const cmds = entry.children.map((child) => `${child.name}:${shQuote(child.description)}`).join(' ');
    lines.push(`      ${pathCaseGuard(entry)})`);
    lines.push('        local -a cmds');
    lines.push(`        cmds=(${cmds})`);
    lines.push("        _describe 'command' cmds");
    lines.push('        ;;');
  }
  lines.push('    esac');
  lines.push('  fi');
  lines.push('}');
  lines.push('compdef _payway_sdk payway-sdk');
  return lines.join('\n');
}

// --- fish -------------------------------------------------------------------

function fishCondition(entry: FlatEntry): string {
  if (entry.path === '') return "'__fish_use_subcommand'";
  const chain = entry.path
    .split(' ')
    .map((segment) => `__fish_seen_subcommand_from ${segment}`)
    .join('; and ');
  const siblings = entry.children.map((child) => `not __fish_seen_subcommand_from ${child.name}`).join('; and ');
  return `'${siblings ? `${chain}; and ${siblings}` : chain}'`;
}

export function generateFishScript(root: CompletionCommand): string {
  const entries = flattenTree(root);
  const [rootEntry] = entries;
  const rootFlags = flagOptions(rootEntry, []);
  const lines: string[] = [
    '# fish completions for payway-sdk (generated by `payway-sdk completions fish`; do not edit)',
    '# Install: save as ~/.config/fish/completions/payway-sdk.fish',
    'complete -c payway-sdk -f',
  ];
  // Root children with the subcommand guard.
  for (const child of rootEntry.children) {
    lines.push(`complete -c payway-sdk -n '__fish_use_subcommand' -a ${shQuote(child.name)} -d ${shQuote(child.description)}`);
  }
  for (const entry of entries) {
    if (entry.path === '') continue;
    for (const child of entry.children) {
      lines.push(`complete -c payway-sdk -n ${fishCondition(entry)} -a ${shQuote(child.name)} -d ${shQuote(child.description)}`);
    }
    const flagScope = entry.path === '' ? '' : `-n '${entry.path.split(' ').map((segment) => `__fish_seen_subcommand_from ${segment}`).join('; and ')}'`;
    for (const option of flagOptions(entry, rootFlags)) {
      const short = option.short ? ` -s ${option.short.replace(/^-/, '')}` : '';
      const desc = option.description ? ` -d ${shQuote(option.description)}` : '';
      lines.push(`complete -c payway-sdk ${flagScope} ${option.long.replace(/^-+/, '').includes('no-') ? '' : ''}-l ${option.long.replace(/^--/, '')}${short}${desc}`.replace(/\s+/g, ' ').trimEnd());
    }
  }
  return lines.join('\n');
}

// --- powershell ---------------------------------------------------------------

export function generatePowerShellScript(root: CompletionCommand): string {
  const entries = flattenTree(root);
  const [rootEntry] = entries;
  const rootFlags = flagOptions(rootEntry, []);
  const ps = (text: string): string => `'${text.replaceAll("'", "''")}'`;
  const lines: string[] = [
    '# PowerShell argument completer for payway-sdk (generated by `payway-sdk completions powershell`; do not edit)',
    '# Install: dot-source this file from your $PROFILE',
    "Register-ArgumentCompleter -CommandName 'payway-sdk' -Native -ScriptBlock {",
    '  param($wordToComplete, $commandAst, $cursorPosition)',
    "  $words = @($commandAst.CommandElements | Select-Object -Skip 1 | ForEach-Object { \"$_\" })",
    "  $path = ''",
    '  foreach ($w in $words) {',
    "    if ($w -like '-*') { continue }",
    '    switch ($path) {',
  ];
  for (const entry of entries) {
    if (entry.children.length === 0) continue;
    const names = entry.children.map((child) => child.name).map(ps).join(', ');
    if (entry.path === '') {
      lines.push(`      '' { if (@(${names}) -contains $w) { $path = $w } }`);
    } else {
      lines.push(`      ${ps(entry.path)} { if (@(${names}) -contains $w) { $path = "$path $w" } }`);
    }
  }
  lines.push('      default { }');
  lines.push('    }');
  lines.push('  }');
  lines.push('  $candidates = @()');
  lines.push("  if ($wordToComplete -like '-*') {");
  lines.push('    switch ($path) {');
  for (const entry of entries) {
    const flags = flagOptions(entry, rootFlags).map((option) => option.long).map(ps).join(', ');
    lines.push(`      ${entry.path === '' ? "''" : ps(entry.path)} { $candidates = @(${flags}) }`);
  }
  lines.push('      default { }');
  lines.push('    }');
  lines.push('  } else {');
  lines.push('    switch ($path) {');
  for (const entry of entries) {
    if (entry.children.length === 0) continue;
    const names = entry.children.map((child) => child.name).map(ps).join(', ');
    lines.push(`      ${entry.path === '' ? "''" : ps(entry.path)} { $candidates = @(${names}) }`);
  }
  lines.push('      default { }');
  lines.push('    }');
  lines.push('  }');
  lines.push('  $candidates |');
  lines.push('    Where-Object { $_ -like "$wordToComplete*" } |');
  lines.push("    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }");
  lines.push('}');
  return lines.join('\n');
}

// --- dispatcher ---------------------------------------------------------------

export function generateCompletionScript(shell: CompletionShell, root: CompletionCommand): string {
  switch (shell) {
    case 'bash':
      return generateBashScript(root);
    case 'zsh':
      return generateZshScript(root);
    case 'fish':
      return generateFishScript(root);
    case 'powershell':
      return generatePowerShellScript(root);
    default:
      throw new Error(`Unknown shell "${String(shell)}". Known shells: ${COMPLETION_SHELLS.join(', ')}.`);
  }
}
```

Cleanup notes for the implementer (apply while writing the file, do not ship these):
- The fish long-flag line contains a leftover no-op ternary `…includes('no-') ? '' : ''}` — write it cleanly as:
  `lines.push(\`complete -c payway-sdk ${flagScope} -l ${option.long.replace(/^--/, '')}${short}${desc}\`.replace(/\\s+/g, ' ').trimEnd());`
- The zsh `_describe` lines use double quotes for the string literal to avoid escaping; either quote style is fine, stay consistent with biome.
- If a fixture assertion proves over-specified against real emission (e.g. exact sibling-guard order), align the TEST with the locked semantics above, never the reverse.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/completions-generators.test.ts src/__tests__/completions-introspect.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/cli/completions/generators.ts src/__tests__/completions-generators.test.ts
git commit -m "feat(cli): bash/zsh/fish/powershell completion generators from the flattened tree"
```

---

### Task 3: `completions` command + registration + pins

**Files:**
- Create: `src/cli/commands/completions.ts`
- Modify: `src/cli.ts` (import block + after `registerWebhookCommands(program);` at ~src/cli.ts:4751)
- Modify: `src/cli/ui/help.ts:15` (COMMAND_GROUPS Setup group)
- Modify: `src/__tests__/cli-help.test.ts` (REGISTERED_COMMANDS)
- Test: `src/__tests__/completions-command.test.ts`

**Interfaces:**
- Consumes: `collectCompletionTree` (Task 1), `COMPLETION_SHELLS` + `generateCompletionScript` (Task 2).
- Produces: `registerCompletionsCommand(program: Command): void` — top-level `completions <shell>` command; unknown shell → stderr message + exit 1; script → stdout; install hint → stderr.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/completions-command.test.ts
/**
 * In-process coverage for `payway-sdk completions <shell>`.
 * Same harness rules as cli-inprocess.test.ts: chdir to an empty temp dir
 * BEFORE importing ../cli.js; save/restore process.exitCode.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-completions-'));
const originalCwd = process.cwd();

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

async function run(argv: string[]): Promise<{ stdout: string; stderr: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { stdout: captured.stdout(), stderr: captured.stderr(), exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('payway-sdk completions', () => {
  it('emits a zsh script on stdout and the install hint on stderr', async () => {
    const { stdout, stderr, exitCode } = await run(['completions', 'zsh']);
    expect(stdout).toContain('#compdef payway-sdk');
    expect(stdout).toContain('transaction-list');
    expect(stderr).toContain('Install');
    expect(exitCode).not.toBe(1);
  });

  it('emits a powershell script on demand', async () => {
    const { stdout } = await run(['completions', 'powershell']);
    expect(stdout).toContain("Register-ArgumentCompleter -CommandName 'payway-sdk' -Native");
  });

  it('rejects unknown shells on stderr with exit 1 (no stdout)', async () => {
    const { stdout, stderr, exitCode } = await run(['completions', 'tcsh']);
    expect(stdout).toBe('');
    expect(stderr).toContain('tcsh');
    expect(stderr).toContain('bash, zsh, fish, powershell');
    expect(exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/completions-command.test.ts`
Expected: FAIL — unknown command 'completions' (commander error, exitCode 1, empty stdout).

- [ ] **Step 3: Implement the command, register it, update the pins**

```ts
// src/cli/commands/completions.ts
import type { Command } from 'commander';
import { COMPLETION_SHELLS, generateCompletionScript } from '../completions/generators.js';
import { collectCompletionTree } from '../completions/introspect.js';

const INSTALL_HINTS: Record<(typeof COMPLETION_SHELLS)[number], string> = {
  bash: 'Install: source this file from ~/.bashrc',
  zsh: 'Install: source this file from ~/.zshrc (after compinit)',
  fish: 'Install: save as ~/.config/fish/completions/payway-sdk.fish',
  powershell: 'Install: dot-source this file from your $PROFILE',
};

/**
 * `payway-sdk completions <shell>` — emits a completion script derived from
 * the live program at request time (no hand-maintained list). Script goes to
 * stdout; the install hint goes to stderr so `| source` flows stay clean.
 */
export function registerCompletionsCommand(program: Command): void {
  program
    .command('completions')
    .description('Emit a shell completion script for payway-sdk (derived from the live command registry)')
    .argument('<shell>', `Target shell: ${COMPLETION_SHELLS.join(' | ')}`)
    .action((shell: string) => {
      if (!(COMPLETION_SHELLS as readonly string[]).includes(shell)) {
        console.error(`  Unknown shell "${shell}". Known shells: ${COMPLETION_SHELLS.join(', ')}.`);
        process.exitCode = 1;
        return;
      }
      const script = generateCompletionScript(shell as (typeof COMPLETION_SHELLS)[number], collectCompletionTree(program));
      process.stdout.write(`${script}\n`);
      console.error(`  ${INSTALL_HINTS[shell as (typeof COMPLETION_SHELLS)[number]]}.`);
    });
}
```

Wiring in `src/cli.ts` — add to the import block (near the other `register*` imports at src/cli.ts:28-44):

```ts
import { registerCompletionsCommand } from './cli/commands/completions.js';
```

and immediately after the existing `registerWebhookCommands(program);` call (src/cli.ts:4751):

```ts
registerCompletionsCommand(program);
```

Pin updates — `src/cli/ui/help.ts:15`, Setup group gains `completions`:

```ts
{ title: 'Setup', commands: ['init', 'doctor', 'config', 'profiles', 'onboard', 'completions'] },
```

`src/__tests__/cli-help.test.ts` — add `'completions',` after `'onboard',` in `REGISTERED_COMMANDS`.

- [ ] **Step 4: Run tests to verify they pass (including the pin test)**

Run: `npx vitest run src/__tests__/completions-command.test.ts src/__tests__/cli-help.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/completions.ts src/cli.ts src/cli/ui/help.ts src/__tests__/cli-help.test.ts src/__tests__/completions-command.test.ts
git commit -m "feat(cli): payway-sdk completions <shell> command; Setup-group help pin"
```

---

### Task 4: Update-check module

**Files:**
- Create: `src/cli/update-check.ts`
- Test: `src/__tests__/update-check.test.ts`

**Interfaces:**
- Consumes: `atomicWriteJson` from `src/agent/storage.js`.
- Produces (Task 5 consumes all):
  - `const UPDATE_CHECK_TTL_MS = 24*60*60*1000`
  - `function getUpdateCheckCachePath(appDataDirectory?: string): string` → `<appdata>/aba-payway-sdk/update-check.json` where appdata defaults to `process.env.APPDATA ?? path.join(homedir(), '.config')`
  - `function isTopLevelHelpArgv(argv: string[]): boolean` — true iff argv is non-empty and every element is `--help`, `-h`, or `help`
  - `function isNewerVersion(current: string, latest: string): boolean`
  - `interface UpdateNoticeStreams { stdout: { isTTY?: boolean }; stderr: { write(chunk: string): unknown } }`
  - `async function maybeNoticeUpdate(options: { argv: string[]; currentVersion: string; env: NodeJS.ProcessEnv; cachePath: string; streams: UpdateNoticeStreams; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/update-check.test.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isTopLevelHelpArgv,
  isNewerVersion,
  maybeNoticeUpdate,
} from '../cli/update-check.js';

function ttyStreams(): { streams: { stdout: { isTTY: boolean }; stderr: { write: (chunk: string) => unknown } }; stderrText: () => string } {
  const chunks: string[] = [];
  return {
    streams: { stdout: { isTTY: true }, stderr: { write: (chunk: string) => chunks.push(chunk) } },
    stderrText: () => chunks.join(''),
  };
}

const BASE = {
  currentVersion: '1.5.0',
  env: {} as NodeJS.ProcessEnv,
  fetchImpl: (async () => {
    throw new Error('unexpected fetch');
  }) as typeof fetch,
  now: () => 1_000_000,
  timeoutMs: 50,
};

describe('isNewerVersion', () => {
  it('compares numerically and handles equal/older', () => {
    expect(isNewerVersion('1.5.0', '1.6.0')).toBe(true);
    expect(isNewerVersion('1.5.0', '1.5.10')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(false);
    expect(isNewerVersion('1.5.0', '1.5.0')).toBe(false);
    expect(isNewerVersion('1.5.0', 'v1.6.0')).toBe(true);
  });
});

describe('isTopLevelHelpArgv', () => {
  it('matches only pure help invocations', () => {
    expect(isTopLevelHelpArgv(['--help'])).toBe(true);
    expect(isTopLevelHelpArgv(['-h'])).toBe(true);
    expect(isTopLevelHelpArgv(['help'])).toBe(true);
    expect(isTopLevelHelpArgv([])).toBe(false);
    expect(isTopLevelHelpArgv(['--help', '--json'])).toBe(false);
    expect(isTopLevelHelpArgv(['generate-qr'])).toBe(false);
  });
});

describe('maybeNoticeUpdate', () => {
  let tempDir: string;
  let cachePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'payway-update-check-'));
    cachePath = path.join(tempDir, 'update-check.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('notices from a fresh cache without fetching and rewrites nothing', async () => {
    writeFileSync(cachePath, `${JSON.stringify({ lastCheck: 0, latestVersion: '2.0.0' })}\n`);
    const { streams, stderrText } = ttyStreams();
    let fetched = false;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl: (async () => { fetched = true; throw new Error('no'); }) as typeof fetch });
    expect(fetched).toBe(false);
    expect(stderrText()).toContain('v1.5.0');
    expect(stderrText()).toContain('v2.0.0');
  });

  it('fetches when stale, persists the cache, and notices', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ version: '1.6.0' }) })) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl });
    expect(stderrText()).toContain('v1.6.0');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(cache.latestVersion).toBe('1.6.0');
    expect(cache.lastCheck).toBe(1_000_000);
  });

  it('stays silent when the fetch fails (no notice, no cache write)', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl });
    expect(stderrText()).toBe('');
    expect(() => readFileSync(cachePath, 'utf8')).toThrow();
  });

  it('stays silent for non-TTY stdout', async () => {
    const chunks: string[] = [];
    const streams = { stdout: { isTTY: false }, stderr: { write: (chunk: string) => chunks.push(chunk) } };
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams });
    expect(chunks.join('')).toBe('');
  });

  it('stays silent when PAYWAY_NO_UPDATE_CHECK=1', async () => {
    const { streams, stderrText } = ttyStreams();
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, env: { PAYWAY_NO_UPDATE_CHECK: '1' } as NodeJS.ProcessEnv });
    expect(stderrText()).toBe('');
  });

  it('never fires on real commands', async () => {
    const { streams, stderrText } = ttyStreams();
    await maybeNoticeUpdate({ ...BASE, argv: ['generate-qr', '-a', '5.00'], cachePath, streams });
    expect(stderrText()).toBe('');
  });

  it('fires on a top-level --help invocation', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ version: '1.6.0' }) })) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: ['--help'], cachePath, streams, fetchImpl });
    expect(stderrText()).toContain('v1.6.0');
  });

  it('does not downgrade when latest is older than current', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ version: '1.4.0' }) })) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl });
    expect(stderrText()).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/update-check.test.ts`
Expected: FAIL — module `../cli/update-check.js` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/cli/update-check.ts
/**
 * Update notifier (spec §4.2).
 *
 * Contract: fires ONLY on a bare `payway-sdk` invocation or a top-level
 * `--help`/`-h`/`help` invocation — never on real commands, so command
 * output purity is untouched by construction. The notice goes to stderr,
 * only when stdout is a TTY, only when PAYWAY_NO_UPDATE_CHECK != '1'.
 * Any fetch/parse failure is silent: the checker can never break a command
 * or alter an exit code. Cache: 24h TTL in the shared aba-payway-sdk
 * app-data dir, written atomically (src/agent/storage.ts).
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWriteJson } from '../agent/storage.js';

export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/aba-payway-ts/latest';

export interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string;
}

export interface UpdateNoticeStreams {
  stdout: { isTTY?: boolean };
  stderr: { write(chunk: string): unknown };
}

export function getUpdateCheckCachePath(appDataDirectory: string = process.env.APPDATA ?? path.join(homedir(), '.config')): string {
  return path.join(appDataDirectory, 'aba-payway-sdk', 'update-check.json');
}

/** True iff argv is a non-empty all-help invocation (`--help`/`-h`/`help`). */
export function isTopLevelHelpArgv(argv: string[]): boolean {
  return argv.length > 0 && argv.every((arg) => arg === '--help' || arg === '-h' || arg === 'help');
}

/** Numeric dotted-version comparison; ignores a leading `v`. Equal → false. */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (version: string): number[] =>
    version
      .replace(/^v/, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function readUpdateCache(cachePath: string): UpdateCheckCache | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as UpdateCheckCache).lastCheck === 'number' &&
      typeof (parsed as UpdateCheckCache).latestVersion === 'string'
    ) {
      return parsed as UpdateCheckCache;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchLatestVersion(fetchImpl: typeof fetch, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetchImpl(REGISTRY_LATEST_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

function notice(streams: UpdateNoticeStreams, currentVersion: string, latestVersion: string): void {
  streams.stderr.write(`  Update available: v${currentVersion} → v${latestVersion} — npm i aba-payway-ts@latest\n`);
}

function noticeIfNewer(streams: UpdateNoticeStreams, currentVersion: string, latestVersion: string | null | undefined): void {
  if (!latestVersion || !isNewerVersion(currentVersion, latestVersion)) return;
  notice(streams, currentVersion, latestVersion);
}

export async function maybeNoticeUpdate(options: {
  argv: string[];
  currentVersion: string;
  env: NodeJS.ProcessEnv;
  cachePath: string;
  streams: UpdateNoticeStreams;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): Promise<void> {
  const { argv, currentVersion, env, cachePath, streams, fetchImpl = fetch, now = Date.now, timeoutMs = 1500 } = options;
  if (env.PAYWAY_NO_UPDATE_CHECK === '1') return;
  if (!streams.stdout.isTTY) return;
  if (argv.length > 0 && !isTopLevelHelpArgv(argv)) return;

  const cached = readUpdateCache(cachePath);
  if (cached && now() - cached.lastCheck < UPDATE_CHECK_TTL_MS) {
    noticeIfNewer(streams, currentVersion, cached.latestVersion);
    return;
  }
  const latest = await fetchLatestVersion(fetchImpl, timeoutMs);
  if (latest) {
    atomicWriteJson(cachePath, { lastCheck: now(), latestVersion: latest } satisfies UpdateCheckCache);
  }
  noticeIfNewer(streams, currentVersion, latest ?? cached?.latestVersion);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/update-check.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli/update-check.ts src/__tests__/update-check.test.ts
git commit -m "feat(cli): silent-failure update checker with 24h cache and strict trigger contract"
```

---

### Task 5: Wire the notice into the direct-invocation paths

**Files:**
- Modify: `src/cli.ts:5170-5198` (`invokedDirectly` block)
- Test: `src/__tests__/update-check-wiring.test.ts`

**Interfaces:**
- Consumes: `maybeNoticeUpdate`, `isTopLevelHelpArgv`, `getUpdateCheckCachePath` (Task 4); `readPackageVersion()` (already in cli.ts:836).
- Produces: nothing new — behavior only. The whole direct-invocation body moves into an async IIFE (tsup also emits `dist/cli.cjs`; top-level `await` would break the CJS build).

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/update-check-wiring.test.ts
/**
 * Child-process proof of the wiring contract: a real dist invocation in a
 * non-TTY environment must NEVER print the update notice (spec §4.2) and
 * must keep the historical bare-invocation behavior (commander help on
 * stderr, exit 1). Requires `npm run build` first (runDistCli spawns dist).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDistCli } from '../test/test-utils.js';

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'payway-update-wiring-'));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('update-notice wiring (dist, non-TTY)', () => {
  it('bare invocation prints no update notice and keeps the legacy exit', async () => {
    const result = await runDistCli([], {
      cwd: tempDir,
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APPDATA: tempDir },
    });
    expect(result.stderr).not.toContain('Update available');
    expect(result.stdout).not.toContain('Update available');
    expect(result.status).toBe(1);
  }, 10_000);

  it('top-level --help prints no update notice in non-TTY', async () => {
    const result = await runDistCli(['--help'], {
      cwd: tempDir,
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APPDATA: tempDir },
    });
    expect(result.stderr).not.toContain('Update available');
  }, 10_000);
});
```

- [ ] **Step 2: Build and run the test to verify it passes pre-wiring (it pins today's behavior), then it must STILL pass post-wiring**

Run: `npm run build && npx vitest run src/__tests__/update-check-wiring.test.ts`
Expected: PASS (this is a regression pin; the positive-path notice behavior is covered by Task 4 unit tests).

- [ ] **Step 3: Modify the `invokedDirectly` block**

Replace `src/cli.ts:5170-5198` (the whole `if (invokedDirectly) { … }` block) with:

```ts
if (invokedDirectly) {
  // Async IIFE, not top-level await: tsup also emits dist/cli.cjs, and
  // top-level await cannot transpile to CJS. All existing behavior —
  // bare-invocation help screen, unknown-command/option suggestions,
  // error printing — is preserved inside the IIFE.
  void (async () => {
    const cliArgs = process.argv.slice(2);
    // Update notice: bare invocation or top-level help ONLY. stderr-only,
    // TTY-only, PAYWAY_NO_UPDATE_CHECK-gated inside maybeNoticeUpdate
    // (src/cli/update-check.ts) — never on real commands, never on stdout.
    if (cliArgs.length === 0 || isTopLevelHelpArgv(cliArgs)) {
      await maybeNoticeUpdate({
        argv: cliArgs,
        currentVersion: readPackageVersion(),
        env: process.env,
        cachePath: getUpdateCheckCachePath(),
        streams: { stdout: process.stdout, stderr: process.stderr },
      });
    }
    if (cliArgs.length === 0 && resolvePromptMode() === 'clack') {
      renderBareInvocationHelp();
      process.exit(0);
    }
    try {
      await runCli(cliArgs);
    } catch (err: unknown) {
      if (err instanceof CliCancelled) {
        console.log('  Cancelled by user.');
        process.exit(130);
      }
      const message = err instanceof Error ? err.message : String(err);
      const unknownOptionMatch = /unknown option '--?([^' ]+)'/.exec(message);
      if (unknownOptionMatch) {
        const suggestion = unknownOptionSuggestion(`--${unknownOptionMatch[1]}`, collectKnownFlags());
        if (suggestion) console.error(`  ${suggestion}`);
      }
      const unknownCommandMatch = /unknown command '?([^' ]+)'?/.exec(message);
      if (unknownCommandMatch) {
        const suggestion = unknownCommandSuggestion(unknownCommandMatch[1], registeredCommandNames());
        if (suggestion) console.error(`  ${suggestion}`);
      }
      console.error(err);
      process.exitCode = 1;
    }
  })();
}
```

And extend the cli.ts import block:

```ts
import { getUpdateCheckCachePath, isTopLevelHelpArgv, maybeNoticeUpdate } from './cli/update-check.js';
```

(Place it next to the other `./cli/…` imports, e.g. after `import { saveQrPng } from './cli/qr-artifact.js';` at src/cli.ts:98.)

- [ ] **Step 4: Build and run the wiring test + the in-process regression files**

Run: `npm run build && npx vitest run src/__tests__/update-check-wiring.test.ts src/__tests__/cli-inprocess.test.ts src/__tests__/completions-command.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/__tests__/update-check-wiring.test.ts
git commit -m "feat(cli): update notice on bare/--help direct invocations only (stderr, IIFE-guarded)"
```

---

### Task 6: Docs, governance pins, full gates

**Files:**
- Modify: `AGENTS.md` (canonical commands block)
- Modify: `docs/SDK-AND-CLI-REFERENCE.md` (append section)
- Modify: `HANDOFF.md` (current-state line)
- Modify: `CHANGELOG.md` (under `## Unreleased`)

- [ ] **Step 1: AGENTS.md — add inside the canonical-commands code block, after the `journal stats` line**

```markdown
# Shell completions (bash|zsh|fish|powershell — derived live from the command registry)
npx tsx src/cli.ts completions zsh > ~/.payway-sdk/payway-sdk.zsh && mkdir -p ~/.payway-sdk 2>/dev/null; source ~/.payway-sdk/payway-sdk.zsh
```

(Exact placement: inside the ```powershell fenced block under "Canonical commands", as its own commented pair like the other entries.)

- [ ] **Step 2: docs/SDK-AND-CLI-REFERENCE.md — append at end of file**

```markdown
## Shell completions & update checks (v1.6.0)

### `payway-sdk completions <shell>`

Emits a completion script for `bash`, `zsh`, `fish`, or `powershell`. Scripts are
derived at request time from the live command registry — new commands and flags
appear automatically; there is no hand-maintained list. The script goes to
**stdout**; the install hint goes to **stderr**, so `payway-sdk completions zsh >
~/.zsh-payway-sdk && source ~/.zsh-payway-sdk` is safe to copy verbatim.

- bash: `complete -F _payway_sdk payway-sdk` (no bash-completion dependency)
- zsh: `#compdef payway-sdk` with per-command descriptions
- fish: universal `complete -c payway-sdk` lines with descriptions
- powershell: `Register-ArgumentCompleter -Native`

### Update checker

On a bare `payway-sdk` invocation or a top-level `--help`, the CLI may print an
update notice (stderr, never stdout) when npm has a newer version than the
installed one. It is cached for 24h in `<appdata>/aba-payway-sdk/update-check.json`
(`%APPDATA%` on Windows, `~/.config` elsewhere), times out after 1.5s, fails
silently offline, never runs for real commands, and is disabled with
`PAYWAY_NO_UPDATE_CHECK=1`. It never changes exit codes.
```

- [ ] **Step 3: HANDOFF.md — add a current-state line**

Insert into the current-state section (top of file, after the version line):

```markdown
- CLI modernization Phase 1 (2026-09-13, branch `modern/completions-update-check`):
  `payway-sdk completions <bash|zsh|fish|powershell>` derives scripts from the live
  commander registry (spec `.scratch/cli-modernization/design.md` §4.1); update
  checker fires only on bare/top-level-help invocations, stderr-only, 24h cache,
  `PAYWAY_NO_UPDATE_CHECK=1` opt-out (§4.2). Pins touched: COMMAND_GROUPS +
  REGISTERED_COMMANDS (+`completions`). Phase 2 = MCP server.
```

- [ ] **Step 4: CHANGELOG.md — add a subsection directly under `## Unreleased`**

```markdown
### CLI modernization Phase 1 (2026-09-13 — `.scratch/cli-modernization/`)

- **`payway-sdk completions <bash|zsh|fish|powershell>`**: shell completion
  scripts derived at request time from the live command registry (no
  hand-maintained list). Script on stdout, install hint on stderr.
- **Update checker**: notices only on bare / top-level-`--help` invocations,
  stderr-only, 24h-cached npm registry check, 1.5s timeout, fails silently,
  `PAYWAY_NO_UPDATE_CHECK=1` opt-out. Never touches command output or exit codes.
```

- [ ] **Step 5: Run the full gates**

Run: `npm run build && npm run test && npm run typecheck && npm run lint`
Expected: all green (suite ~1877 + ~20 new tests).

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/SDK-AND-CLI-REFERENCE.md HANDOFF.md CHANGELOG.md
git commit -m "docs(cli): completions command + update-checker contract; phase-1 handoff pins"
```

---

## Self-review record (writing-plans)

- Spec coverage: §4.1 → Tasks 1–3 (+ pin step in Task 3, docs in Task 6); §4.2 → Tasks 4–5 (trigger contract in Task 4 tests, wiring regression in Task 5); §3 conventions → per-task gates; §8 pins → Tasks 3 & 6. No spec requirement lacks a task.
- Placeholder scan: none — every code step carries complete code; Task 2's fish-line cleanup note gives the exact corrected line.
- Type consistency: `CompletionOption/CompletionCommand` (Task 1) match generator consumption (Task 2); `FlatEntry` used only inside Task 2; `maybeNoticeUpdate/isTopLevelHelpArgv/getUpdateCheckCachePath` signatures (Task 4) match the Task 5 wiring; `registerCompletionsCommand(program)` matches the registration call.
- Known Commander facts verified live on this machine: `command.hidden` is a property; `command.options` excludes auto `--help`; `captureConsole()` exposes `.stdout()/.stderr()/.text()`; `runDistCli(args, {cwd, env})` resolves `{status, stdout, stderr}`; tsup emits esm+cjs for cli.ts (hence the IIFE).
