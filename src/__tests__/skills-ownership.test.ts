import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { addSkills, doctorSkills, removeSkills } from '../cli/commands/skills.js';

const root = mkdtempSync(path.join(tmpdir(), 'payway-ownership-'));
const manifestName = '.payway-skills-manifest.json';
const guide = (name: string) => `---\nname: ${name}\ndescription: A temporary installation fixture.\n---\n# Guide\n`;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture(names = ['aba-payway-a']) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const dir = mkdtempSync(path.join(root, 'case-'));
  const source = path.join(dir, 'source');
  const dest = path.join(dir, 'dest');
  mkdirSync(dest);
  for (const name of names) {
    mkdirSync(path.join(source, name), { recursive: true });
    writeFileSync(path.join(source, name, 'SKILL.md'), guide(name));
  }
  return { dir, source, dest, add: (only?: string[]) => addSkills(['codex'], source, { dest, only }) };
}

afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  if (!path.resolve(root).startsWith(`${path.resolve(tmpdir())}${path.sep}payway-ownership-`))
    throw new Error('Unexpected test directory');
  rmSync(root, { recursive: true, force: true });
});

describe('skill ownership and doctor acceptance', () => {
  it.each(['absent', 'corrupt', 'lost-v1-entry', 'lost-v2-entry'])(
    'preserves unowned edits across two upgrades with a %s manifest',
    async (kind) => {
      const f = fixture();
      mkdirSync(path.join(f.dest, 'aba-payway-a'));
      const file = path.join(f.dest, 'aba-payway-a/SKILL.md');
      writeFileSync(file, 'my customization');
      if (kind !== 'absent')
        writeFileSync(
          path.join(f.dest, manifestName),
          kind === 'corrupt'
            ? '{'
            : kind === 'lost-v1-entry'
              ? '{}'
              : JSON.stringify({ schemaVersion: 2, packageVersion: 'old', files: {} }),
        );
      await f.add();
      await f.add();
      expect(readFileSync(file, 'utf8')).toBe('my customization');
      // Uninstall must not acquire ownership of bytes it never installed.
      await removeSkills(['codex'], { dest: f.dest });
      expect(readFileSync(file, 'utf8')).toBe('my customization');
    },
  );

  it('adopts identical unowned files, and overwrites different ones only with explicit force', async () => {
    const f = fixture();
    mkdirSync(path.join(f.dest, 'aba-payway-a'));
    const file = path.join(f.dest, 'aba-payway-a/SKILL.md');
    writeFileSync(file, guide('aba-payway-a'));
    await f.add();
    expect(JSON.parse(readFileSync(path.join(f.dest, manifestName), 'utf8')).files['aba-payway-a/SKILL.md']).toBe(
      digest(guide('aba-payway-a')),
    );
    writeFileSync(file, 'custom');
    await addSkills(['codex'], f.source, { dest: f.dest, force: true });
    expect(readFileSync(file, 'utf8')).toBe(guide('aba-payway-a'));
  });

  it('preserves edited managed files through repeated uninstall and later reinstall', async () => {
    const f = fixture();
    await f.add();
    const file = path.join(f.dest, 'aba-payway-a/SKILL.md');
    writeFileSync(file, 'custom');
    await removeSkills(['codex'], { dest: f.dest });
    await removeSkills(['codex'], { dest: f.dest });
    expect(readFileSync(file, 'utf8')).toBe('custom');
    await f.add();
    expect(readFileSync(file, 'utf8')).toBe('custom');
  });

  it('preserves edits to retired skills during ordinary full upgrades', async () => {
    const f = fixture(['aba-payway-a', 'aba-payway-b']);
    await f.add();
    const file = path.join(f.dest, 'aba-payway-b/SKILL.md');
    writeFileSync(file, 'custom');
    renameSync(path.join(f.source, 'aba-payway-b'), path.join(f.dir, 'retired'));
    await f.add();
    await f.add();
    expect(readFileSync(file, 'utf8')).toBe('custom');
  });

  it('prunes unchanged retired resources inside a retained skill and keeps modified ones', async () => {
    const f = fixture();
    const scripts = path.join(f.source, 'aba-payway-a/scripts');
    mkdirSync(scripts);
    writeFileSync(path.join(scripts, 'old.cjs'), 'old');
    writeFileSync(path.join(scripts, 'edited.cjs'), 'old');
    await f.add();
    writeFileSync(path.join(f.dest, 'aba-payway-a/scripts/edited.cjs'), 'custom');
    renameSync(path.join(scripts, 'old.cjs'), path.join(scripts, 'new.cjs'));
    renameSync(path.join(scripts, 'edited.cjs'), path.join(f.dir, 'retired.cjs'));
    await f.add(['aba-payway-a']);
    expect(existsSync(path.join(f.dest, 'aba-payway-a/scripts/old.cjs'))).toBe(false);
    expect(readFileSync(path.join(f.dest, 'aba-payway-a/scripts/edited.cjs'), 'utf8')).toBe('custom');
    expect(existsSync(path.join(f.dest, 'aba-payway-a/scripts/new.cjs'))).toBe(true);
  });

  it('removes empty nested directories but preserves unowned resources during uninstall', async () => {
    const f = fixture();
    mkdirSync(path.join(f.source, 'aba-payway-a/scripts'));
    writeFileSync(path.join(f.source, 'aba-payway-a/scripts/tool.cjs'), 'tool');
    await f.add();
    await removeSkills(['codex'], { dest: f.dest });
    expect(existsSync(path.join(f.dest, 'aba-payway-a'))).toBe(false);
  });

  it.each([
    'name: [unterminated\ndescription: guide',
    'name: aba-payway-a\ndescription: []',
    'name: aba-payway-a\nname: duplicate\ndescription: guide',
  ])('rejects invalid YAML/schema: %s', async (frontmatter) => {
    const f = fixture();
    writeFileSync(path.join(f.source, 'aba-payway-a/SKILL.md'), `---\n${frontmatter}\n---\n# Guide`);
    await f.add();
    expect(await doctorSkills(f.source, { agent: 'codex', dest: f.dest })).toBe(false);
  });

  it('accepts valid folded YAML descriptions', async () => {
    const f = fixture();
    writeFileSync(
      path.join(f.source, 'aba-payway-a/SKILL.md'),
      '---\nname: aba-payway-a\ndescription: >-\n  A folded description.\n---\n# Guide',
    );
    await f.add();
    expect(await doctorSkills(f.source, { agent: 'codex', dest: f.dest })).toBe(true);
  });

  it('respects an intentional partial selection but detects its deleted guide', async () => {
    const f = fixture(['aba-payway-a', 'aba-payway-b']);
    await f.add(['aba-payway-a']);
    expect(await doctorSkills(f.source, { agent: 'codex', dest: f.dest })).toBe(true);
    rmSync(path.join(f.dest, 'aba-payway-a/SKILL.md'));
    expect(await doctorSkills(f.source, { agent: 'codex', dest: f.dest })).toBe(false);
  });

  it('merges partial selections and retains full-catalog intent across partial updates', async () => {
    const f = fixture(['aba-payway-a', 'aba-payway-b']);
    await f.add(['aba-payway-a']);
    await f.add(['aba-payway-b']);
    expect(await doctorSkills(f.source, { agent: 'codex', dest: f.dest })).toBe(true);
    await f.add();
    await f.add(['aba-payway-a']);
    mkdirSync(path.join(f.source, 'aba-payway-c'));
    writeFileSync(path.join(f.source, 'aba-payway-c/SKILL.md'), guide('aba-payway-c'));
    expect(await doctorSkills(f.source, { agent: 'codex', dest: f.dest })).toBe(false);
  });

  it('reports a missing linked dependency in a partial bundle and missing local references', async () => {
    const f = fixture(['aba-payway-a', 'aba-payway-b']);
    writeFileSync(
      path.join(f.source, 'aba-payway-a/SKILL.md'),
      `${guide('aba-payway-a')}\n[Required B](../aba-payway-b/SKILL.md)\n[Details](references/details.md)`,
    );
    await f.add(['aba-payway-a']);
    expect(await doctorSkills(f.source, { agent: 'codex', dest: f.dest })).toBe(false);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toMatch(
      /missing.*(dependency|reference)|(?:dependency|reference).*missing/i,
    );
  });

  it('does not delete paths outside the install root from an untrusted manifest', async () => {
    const f = fixture();
    const outside = path.join(f.dir, 'notes.md');
    writeFileSync(outside, 'keep');
    writeFileSync(
      path.join(f.dest, manifestName),
      JSON.stringify({ schemaVersion: 2, packageVersion: 'old', files: { '../notes.md': digest('keep') } }),
    );
    await removeSkills(['codex'], { dest: f.dest });
    expect(readFileSync(outside, 'utf8')).toBe('keep');
  });
});
