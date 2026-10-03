#!/usr/bin/env node
// Regenerates questions.json (and seeds answers/ANSWERS.md on first run) from QUESTIONNAIRE.md.
// The page is the single source of truth; never hand-edit questions.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, 'QUESTIONNAIRE.md'), 'utf8');

const headerRe = /^#### (T-\d{2}) — \[(P0|P1|P2)\] (.+?) \(register: ([^)]+)\)\s*$/gm;
const questions = [];
for (const m of md.matchAll(headerRe)) {
  const [, id, priority, topic, register] = m;
  const rest = md.slice(m.index + m[0].length);
  const fence = rest.match(/```text\n([\s\S]*?)```/);
  if (!fence) throw new Error('No ```text block after ' + id);
  questions.push({
    id,
    priority,
    topic: topic.trim(),
    register: register.trim() === 'none' ? '' : register.trim(),
    text: fence[1].trim(),
  });
}

const counts = questions.reduce((acc, q) => ((acc[q.priority] = (acc[q.priority] ?? 0) + 1), acc), {});
writeFileSync(join(here, 'questions.json'), JSON.stringify(questions, null, 2) + '\n');
console.log(`questions.json written: ${questions.length} messages`, counts);

// Seed the capture template only when absent — once a run starts, answers/ANSWERS.md belongs to the run.
const answersPath = join(here, 'answers', 'ANSWERS.md');
if (existsSync(answersPath)) {
  console.log('answers/ANSWERS.md exists — left untouched.');
} else {
  const board = questions
    .map((q) => `| ${q.id} | ${q.priority} | ${q.register || '—'} | ☐ | ☐ | |`)
    .join('\n');
  const template = `# Telegram answer capture — ABA PayWay questionnaire

**Run date:** <fill> · **Protocol:** ../QUESTIONNAIRE.md §5–§6 · **Raw replies:** raw/<T-id>.md (verbatim)

**Summary at end of run:** answered <n> / partial <n> / no answer <n>

## Status board

| ID | P | Register | Asked | Answered | Notes |
|---|---|---|---|---|---|
${board}

## Per-question capture

<!-- Append one section per ID using the template in ../QUESTIONNAIRE.md §6.
     Never paraphrase numbers/codes in extracted facts; keep raw replies verbatim in raw/. -->
`;
  writeFileSync(answersPath, template);
  console.log('answers/ANSWERS.md seeded with status board.');
}
