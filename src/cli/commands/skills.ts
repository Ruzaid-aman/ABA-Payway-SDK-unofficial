import { createHash } from 'node:crypto';
import { existsSync, type Dirent } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Per-agent install targets (audit F09, 2026-09-07). OpenCode loads skills
 * from ~/.config/opencode/skills per its current docs (checked 2026-09-07) —
 * the legacy ~/.opencode/skills path stays as a fallback hint only.
 */
const SKILL_AGENT_DIRS: Record<string, string> = {
  claude: path.join(homedir(), '.claude', 'skills'),
  codex: path.join(homedir(), '.codex', 'skills'),
  opencode: path.join(homedir(), '.config', 'opencode', 'skills'),
  cursor: path.join(homedir(), '.cursor', 'skills'),
  copilot: path.join(homedir(), '.copilot', 'skills'),
};

/** Legacy install dirs that older releases of this CLI wrote to. */
const LEGACY_SKILL_AGENT_DIRS: Record<string, string> = {
  opencode: path.join(homedir(), '.opencode', 'skills'),
};

export const SKILL_AGENTS = SKILL_AGENT_DIRS;
export type SkillAgent = keyof typeof SKILL_AGENT_DIRS;

/** Manifest file recording which files this CLI owns (name → sha256). */
const MANIFEST_NAME = '.payway-skills-manifest.json';

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function getSkillAgents(agentNames: string[]): SkillAgent[] {
  const invalidAgents = agentNames.filter((agent) => !(agent in SKILL_AGENT_DIRS));
  if (invalidAgents.length > 0) {
    throw new Error(
      `${c.red('Unsupported agent:')} ${invalidAgents.join(', ')}. ${c.dim(`Valid: ${Object.keys(SKILL_AGENT_DIRS).join(', ')}`)}`,
    );
  }
  return agentNames as SkillAgent[];
}

