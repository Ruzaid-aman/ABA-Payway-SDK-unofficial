import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addSkills,
  doctorSkills,
  listSkills,
  removeSkills,
  getPackagedSkillNames,
  SKILL_AGENTS,
} from '../cli/commands/skills.js';

/**
 * F09 acceptance: fresh temporary homes, one selected agent, stale script,
 * missing SKILL.md, user-modified guide, custom aba-payway-* directory,
 * upgrade with removed resources. No real user installation is touched —
 * every test installs into an explicit --dest temp directory.
 */

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const REPO_SKILLS = path.resolve(testDirectory, '..', '..', 'skills');
let tmpRoot: string;

function newDest(): string {
  const dir = path.join(tmpRoot, `dest-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeAll(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'skills-f09-'));
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('skills installer (F09)', () => {
  it('SKILL_AGENTS targets the documented OpenCode path', () => {
    expect(SKILL_AGENTS.opencode).toBe(path.join(os.homedir(), '.config', 'opencode', 'skills'));
  });

  it('installs the full catalog into a fresh destination with a manifest', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    const packaged = await getPackagedSkillNames(REPO_SKILLS);
    for (const skill of packaged) {
      expect(existsSync(path.join(dest, skill, 'SKILL.md')), `${skill}/SKILL.md`).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(path.join(dest, '.payway-skills-manifest.json'), 'utf8'));
    // v2 envelope (second-pass audit R3/R4): schema + package version + files.
    expect(manifest.schemaVersion).toBe(2);
    expect(typeof manifest.packageVersion).toBe('string');
    // 32 SKILL.md files + 8 bundled scripts + the outbox adapter reference.
    expect(Object.keys(manifest.files).length).toBe(41);
  });

  it('installs a selected skill bundle only (--only)', async () => {
    const dest = newDest();
    await addSkills(['codex'], REPO_SKILLS, { dest, only: ['aba-payway-refund'] });

    expect(existsSync(path.join(dest, 'aba-payway-refund', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(dest, 'aba-payway-qr', 'SKILL.md'))).toBe(false);
    // The manifest records only the installed skill's files.
    const manifest = JSON.parse(readFileSync(path.join(dest, '.payway-skills-manifest.json'), 'utf8'));
    expect(Object.keys(manifest.files).every((key) => key.startsWith('aba-payway-refund/'))).toBe(true);
  });

  it('rejects unknown skill names in --only', async () => {
    const dest = newDest();
    await expect(addSkills(['claude'], REPO_SKILLS, { dest, only: ['aba-payway-nonexistent'] })).rejects.toThrow(
      /Unknown skill/,
    );
  });

  // R3 (second-pass audit): an edited file must survive TWO or more ordinary
  // upgrades — the v1 installer dropped the skipped entry from the rewritten
  // manifest, so upgrade two silently overwrote the edit.
  it('a user edit survives repeated upgrades without --force (R3)', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    const guide = path.join(dest, 'aba-payway-refund', 'SKILL.md');
    writeFileSync(guide, `${readFileSync(guide, 'utf8')}\n<!-- my local note -->\n`);

    await addSkills(['claude'], REPO_SKILLS, { dest }); // upgrade one
    const afterFirst = readFileSync(guide, 'utf8');
    await addSkills(['claude'], REPO_SKILLS, { dest }); // upgrade two
    const afterSecond = readFileSync(guide, 'utf8');

    expect(afterFirst).toContain('my local note');
    expect(afterSecond).toContain('my local note');
    // The manifest still owns the file and records its PACKAGED baseline.
    const manifest = JSON.parse(readFileSync(path.join(dest, '.payway-skills-manifest.json'), 'utf8'));
    expect(manifest.files['aba-payway-refund/SKILL.md']).toBeTypeOf('string');
  });

  // R4 (second-pass audit): install A+B, then a partial A-only install — B
  // must remain on disk AND in the manifest (ownership and edit protection
  // for B survive partial operations).
  it('a partial --only install keeps other installed skills owned (R4)', async () => {
    const dest = newDest();
    await addSkills(['codex'], REPO_SKILLS, { dest });
    await addSkills(['codex'], REPO_SKILLS, { dest, only: ['aba-payway-refund'] });

    expect(existsSync(path.join(dest, 'aba-payway-qr', 'SKILL.md'))).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(dest, '.payway-skills-manifest.json'), 'utf8'));
    expect(manifest.files['aba-payway-qr/SKILL.md']).toBeTypeOf('string');
    // Ownership still protects a B edit against a later full upgrade.
    const qrGuide = path.join(dest, 'aba-payway-qr', 'SKILL.md');
    writeFileSync(qrGuide, `${readFileSync(qrGuide, 'utf8')}\n<!-- kept note -->\n`);
    await addSkills(['codex'], REPO_SKILLS, { dest, only: ['aba-payway-refund'] }); // partial again
    await addSkills(['codex'], REPO_SKILLS, { dest }); // full upgrade
    expect(readFileSync(qrGuide, 'utf8')).toContain('kept note');
  });

  it('upgrade prunes managed files from a skill that stopped shipping', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    // Forge an old manifest entry for a skill that is not installed this run.
    const manifestPath = path.join(dest, '.payway-skills-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files['aba-payway-legacy-gone/SKILL.md'] = manifest.files['aba-payway-qr/SKILL.md'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    mkdirSync(path.join(dest, 'aba-payway-legacy-gone'), { recursive: true });
    writeFileSync(path.join(dest, 'aba-payway-legacy-gone', 'SKILL.md'), readFileSync(path.join(dest, 'aba-payway-qr', 'SKILL.md')));

    // Re-install the FULL catalog: the forged legacy dir is pruned (it is
    // manifest-owned but no longer ships as a packaged skill).
    await addSkills(['claude'], REPO_SKILLS, { dest });
    expect(existsSync(path.join(dest, 'aba-payway-legacy-gone'))).toBe(false);
  });

  // S1 (second-pass audit): removing a managed skill must not delete user
  // files inside its directory — only manifest-owned files go, and the
  // directory survives if anything remains in it.
  it('remove deletes only owned files and preserves user files inside managed skill dirs (S1)', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    const notes = path.join(dest, 'aba-payway-qr', 'my-notes.md');
    writeFileSync(notes, 'unmanaged user notes');

    await removeSkills(['claude'], { dest });

    // The managed guide is gone; the user's file survives, and so does the
    // directory holding it.
    expect(existsSync(path.join(dest, 'aba-payway-qr', 'SKILL.md'))).toBe(false);
    expect(existsSync(notes)).toBe(true);
    // A custom dir beside the managed skills survives as before (F09).
    const custom = path.join(dest, 'aba-payway-my-custom-tool');
    mkdirSync(path.join(custom), { recursive: true });
    writeFileSync(path.join(custom, 'SKILL.md'), '---\nname: aba-payway-my-custom-tool\ndescription: mine.\n---\n');
    expect(existsSync(custom)).toBe(true);
  });

  // R7 (second-pass audit): doctor must compare the installed bytes with the
  // CURRENT package, not only the old manifest — a packaged guide that
  // changed upstream reads as outdated, not healthy.
  it('doctor flags an outdated install when the package changed after install (R7)', async () => {
    const dest = newDest();
    const source = mkdtempSync(path.join(os.tmpdir(), 'skills-r7-pkg-'));
    try {
      const guide = (v: string) => `---\nname: aba-payway-a\ndescription: R7 fixture\nmetadata:\n  version: 1.0.0\n---\n${v}`;
      mkdirSync(path.join(source, 'aba-payway-a'), { recursive: true });
      writeFileSync(path.join(source, 'aba-payway-a', 'SKILL.md'), guide('old'));

      await addSkills(['codex'], source, { dest });

      // Doctor healthy on a fresh install.
      const originalLog = console.log;
      console.log = () => {};
      let healthy = true;
      try {
        healthy = await doctorSkills(source, { agent: 'codex', dest });
      } finally {
        console.log = originalLog;
      }
      expect(healthy).toBe(true);

      // The package changes; the installed copy stays. Doctor must notice.
      writeFileSync(path.join(source, 'aba-payway-a', 'SKILL.md'), guide('new'));
      const lines: string[] = [];
      console.log = (...args: unknown[]) => lines.push(String(args[0] ?? ''));
      try {
        healthy = await doctorSkills(source, { agent: 'codex', dest });
      } finally {
        console.log = originalLog;
      }
      expect(healthy).toBe(false);
      expect(lines.join('\n')).toContain('outdated');
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  // Legacy manifest migration: a v1 flat map must load with its baselines
  // intact (the v2 loader reads `files` from the flat map).
  it('a legacy flat v1 manifest upgrades in place without losing ownership', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    // Rewrite the manifest in the legacy v1 flat shape.
    const manifestPath = path.join(dest, '.payway-skills-manifest.json');
    const v2 = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(manifestPath, JSON.stringify(v2.files));

    // A partial upgrade merges into the legacy manifest rather than
    // replacing it — B stays owned.
    await addSkills(['claude'], REPO_SKILLS, { dest, only: ['aba-payway-refund'] });
    const reloaded = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(reloaded.schemaVersion).toBe(2);
    expect(reloaded.files['aba-payway-qr/SKILL.md']).toBeTypeOf('string');
  });

  it('doctor reports a missing packaged skill and a deleted managed script (stale)', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    // Simulate staleness: delete one installed skill dir + one bundled script.
    rmSync(path.join(dest, 'aba-payway-refund'), { recursive: true, force: true });
    const scriptPath = path.join(dest, 'aba-payway-customer-qr', 'scripts', 'decode-khqr.cjs');
    if (existsSync(scriptPath)) rmSync(scriptPath, { force: true });

    // doctorSkills prints issues; capture stdout to assert.
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => lines.push(String(args[0] ?? ''));
    let healthy = true;
    try {
      healthy = await doctorSkills(REPO_SKILLS, { agent: 'claude', dest });
    } finally {
      console.log = originalLog;
    }
    expect(healthy).toBe(false);
    expect(lines.join('\n')).toContain('aba-payway-refund');
    expect(lines.join('\n')).toMatch(/decode-khqr\.cjs (missing on disk|was deleted)/);
  });

  it('doctor detects a user-modified managed guide and upgrade preserves it', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    // User edits a managed file.
    const guide = path.join(dest, 'aba-payway-refund', 'SKILL.md');
    writeFileSync(guide, `${readFileSync(guide, 'utf8')}\n<!-- my local note -->\n`);

    // Upgrade (re-add) without --force-skills: the edit survives.
    await addSkills(['claude'], REPO_SKILLS, { dest });
    expect(readFileSync(guide, 'utf8')).toContain('my local note');

    // With --force-skills the packaged content is restored.
    await addSkills(['claude'], REPO_SKILLS, { dest, force: true });
    expect(readFileSync(guide, 'utf8')).not.toContain('my local note');
  }, 30_000);

  it('remove deletes only manifest-owned files and preserves a custom aba-payway-* dir (F09)', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    // A user-created skill sharing the aba-payway- prefix but never installed
    // by this CLI must survive removal.
    const custom = path.join(dest, 'aba-payway-my-custom-tool');
    mkdirSync(path.join(custom), { recursive: true });
    writeFileSync(path.join(custom, 'SKILL.md'), '---\nname: aba-payway-my-custom-tool\ndescription: mine.\n---\n');

    await removeSkills(['claude'], { dest });

    expect(existsSync(path.join(dest, 'aba-payway-qr'))).toBe(false);
    expect(existsSync(custom)).toBe(true);
  });

  it('doctor scoped to one agent does not require the other four directories', async () => {
    const dest = newDest();
    await addSkills(['cursor'], REPO_SKILLS, { dest });

    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => lines.push(String(args[0] ?? ''));
    let healthy = false;
    try {
      healthy = await doctorSkills(REPO_SKILLS, { agent: 'cursor', dest });
    } finally {
      console.log = originalLog;
    }
    expect(healthy).toBe(true);
    expect(lines.join('\n')).not.toContain('claude');
  });

  it('listSkills reports the install for the given destination', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => lines.push(String(args[0] ?? ''));
    try {
      await listSkills({ dest });
    } finally {
      console.log = originalLog;
    }
    expect(lines.join('\n')).toContain('claude');
  });
});
