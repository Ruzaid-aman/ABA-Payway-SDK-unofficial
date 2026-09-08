import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillsDirectory = path.join(testDirectory, '..', '..', 'skills');

/**
 * Frontmatter contract (audit F08, 2026-09-07): top-level fields are limited to
 * `name` + `description` (the skill-creator validator rejects a top-level
 * `version`); skill versioning lives under `metadata.version` as a string.
 * The frontmatter is parsed rather than regex-matched so the test validates
 * the schema, not a fixed field order.
 */
function parseFrontmatter(content: string): { name: string; description: string; metadata: { version: string } } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error('missing frontmatter block');
  const doc = parseDocument(match[1]);
  expect(doc.errors).toEqual([]);
  return doc.toJS({ maxAliasCount: 50 });
}

describe('packaged AI skills', () => {
  it('keeps the tracked skill mirror identical, including scripts and references', async () => {
    const mirror = path.resolve(skillsDirectory, '..', '.zcode', 'skills');
    async function compare(relative: string): Promise<void> {
      const entries = await readdir(path.join(skillsDirectory, relative), { withFileTypes: true });
      expect((await readdir(path.join(mirror, relative))).sort(), relative).toEqual(entries.map((e) => e.name).sort());
      for (const entry of entries) {
        const resource = path.join(relative, entry.name);
        if (entry.isDirectory()) await compare(resource);
        else
          expect(
            (await readFile(path.join(mirror, resource))).equals(await readFile(path.join(skillsDirectory, resource))),
            resource,
          ).toBe(true);
      }
    }
    for (const entry of await readdir(skillsDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('aba-payway-')) await compare(entry.name);
    }
  });
  it('provides 32 discoverable skill guides with quick-start content', async () => {
    const skillDirectories = (await readdir(skillsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
      .map((entry) => entry.name);

    expect(skillDirectories).toHaveLength(32);
    expect(skillDirectories).toContain('aba-payway-transaction-by-merchant-ref');
    expect(skillDirectories).toContain('aba-payway-agent');
    expect(skillDirectories).toContain('aba-payway-first-payment');
    expect(skillDirectories).toContain('aba-payway-customer-qr');
    // Audit S2 additions (sync-audit §6 S2.3): the four capability-gap skills.
    expect(skillDirectories).toContain('aba-payway-cof');
    expect(skillDirectories).toContain('aba-payway-token-lifecycle');
    expect(skillDirectories).toContain('aba-payway-beneficiary');
    expect(skillDirectories).toContain('aba-payway-subscription');
    // Transaction Journal (Phases 1-3 of the transaction-data roadmap).
    expect(skillDirectories).toContain('aba-payway-journal');

    for (const skillDirectory of skillDirectories) {
      const content = await readFile(path.join(skillsDirectory, skillDirectory, 'SKILL.md'), 'utf8');

      // Schema check via parsed frontmatter (F08): top-level fields are exactly
      // name + description — NO top-level `version` (the skill-creator
      // validator rejects it); versioning lives in metadata.version.
      const front = parseFrontmatter(content);
      expect(front.name, `${skillDirectory}: name`).toBe(skillDirectory);
      expect(front.description.length, `${skillDirectory}: description`).toBeGreaterThan(10);
      expect(front.metadata.version, `${skillDirectory}: metadata.version`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(content, `${skillDirectory}: no top-level version`).not.toMatch(/^version:/m);

      // Content contract: each guide is runnable (Quick Start with code) and
      // documents failure handling.
      expect(content).toContain('## Quick Start');
      expect(content).toContain('```');
      expect(content).toContain('## Error Handling');
    }
  });
});
