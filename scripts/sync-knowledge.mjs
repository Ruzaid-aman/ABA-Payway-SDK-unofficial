#!/usr/bin/env node
/**
 * Regenerates the packaged knowledge corpus: `knowledge/*.md|json` (curated,
 * user-facing docs), `knowledge/MANIFEST.json` (topic index + content hashes),
 * and the root `llms.txt` (machine-readable corpus index, audit A-2).
 *
 * Run after editing any source doc (`npm run sync:knowledge`).
 * `src/__tests__/knowledge.test.ts` fails when the corpus is stale, so this
 * script is the ONLY way knowledge/ may change — never edit generated files.
 *
 * Transforms applied to each copy so it works BOTH in the repo and inside the
 * npm package:
 *  - relative links that resolve to another corpus doc become
 *    `payway-sdk docs <topic>` (the docs command resolves them offline);
 *  - links into ../skills/… are kept (the package ships skills/ at the same
 *    relative location);
 *  - every other relative link (examples/, internal reports, …) is unwrapped
 *    to its link text;
 *  - the literal string "SANDBOX-FINDINGS.md" loses its .md suffix — the
 *    exact filename is forbidden in packages by check-package-contents.mjs,
 *    while the prose section references stay meaningful.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './knowledge-sources.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

/**
 * Public-corpus provenance gate (audit D01/R03): curated topics may only
 * originate from user-facing directories. Enforced here at generation time
 * AND in src/__tests__/knowledge.test.ts against the written manifest, so an
 * intentionally introduced internal source fails both before and after sync.
 * New public source locations must be added consciously to BOTH gates.
 */
const PUBLIC_SOURCE_PATTERN = /^(?:[^/]+\.(?:md|json)$|docs\/README\.md$|docs\/guides\/|docs\/recipes\/|docs\/reference\/|docs\/error-codes\.json$)/;

export function assertPublicSources(sources) {
  const offenders = sources.filter(({ topic, source }) => {
    const normalized = source.replaceAll('\\', '/');
    return !PUBLIC_SOURCE_PATTERN.test(normalized);
  });
  if (offenders.length) {
    const detail = offenders.map(({ topic, source }) => `${topic} -> ${source}`).join(', ');
    throw new Error(
      `sync-knowledge: knowledge sources must live in public directories (docs/guides|recipes|reference, docs/error-codes.json, or a root *.md) — refusing to package internal content: ${detail}`,
    );
  }
}

/** topic → all link spellings that resolve to its source file. */
function buildTargetMap() {
  const map = new Map();
  for (const { topic, source } of SOURCES) {
    const abs = path.posix.normalize(source.replaceAll('\\', '/'));
    map.set(abs, topic);
    map.set(path.posix.join('docs', path.posix.basename(abs)), topic); // ./xx.md from within docs/
  }
  return map;
}

function rewriteLinks(content, sourcePath, targetMap) {
  const sourceDir = path.posix.dirname(path.posix.normalize(sourcePath.replaceAll('\\', '/')));
  return content.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (full, text, target) => {
    if (/^[a-z]+:/i.test(target) || target.startsWith('#')) return full; // absolute/anchor
    if (target.includes('/skills/')) return full; // resolves inside the package too
    const [local] = target.split('#');
    const resolved = path.posix.normalize(path.posix.join(sourceDir, local));
    const topic = targetMap.get(resolved) ?? targetMap.get(path.posix.basename(resolved));
    if (topic) return `[${text}](payway-sdk docs ${topic})`;
    return text; // unwrap: target has no meaning outside the repo
  });
}

function transform(content, sourcePath, targetMap) {
  let out = content;
  if (sourcePath.endsWith('.md')) out = rewriteLinks(out, sourcePath, targetMap);
  // Normalize skill links for the packaged knowledge copy: docs source files
  // often use '../../skills/...' (relative to docs/guides). When copied into
  // `knowledge/` we want `../skills/...` so the package link checker resolves
  // them inside the package. Do this after rewriteLinks so we only affect
  // generated corpus content.
  out = out.replaceAll('../../skills/', '../skills/');
  return out
    .replaceAll('SANDBOX-FINDINGS.md', 'SANDBOX-FINDINGS')
    .replaceAll('HANDOFF.md', 'the repo HANDOFF');
}

