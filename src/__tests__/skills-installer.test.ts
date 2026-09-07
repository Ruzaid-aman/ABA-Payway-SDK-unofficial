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
    // 32 SKILL.md files + 8 bundled scripts.
    expect(Object.keys(manifest).length).toBe(40);
  });

  it('installs a selected skill bundle only (--only)', async () => {
    const dest = newDest();
    await addSkills(['codex'], REPO_SKILLS, { dest, only: ['aba-payway-refund'] });

    expect(existsSync(path.join(dest, 'aba-payway-refund', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(dest, 'aba-payway-qr', 'SKILL.md'))).toBe(false);
    // The manifest records only the installed skill's files.
    const manifest = JSON.parse(readFileSync(path.join(dest, '.payway-skills-manifest.json'), 'utf8'));
    expect(Object.keys(manifest).every((key) => key.startsWith('aba-payway-refund/'))).toBe(true);
  });

  it('rejects unknown skill names in --only', async () => {
    const dest = newDest();
    await expect(addSkills(['claude'], REPO_SKILLS, { dest, only: ['aba-payway-nonexistent'] })).rejects.toThrow(
      /Unknown skill/,
    );
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
    writeFileSync(guide, readFileSync(guide, 'utf8') + '\n<!-- my local note -->\n');

    // Upgrade (re-add) without --force-skills: the edit survives.
    await addSkills(['claude'], REPO_SKILLS, { dest });
    expect(readFileSync(guide, 'utf8')).toContain('my local note');

    // With --force-skills the packaged content is restored.
    await addSkills(['claude'], REPO_SKILLS, { dest, force: true });
    expect(readFileSync(guide, 'utf8')).not.toContain('my local note');
  });

  it('remove deletes only manifest-owned skills and preserves a custom aba-payway-* dir', async () => {
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

  it('upgrade prunes managed files from a skill that stopped shipping', async () => {
    const dest = newDest();
    await addSkills(['claude'], REPO_SKILLS, { dest });

    // Forge an old manifest entry for a skill that is not installed this run.
    const manifestPath = path.join(dest, '.payway-skills-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const fakeOld = { ...manifest };
    fakeOld['aba-payway-legacy-gone/SKILL.md'] = manifest['aba-payway-qr/SKILL.md'];
    mkdirSync(path.join(dest, 'aba-payway-legacy-gone'), { recursive: true });
    writeFileSync(path.join(dest, 'aba-payway-legacy-gone', 'SKILL.md'), 'legacy');
    writeFileSync(manifestPath, JSON.stringify(fakeOld));

    // Re-install the FULL catalog: the forged legacy dir is pruned (it is
    // manifest-owned but no longer ships as a packaged skill).
    await addSkills(['claude'], REPO_SKILLS, { dest });
    expect(existsSync(path.join(dest, 'aba-payway-legacy-gone'))).toBe(false);
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
