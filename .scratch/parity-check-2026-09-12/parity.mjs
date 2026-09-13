/**
 * SDK-CLI ↔ SKILLS parity check (2026-09-12).
 *
 * Builds the authoritative command/flag spec by walking the BUILT CLI's own
 * help (`node dist/cli.js <path> --help`), then validates every command
 * invocation found in skills/, .zcode/skills/, and AGENTS.md against it.
 *
 * Read-only: emits a report; does not modify anything.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const CLI = ['node', 'dist/cli.js'];

// ── 1. Build the spec by walking help output ────────────────────────────────
function helpOf(args) {
  try {
    return execFileSync(CLI[0], [...CLI.slice(1), ...args, '--help'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
  } catch (e) {
    return e.stdout ?? '';
  }
}

function parseHelp(text) {
  const lines = text.split(/\r?\n/);
  const options = new Set(); // long names, e.g. --lifetime-minutes
  const shorts = new Map(); // -t -> --transaction-id
  const subcommands = [];
  let section = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(Options|Arguments):/.test(trimmed)) {
      section = trimmed.replace(':', '');
      continue;
    }
    // Custom grouped sections ("Setup:", "Payments:", …) and commander's
    // "Commands:" both list child commands; "Journey examples:" is prose.
    if (/^[A-Z][A-Za-z &]+:$/.test(trimmed)) {
      section = trimmed === 'Journey examples:' ? null : 'Commands';
      continue;
    }
    if (/^$/.test(trimmed)) {
      if (section === 'Commands') section = null;
      continue;
    }
    if (section === 'Options') {
      // Short-first ("-y, --force"), long-first ("--non-interactive, -y"), and
      // bare-long ("--json") declarations all exist in this CLI.
      const m = line.match(
        /^\s+(?:(-(\w)),\s+)?(--[a-z0-9][a-z0-9-]*)(?:,\s+-(\w))?(?:\s+[<[{]|(?:\s{2,}|\s*$))/,
      );
      if (m) {
        options.add(m[3]);
        if (m[2]) shorts.set(`-${m[2]}`, m[3]);
        if (m[4]) shorts.set(`-${m[4]}`, m[3]);
      }
    } else if (section === 'Commands') {
      // Command entries sit at EXACTLY 2 spaces; wrapped continuations indent
      // deeper and must not match. Names may be followed by positional args
      // ("update-status <account>") and/or "[options]".
      const m = line.match(/^ {2}([a-z][a-z0-9-]*)(?:\s|$)/);
      if (m && m[1] !== 'help') subcommands.push(m[1]);
    }
  }
  return { options, shorts, subcommands };
}

function walk(args, spec, depth = 0) {
  const node = parseHelp(helpOf(args));
  spec.path = args.join(' ');
  spec.options = node.options;
  spec.shorts = node.shorts;
  spec.children = {};
  if (depth < 3) {
    for (const sub of node.subcommands) {
      const child = {};
      walk([...args, sub], child, depth + 1);
      spec.children[sub] = child;
    }
  }
  return spec;
}

const root = walk([], {});
const GLOBAL_FLAGS = root.options; // e.g. --version, --journal, --profile, --no-color
// Boolean globals vs value-taking globals (only --profile takes a value today).
const BOOLEAN_GLOBALS = new Set(
  [...root.options].filter((f) => f.startsWith('--no-') || ['--journal', '--version', '--help'].includes(f)),
);

// ── 2. Resolve an invocation against the spec ───────────────────────────────
function resolve(tokens) {
  // Strip leading global flags ("payway-sdk --journal generate-qr ...").
  let start = 0;
  while (start < tokens.length && tokens[start].startsWith('-')) {
    const name = tokens[start].split('=')[0];
    if (!GLOBAL_FLAGS.has(name)) break;
    const takesValue = !BOOLEAN_GLOBALS.has(name) && !tokens[start].includes('=');
    start += takesValue ? 2 : 1;
  }
  let node = root;
  let i = start;
  const pathTaken = [];
  while (i < tokens.length && !tokens[i].startsWith('-')) {
    const child = node.children?.[tokens[i]];
    if (!child) break;
    node = child;
    pathTaken.push(tokens[i]);
    i += 1;
  }
  if (pathTaken.length === 0)
    return { ok: false, problem: 'unknown-command', at: tokens[start] };
  // If we stopped mid-path because the next token isn't a known child, the
  // command exists but we validate flags against the node we reached.
  return { ok: true, node, path: pathTaken.join(' '), rest: tokens.slice(i) };
}

function checkFlags(inv) {
  const problems = [];
  const { node, rest, path } = inv;
  const allowedLong = new Set([...(node?.options ?? []), ...GLOBAL_FLAGS]);
  const shorts = node?.shorts ?? new Map();
  for (let j = 0; j < rest.length; j += 1) {
    const tok = rest[j];
    if (tok === '--') break;
    if (tok.startsWith('--')) {
      const name = tok.split('=')[0];
      if (!allowedLong.has(name)) problems.push(`unknown-option ${name} (for ${path})`);
    } else if (/^-\w$/.test(tok)) {
      const long = shorts.get(tok);
      if (!long && !['-h', '-V'].includes(tok)) problems.push(`unknown-short ${tok} (for ${path})`);
    } // bare values are skipped (placeholders, positionals)
  }
  return problems;
}

// ── 3. Extract invocations from markdown ────────────────────────────────────
const PREFIX =
  /^(?:[-*]\s+)?`{0,3}(?:\$|>|PS>)?\s*(?:\$\{?env:NODE_TLS_REJECT_UNAUTHORIZED='0'\};\s*|NODE_TLS_REJECT_UNAUTHORIZED=0\s+|\$\{env:[^}]+\};\s*)?(?:(?:npx\s+tsx\s+src\/cli\.ts)|(?:node\s+dist\/cli\.js)|(?:payway-sdk)|(?:npm\s+exec\s+--\s+payway-sdk))\s+/;
// Inline-code spans anywhere in a line: `payway-sdk …`, `npx tsx src/cli.ts …`.
const INLINE = /`((?:payway-sdk|npx tsx src\/cli\.ts|node dist\/cli\.js|npm exec -- payway-sdk)[^`\n]+)`/g;

function tokenizeInvocation(text) {
  let rest = text
    .split('`')[0] // stop at a closing markdown backtick — prose follows
    .trim();
  const hashAt = rest.search(/\s#/); // trailing shell comment
  rest = (hashAt >= 0 ? rest.slice(0, hashAt) : rest)
    .replace(/\\$/, '') // shell continuation marker
    .replace(/`+$/, '') // closing markdown backtick
    .trim();
  return rest.split(/\s+/).filter(Boolean);
}

function isTemplateCommand(tokens) {
  const t = tokens[0];
  return t.startsWith('<') || t.includes('}') || t.includes('…') || t === '...';
}

function extractInvocations(text) {
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    // (a) Whole-line invocations: fenced blocks, list items, $/PS prompts.
    const m = rawLine.match(PREFIX);
    if (m) {
      const tokens = tokenizeInvocation(rawLine.slice(m[0].length));
      if (tokens.length && !isTemplateCommand(tokens)) out.push({ line: rawLine.trim(), tokens });
    }
    // (b) Inline-code spans anywhere in a line.
    for (const match of rawLine.matchAll(INLINE)) {
      const inner = match[1].match(PREFIX);
      if (!inner) continue;
      const tokens = tokenizeInvocation(match[1].slice(inner[0].length));
      if (tokens.length && !isTemplateCommand(tokens)) out.push({ line: rawLine.trim(), tokens });
    }
  }
  return out;
}

// ── 4. Scan targets ─────────────────────────────────────────────────────────
function* mdFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) yield* mdFiles(p);
    else if (entry.endsWith('.md')) yield p;
  }
}

const targets = [];
for (const base of ['skills', '.zcode/skills']) {
  if (!existsSync(base)) continue;
  for (const f of mdFiles(base)) {
    if (path.basename(path.dirname(path.dirname(f))) === base || base === '.zcode/skills')
      targets.push({ file: f, tree: base });
  }
}
targets.push({ file: 'AGENTS.md', tree: 'root' });
for (const extra of (process.env.PARITY_EXTRA_FILES ?? '').split(',').filter(Boolean)) {
  targets.push({ file: extra, tree: 'extra' });
}

const findings = [];
let totalInvocations = 0;
for (const t of targets) {
  const text = readFileSync(t.file, 'utf8');
  for (const inv of extractInvocations(text)) {
    totalInvocations += 1;
    const r = resolve(inv.tokens);
    if (!r.ok) {
      findings.push({ file: t.file, line: inv.line, problem: r.problem, detail: r.at });
      continue;
    }
    for (const p of checkFlags(r)) {
      findings.push({ file: t.file, line: inv.line, problem: p, detail: '' });
    }
  }
}

// ── 5. Report ───────────────────────────────────────────────────────────────
console.log(`CLI spec: ${countCommands(root)} command nodes, ${countFlags(root)} distinct flags (+${GLOBAL_FLAGS.size} global)`);
console.log(`Scanned ${targets.length} files, ${totalInvocations} invocations, ${findings.length} problems\n`);
for (const f of findings) {
  console.log(`[${f.problem}] ${f.file}\n    ${f.line.slice(0, 160)}\n    → ${f.detail}\n`);
}

function countCommands(node) {
  let n = 1;
  for (const c of Object.values(node.children ?? {})) n += countCommands(c);
  return n;
}
function countFlags(node) {
  const s = new Set();
  (function acc(n) {
    for (const o of n.options ?? []) s.add(o);
    for (const c of Object.values(n.children ?? {})) acc(c);
  })(node);
  return s.size;
}