export async function getPackagedSkillNames(skillsDirectory: string): Promise<string[]> {
  // A missing skills directory (e.g. running from a source checkout where the
  // executable's sibling layout doesn't exist) is an empty result, not a crash.
  if (!existsSync(skillsDirectory)) {
    return [];
  }
  const entries = await readdir(skillsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
    .map((entry) => entry.name);
}

/** Recursively list every file under a directory, as relative paths. */
async function listFilesRecursive(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(path.join(root, entry.name), rel)));
    } else {
      files.push(rel);
    }
  }
  return files;
}

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/** Load the ownership manifest for an agent dir (missing/corrupt = empty). */
async function loadManifest(agentDir: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(path.join(agentDir, MANIFEST_NAME), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Write the manifest atomically (temp + rename in the same directory). */
async function saveManifest(agentDir: string, manifest: Record<string, string>): Promise<void> {
  const tmp = path.join(agentDir, `${MANIFEST_NAME}.tmp-${process.pid}`);
  await writeFile(tmp, JSON.stringify(manifest, null, 2));
  await rename(tmp, path.join(agentDir, MANIFEST_NAME));
}

/**
 * Copy a packaged skill into the destination and hash every file it owns.
 * Files the user modified (present in the old manifest with a different
 * hash) are reported and SKIPPED unless force=true — a user edit is never
 * silently overwritten.
 */
async function installSkill(
  sourceDir: string,
  destDir: string,
  skillName: string,
  oldManifest: Record<string, string>,
  force: boolean,
): Promise<{ files: Record<string, string>; conflicts: string[] }> {
  const skillSource = path.join(sourceDir, skillName);
  const skillDest = path.join(destDir, skillName);
  const files: Record<string, string> = {};
  const conflicts: string[] = [];

  const relFiles = await listFilesRecursive(skillSource);
  for (const rel of relFiles) {
    const abs = path.join(skillDest, rel);
    const expected = oldManifest[`${skillName}/${rel}`];
    if (expected !== undefined && existsSync(abs)) {
      const current = await hashFile(abs);
      if (current !== expected) {
        if (!force) {
          conflicts.push(`${skillName}/${rel}`);
          continue; // preserve the user's modification
        }
      }
    }
    await mkdir(path.dirname(abs), { recursive: true });
    await cp(path.join(skillSource, rel), abs, { force: true });
    files[`${skillName}/${rel}`] = await hashFile(abs);
  }
  return { files, conflicts };
}

export interface AddSkillsOptions {
  /** Install only this skill (or comma-separated list) instead of the full catalog. */
  only?: string[];
  /** Overwrite user-modified managed files (reported conflicts). */
  force?: boolean;
  /** Explicit destination directory (overrides the agent's default root). */
  dest?: string;
}

export async function addSkills(agentNames: string[], skillsDirectory: string, options: AddSkillsOptions = {}): Promise<void> {
  const agents = getSkillAgents(agentNames);
  if (agents.length === 0) {
    throw new Error('Specify at least one agent to install skills for.');
  }

  const packaged = await getPackagedSkillNames(skillsDirectory);
  const requested = options.only && options.only.length > 0 ? options.only : undefined;
  const skillNames = requested ? packaged.filter((name) => requested.includes(name)) : packaged;
  const missing = requested ? requested.filter((name) => !packaged.includes(name)) : [];
  if (missing.length > 0) {
    throw new Error(
      `${c.red('Unknown skill(s):')} ${missing.join(', ')}${c.dim(` — packaged: ${packaged.length} skills; see skills/README.md`)}`,
    );
  }
  if (skillNames.length === 0) {
    throw new Error('No packaged skills found to install.');
  }

  for (const agent of agents) {
    const destDir = options.dest ?? SKILL_AGENT_DIRS[agent];
    await mkdir(destDir, { recursive: true });
    const oldManifest = await loadManifest(destDir);
    const manifest: Record<string, string> = {};
    let conflictCount = 0;

    for (const skillName of skillNames) {
      const { files, conflicts } = await installSkill(skillsDirectory, destDir, skillName, oldManifest, options.force === true);
      Object.assign(manifest, files);
      conflictCount += conflicts.length;
      if (conflicts.length > 0) {
        console.log(
          `  ${c.yellow('⚠')} ${c.bold(agent)} ${c.dim('→')} ${skillName} ${c.yellow(`kept ${conflicts.length} user-modified file(s) (use --force-skills to overwrite)`)}`,
        );
      } else {
        console.log(`  ${c.green('✓')} ${c.bold(agent)} ${c.dim('→')} ${skillName}`);
      }
    }

    // Prune manifest-owned files from skills that no longer ship — but only
    // on FULL-catalog installs: a partial (--only) install must never delete
    // other still-installed skills (F09 upgrade semantics).
    if (!requested) {
      const prunedSkills = new Set<string>();
      for (const owned of Object.keys(oldManifest)) {
        const skillDir = owned.split('/')[0];
        if (!skillNames.includes(skillDir) && !manifest[owned]) {
          const abs = path.join(destDir, owned);
          if (existsSync(abs)) {
            await rm(abs, { force: true });
            prunedSkills.add(skillDir);
          }
        }
      }
      // Drop skill directories that no longer hold any managed file.
      for (const skillDir of prunedSkills) {
        const dir = path.join(destDir, skillDir);
        try {
          const remaining = await readdir(dir);
          if (remaining.length === 0) await rm(dir, { recursive: true, force: true });
        } catch {
          // already gone
        }
      }
    }

    await saveManifest(destDir, manifest);
    console.log(
      `  ${c.green(`Installed ${skillNames.length} skill(s) for ${agent}`)}${conflictCount > 0 ? c.yellow(` (${conflictCount} file conflict(s) preserved)`) : ''}\n`,
    );
    const legacy = LEGACY_SKILL_AGENT_DIRS[agent];
    if (legacy && legacy !== destDir && existsSync(legacy)) {
      console.log(
        `  ${c.dim(`Note: an older install exists at ${legacy}; this agent now loads from ${destDir} — remove the legacy copy with: payway-sdk skills remove ${agent} --dest "${legacy}"`)}\n`,
      );
    }
  }
}

/**
 * Remove ONLY manifest-owned skill directories. A custom `aba-payway-*`
 * directory the user created (or a skill never installed through this CLI)
 * is preserved — removal is ownership-scoped, not prefix-scoped (F09).
 */
export async function removeSkills(agentNames: string[], options: { dest?: string } = {}): Promise<void> {
  const agents = getSkillAgents(agentNames);
  if (agents.length === 0) {
    throw new Error('Specify at least one agent to remove skills for.');
  }

  for (const agent of agents) {
    const dir = options.dest ?? SKILL_AGENT_DIRS[agent];
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('not installed')}`);
      continue;
    }

    const manifest = await loadManifest(dir);
    const ownedSkills = new Set(Object.keys(manifest).map((key) => key.split('/')[0]));

    let removed = 0;
    let preserved = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('aba-payway-')) {
        continue;
      }
      if (ownedSkills.has(entry.name)) {
        await rm(path.join(dir, entry.name), { recursive: true, force: true });
        console.log(`  ${c.red('✗')} ${c.bold(agent)} ${c.dim('→')} ${entry.name}`);
        removed++;
      } else {
        preserved++;
      }
    }
    if (removed > 0) {
      await saveManifest(dir, {});
      console.log(
        `  ${c.red(`Removed ${removed} skill(s) from ${agent}`)}${preserved > 0 ? c.dim(` (preserved ${preserved} unmanaged aba-payway-* dir(s))`) : ''}\n`,
      );
    } else {
      console.log(
        `  ${c.dim('○')} ${c.bold(agent)}  ${c.dim(preserved > 0 ? `no managed skills to remove (${preserved} unmanaged aba-payway-* dir(s) preserved)` : 'no ABA PayWay skills to remove')}\n`,
      );
    }
  }
}

export async function listSkills(options: { dest?: string } = {}): Promise<void> {
  for (const [agent, defaultDir] of Object.entries(SKILL_AGENT_DIRS) as Array<[SkillAgent, string]>) {
    const directory = options.dest ?? defaultDir;
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const installed = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
        .map((entry) => entry.name);
      if (installed.length > 0) {
        console.log(
          `  ${c.green('●')} ${c.bold(agent)}  ${c.dim(`${installed.length} skill(s)`)}  ${c.dim(directory)}`,
        );
        for (const name of installed) {
          console.log(`    ${c.dim('├')} ${name}`);
        }
      } else {
        console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('no skills installed')}  ${c.dim(directory)}`);
      }
    } catch {
      console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('directory not found')}  ${c.dim(directory)}`);
    }
  }
}

/**
 * Installation health check (F09): for each requested agent (or one agent via
 * --agent), verify every packaged skill is present, every SKILL.md parses, the
 * scripts the skill bundles actually exist, and managed files match their
 * recorded hashes (stale/modified detection).
 */
export async function doctorSkills(skillsDirectory: string, options: { agent?: string; dest?: string } = {}): Promise<boolean> {
  const packagedSkills = await getPackagedSkillNames(skillsDirectory);
  const targets: Array<[string, string]> = options.agent
    ? [[options.agent, options.dest ?? SKILL_AGENT_DIRS[options.agent]]]
    : options.dest
      ? [['(custom)', options.dest]]
      : (Object.entries(SKILL_AGENT_DIRS) as Array<[string, string]>);

  let allHealthy = true;

  console.log(`\n${c.bold('ABA PayWay Skills Doctor')}\n`);
  console.log(`Packaged skills: ${c.cyan(String(packagedSkills.length))}\n`);

  for (const [agent, directory] of targets) {
    let dirExists = false;
    const issues: string[] = [];

    let agentSkills: string[] = [];
    let manifest: Record<string, string> = {};
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      dirExists = true;
      agentSkills = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
        .map((entry) => entry.name);
      manifest = await loadManifest(directory);

      const missing = packagedSkills.filter((s) => !agentSkills.includes(s));
      if (missing.length > 0) {
        issues.push(`Missing ${missing.length} skill(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`);
      }

      for (const skillName of agentSkills) {
        const skillDir = path.join(directory, skillName);
        const skillSourceDir = path.join(skillsDirectory, skillName);
        try {
          const content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
          if (!content.startsWith('---')) {
            issues.push(`${skillName}/SKILL.md has no frontmatter`);
          }
        } catch {
          issues.push(`${skillName}/SKILL.md not found or unreadable`);
        }
        // Bundled scripts referenced by the guide must exist on disk.
        if (existsSync(skillSourceDir)) {
          const sourceScripts = await listFilesRecursive(path.join(skillSourceDir, 'scripts')).catch(() => [] as string[]);
          for (const script of sourceScripts) {
            if (!existsSync(path.join(skillDir, 'scripts', script))) {
              issues.push(`${skillName}/scripts/${script} missing on disk`);
            }
          }
        }
        // Managed-file drift: hash mismatch = user-modified (info), recorded
        // but absent = deleted (stale install → re-run skills add).
        for (const [rel, expected] of Object.entries(manifest)) {
          if (!rel.startsWith(`${skillName}/`)) continue;
          const abs = path.join(directory, rel);
          if (!existsSync(abs)) {
            issues.push(`${rel} was deleted since install (stale — re-run skills add ${agent})`);
          } else {
            const current = await hashFile(abs).catch(() => null);
            if (current !== null && current !== expected) {
              issues.push(`${rel} modified since install (user edit — preserved on upgrade)`);
            }
          }
        }
      }
    } catch {
      dirExists = false;
    }

    if (!dirExists) {
      console.log(
        `  ${c.red('✗')} ${c.bold(agent)}  ${c.dim('directory missing')} — run ${c.cyan(`payway-sdk skills add ${agent}`)}`,
      );
      allHealthy = false;
    } else if (issues.length > 0) {
      console.log(`  ${c.yellow('⚠')} ${c.bold(agent)}  ${c.yellow(`${issues.length} issue(s)`)}`);
      for (const issue of issues) {
        console.log(`    ${c.dim('├')} ${c.yellow(issue)}`);
      }
      allHealthy = false;
    } else {
      console.log(
        `  ${c.green('✓')} ${c.bold(agent)}  ${c.green(`${agentSkills.length}/${packagedSkills.length} skills installed`)}  ${c.dim(directory)}`,
      );
    }
  }

  console.log();
  if (allHealthy) {
    console.log(`  ${c.green('All checked agents are healthy.')}`);
  } else {
    console.log(
      `  ${c.yellow('Run')} ${c.cyan('payway-sdk skills add <agent>')} ${c.yellow('to install or refresh skills.')}`,
    );
  }
  console.log();
  return allHealthy;
}