function renderLlmsTxt(manifest) {
  const lines = [
    '# aba-payway-ts',
    '',
    '> ABA PayWay payment-gateway toolkit: a typed TypeScript SDK, an agent-first CLI',
    '> (`payway-sdk`), and 34 installable agent skills — carrying sandbox-verified',
    '> integration knowledge for ABA Bank PayWay (KHQR, hosted checkout, COF, payment',
    '> links, payouts, pre-auth, webhooks).',
    '',
    'Fast path from install to a first paid sandbox transaction:',
    '',
    '```',
    'npm install aba-payway-ts      # SDK + CLI + packaged agent skills',
    'payway-sdk init                # scaffold .env + first-payment template',
    'payway-sdk doctor --live       # prove a real sandbox round-trip',
    'payway-sdk docs quickstart     # full quickstart, served offline by the CLI',
    'payway-sdk onboard             # configure the LLM agent (ask / agent REPL)',
    '```',
    '',
    'Gateway facts most often gotten wrong (all sandbox-verified — see the errors &',
    'debugging guide): `--lifetime` is SECONDS on generate-qr but MINUTES on',
    'generate-checkout (prefer `--lifetime-minutes`); callbacks are single best-effort',
    'delivery with NO guaranteed retry (verify via check-transaction); there is no',
    'EXPIRED status remotely (expired transactions read PENDING forever); split-payout',
    'keys are `{account,amount}` on generate-qr/payout but `{acc,amt}` on',
    'generate-checkout/cof charge/payment-link.',
    '',
    '## Docs',
    '',
    'Every doc below is also served by the CLI itself, offline:',
    '`payway-sdk docs list` · `payway-sdk docs <topic>` · `payway-sdk docs search <query>`',
    '',
  ];
  for (const t of manifest.topics) {
    lines.push(`- [${t.title}](${t.source}): ${t.description}`);
  }
  lines.push(
    '',
    '## Agent integration',
    '',
    // Count from the repo inventory, never a literal — the hardcoded "32"
    // contradicted llms.txt's own 34 (audit D05/stale count pins).
    `- \`payway-sdk skills add <agent>\` — install the ${countPackagedSkills()} packaged skill guides for claude/codex/opencode/cursor/copilot.`,
    '- `payway-sdk ask "<request>"` — single-shot LLM plan with 14 PayWay tools (incl. `query_knowledge`).',
    '- `payway-sdk agent` — interactive REPL; `agent doctor` shows the readiness matrix.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function countPackagedSkills() {
  const skillsDir = path.join(repoRoot, 'skills');
  if (!existsSync(skillsDir)) return 0;
  return readdirSync(skillsDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'),
  ).length;
}

function main() {
  assertPublicSources(SOURCES);
  const knowledgeDir = path.join(repoRoot, 'knowledge');
  rmSync(knowledgeDir, { recursive: true, force: true });
  mkdirSync(knowledgeDir, { recursive: true });

  const targetMap = buildTargetMap();
  const topics = [];
  for (const { topic, source, title, description } of SOURCES) {
    const srcPath = path.join(repoRoot, source);
    if (!existsSync(srcPath)) {
      console.error(`sync-knowledge: missing source ${source} — fix SOURCES in scripts/knowledge-sources.mjs`);
      process.exit(1);
    }
    const raw = readFileSync(srcPath, 'utf8');
    const content = transform(raw, source, targetMap);
    const fileName = topic + path.extname(source);
    const buf = Buffer.from(content, 'utf8');
    writeFileSync(path.join(knowledgeDir, fileName), buf);
    topics.push({
      topic,
      title,
      description,
      source,
      file: fileName,
      bytes: buf.length,
      sha256: hash(buf), // transformed corpus copy (hand-edit detector)
      sourceSha256: hash(Buffer.from(raw, 'utf8')), // raw source (staleness detector)
    });
  }

  const manifest = { schema: 'knowledge-manifest/v1', generator: 'scripts/sync-knowledge.mjs', topics };
  writeFileSync(path.join(knowledgeDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(repoRoot, 'llms.txt'), renderLlmsTxt(manifest));

  const totalKb = Math.round(topics.reduce((sum, t) => sum + t.bytes, 0) / 1024);
  console.log(`knowledge: ${topics.length} topics, ${totalKb} KB → knowledge/ + llms.txt`);
}

main();
