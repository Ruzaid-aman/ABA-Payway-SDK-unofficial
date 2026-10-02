import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addSkills, doctorSkills, removeSkills } from '../cli/commands/skills.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const name = 'aba-payway-integration';
const source = path.join(root, 'skills', name);

describe('standalone integration skill distribution', () => {
  it.each(['claude', 'codex', 'opencode', 'cursor', 'copilot'])(
    'installs independently for %s with all references/assets',
    async (agent) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'payway-integration-install-'));
      try {
        await addSkills([agent], path.join(root, 'skills'), { only: [name], dest: dir });
        expect(readdirSync(dir).filter((file) => file.startsWith('aba-payway-'))).toEqual([name]);
        expect(await doctorSkills(path.join(root, 'skills'), { agent, dest: dir })).toBe(true);
        await removeSkills([agent], { dest: dir });
        expect(readdirSync(dir).filter((file) => file.startsWith('aba-payway-'))).toEqual([]);
        await addSkills([agent], path.join(root, 'skills'), { dest: dir });
        expect(readdirSync(dir).filter((file) => file.startsWith('aba-payway-'))).toHaveLength(35);
        expect(await doctorSkills(path.join(root, 'skills'), { agent, dest: dir })).toBe(true);
        await removeSkills([agent], { dest: dir });
        expect(readdirSync(dir).filter((file) => file.startsWith('aba-payway-'))).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    30_000,
  );
  it('a manual folder copy has only internal relative resource links and source provenance', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-integration-copy-'));
    try {
      cpSync(source, dir, { recursive: true });
      const files = readdirSync(dir, { recursive: true })
        .map(String)
        .map((file) => file.replaceAll('\\', '/'));
      for (const file of files.filter((file) => file.endsWith('.md'))) {
        const text = readFileSync(path.join(dir, file), 'utf8');
        for (const link of text.matchAll(/\]\(([^)\s]+)\)/g)) {
          if (/^[a-z]+:/i.test(link[1]) || link[1].startsWith('#')) continue;
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), link[1].split('#')[0]));
          expect(files, `${file} -> ${link[1]}`).toContain(target);
        }
      }
      const manifest = JSON.parse(readFileSync(path.join(dir, 'references/MANIFEST.json'), 'utf8'));
      for (const resource of manifest.resources)
        expect(resource.source).toMatch(
          /^(?:docs\/(?:guides|reference|recipes)\/|docs\/README.md$|docs\/error-codes.json$|[^/]+\.md$|examples\/integration-recipes\/[a-z-]+\.ts$)/,
        );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
