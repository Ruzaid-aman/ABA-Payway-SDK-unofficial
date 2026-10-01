#!/usr/bin/env node
/**
 * Regenerates the packaged knowledge corpus: `knowledge/*.md|json` (curated,
 * user-facing docs), `knowledge/MANIFEST.json` (topic index + content hashes),
 * the readable docs-packaged routes and bounded starter, and the root llms.txt.
 *
 * Run after editing any source doc (`npm run sync:knowledge`).
 * `src/__tests__/knowledge.test.ts` fails when the corpus is stale, so this
 * script is the ONLY way knowledge/ and docs-packaged/ may change — never edit generated files.
 *
 * Transforms applied to each copy so it works BOTH in the repo and inside the
 * npm package:
 *  - relative links that resolve to another corpus doc become
 *    real relative knowledge-file links, preserving section anchors;
 *  - skill and root README links are rebased for the generated location;
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
import ts from 'typescript';
import { generateIntegrationSkill } from './lib/integration-skill.mjs';

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
    const [local, anchor] = target.split('#');
    const resolved = path.posix.normalize(path.posix.join(sourceDir, local));
    if (resolved.startsWith('skills/')) return `[${text}](../${resolved}${anchor ? '#' + anchor : ''})`;
    if (resolved === 'README.md') return `[${text}](../README.md${anchor ? '#' + anchor : ''})`;
    const topic = targetMap.get(resolved) ?? targetMap.get(path.posix.basename(resolved));
    if (topic) {
      const source = SOURCES.find((entry) => entry.topic === topic);
      return `[${text}](${topic}${path.posix.extname(source.source)}${anchor ? '#' + anchor : ''})`;
    }
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
    .replaceAll('HANDOFF.md', 'the repo HANDOFF')
    .replace(/[ \t]+$/gm, '');
}

function renderLlmsTxt(manifest) {
  const lines = [
    '# aba-payway-ts',
    '',
    '> ABA PayWay payment-gateway toolkit: a typed TypeScript SDK, an agent-first CLI',
    `> (\`payway-sdk\`), and ${countPackagedSkills()} installable agent skills — carrying sandbox-verified`,
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
    lines.push(`- [${t.title}](knowledge/${t.file}): ${t.description}`);
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
  writeFileSync(path.join(repoRoot, 'llms.txt'), renderLlmsTxt(manifest));
  const generated = [{ file: 'llms.txt', sha256: hash(readFileSync(path.join(repoRoot, 'llms.txt'))) }];

  // Readable package routes are generated from the SAME public sources.
  const packagedDir = path.resolve(repoRoot, 'docs-packaged');
  if (path.dirname(packagedDir) !== repoRoot) throw new Error('Unsafe packaged docs path');
  rmSync(packagedDir, { recursive: true, force: true });
  for (const entry of SOURCES.filter(({ source }) => source.startsWith('docs/') && source.endsWith('.md'))) {
    const relative = entry.source.replace(/^docs\//, '');
    const destination = path.join(packagedDir, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    const knowledge = readFileSync(path.join(knowledgeDir, entry.topic + '.md'), 'utf8');
    const rebased = knowledge.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (full, label, target) => {
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) return full;
      const [local, anchor] = target.split('#');
      const absolute = path.posix.normalize(path.posix.join('knowledge', local));
      return `[${label}](${path.posix.relative(path.posix.dirname('docs-packaged/' + relative), absolute)}${anchor ? '#' + anchor : ''})`;
    });
    writeFileSync(destination, rebased);
    generated.push({ file: 'docs-packaged/' + relative, sha256: hash(Buffer.from(rebased)) });
  }
  // Deliberately bounded teaching-app payload: no .env, captured store, vendor,
  // lockfile, or repository setup scripts. Self-import resolves this package.
  for (const relative of ['src/main.ts', 'src/payments.ts', 'src/server.ts', 'src/store.ts', 'public/index.html']) {
    const destination = path.join(packagedDir, 'starter', relative.replace(/^src\//, 'app/').replace(/\.ts$/, '.js'));
    mkdirSync(path.dirname(destination), { recursive: true });
    const source = 'examples/first-payment/' + relative;
    if (relative.endsWith('.ts')) {
      const output = ts.transpileModule(readFileSync(path.join(repoRoot, source), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText.replace(/(from\s+['"]\.\/[^'"]+)\.ts(['"])/g, '$1.js$2');
      writeFileSync(destination, output);
    } else copyFileSync(path.join(repoRoot, source), destination);
    generated.push({ file: path.relative(repoRoot, destination).replaceAll('\\', '/'), source,
      sourceSha256: hash(readFileSync(path.join(repoRoot, source))), sha256: hash(readFileSync(destination)) });
  }
  generated.push(...generateIntegrationSkill(repoRoot, topics));
  // Canonical skill resources and their tracked installed mirror move together.
  const canonicalSkill = path.join(repoRoot, 'skills/aba-payway-integration');
  const mirrorSkill = path.join(repoRoot, '.zcode/skills/aba-payway-integration');
  if (path.dirname(mirrorSkill) !== path.join(repoRoot, '.zcode/skills')) throw new Error('Unsafe skill mirror root');
  rmSync(mirrorSkill, { recursive: true, force: true });
  mkdirSync(mirrorSkill, { recursive: true });
  for (const relative of ['SKILL.md', ...generated.filter(entry => entry.file.startsWith('skills/aba-payway-integration/'))
    .map(entry => entry.file.replace('skills/aba-payway-integration/', ''))]) {
    mkdirSync(path.dirname(path.join(mirrorSkill, relative)), { recursive: true });
    copyFileSync(path.join(canonicalSkill, relative), path.join(mirrorSkill, relative));
  }
  manifest.generated = generated;
  writeFileSync(path.join(knowledgeDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const totalKb = Math.round(topics.reduce((sum, t) => sum + t.bytes, 0) / 1024);
  console.log(`knowledge: ${topics.length} topics, ${totalKb} KB → knowledge/ + llms.txt`);
}

main();
