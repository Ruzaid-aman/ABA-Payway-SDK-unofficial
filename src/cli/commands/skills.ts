import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
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

/**
 * Versioned ownership manifest (second-pass audit R3/R4/R7/S1).
 *
 * v1 (legacy): a flat `{ "skill/file": "<baseline-sha256>" }` map. The baseline
 * recorded the hash AT INSTALL TIME, so after a user edit was skipped on
 * upgrade one, the omitted entry vanished from the rewritten manifest and
 * upgrade two silently overwrote the edit (R3); a partial --only install
 * rewrote the manifest with only its own files, dropping ownership of every
 * other installed skill (R4).
 *
 * v2 keeps the flat map for per-file baselines but records baselines for
 * CONFLICTING (user-modified) files too — ownership never lapses — and merges
 * partial-install results into the existing manifest instead of replacing it.
 * The baselines are the PACKAGED hashes: on upgrade, a file whose disk hash
 * differs from the manifest baseline is a user edit regardless of which
 * package version installed it (R7 needs package-vs-installed comparison, not
 * installed-vs-old-manifest).
 */
const MANIFEST_SCHEMA_VERSION = 2;

export interface SkillInstallManifest {
  schemaVersion: number;
  /** Version of the package whose skills/ directory produced this install. */
  packageVersion: string;
  /** skill/relPath → sha256 of the PACKAGED file at install time. */
  files: Record<string, string>;
}

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

/**
 * Load the ownership manifest for an agent dir. Understands both the legacy
 * flat v1 map (upgrade: baselines carry over unchanged — they were install-time
 * hashes, so they are already packaged hashes unless a user edit was skipped)
 * and the v2 envelope. Missing/corrupt = empty manifest.
 */
async function loadManifest(agentDir: string): Promise<SkillInstallManifest> {
  try {
    const raw = JSON.parse(await readFile(path.join(agentDir, MANIFEST_NAME), 'utf8')) as unknown;
    if (raw && typeof raw === 'object' && 'schemaVersion' in raw && 'files' in raw) {
      const parsed = raw as SkillInstallManifest;
      if (parsed.schemaVersion === MANIFEST_SCHEMA_VERSION && parsed.files && typeof parsed.files === 'object') {
        return { schemaVersion: MANIFEST_SCHEMA_VERSION, packageVersion: parsed.packageVersion ?? 'unknown', files: parsed.files };
      }
    }
    // Legacy v1: flat map of relPath → hash.
    if (raw && typeof raw === 'object') {
      return { schemaVersion: MANIFEST_SCHEMA_VERSION, packageVersion: 'legacy', files: raw as Record<string, string> };
    }
  } catch {
    /* missing/corrupt → empty */
  }
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, packageVersion: 'none', files: {} };
}

/** Write the manifest atomically (temp + rename in the same directory). */
async function saveManifest(agentDir: string, manifest: SkillInstallManifest): Promise<void> {
  const tmp = path.join(agentDir, `${MANIFEST_NAME}.tmp-${process.pid}`);
  await writeFile(tmp, JSON.stringify(manifest, null, 2));
  await rename(tmp, path.join(agentDir, MANIFEST_NAME));
}

/**
 * Copy a packaged skill into the destination. Conflicts (user-modified managed
 * files) are reported and SKIPPED unless force=true — a user edit is never
 * silently overwritten — and their packaged baseline hash is still recorded so
 * ownership and edit detection survive every later upgrade (R3).
 */
async function installSkill(
  sourceDir: string,
  destDir: string,
  skillName: string,
  oldManifest: SkillInstallManifest,
  force: boolean,
): Promise<{ files: Record<string, string>; conflicts: string[] }> {
  const skillSource = path.join(sourceDir, skillName);
  const skillDest = path.join(destDir, skillName);
  const files: Record<string, string> = {};
  const conflicts: string[] = [];

  const relFiles = await listFilesRecursive(skillSource);
  for (const rel of relFiles) {
    const abs = path.join(skillDest, rel);
    const expected = oldManifest.files[`${skillName}/${rel}`];
    if (expected !== undefined && existsSync(abs)) {
      const current = await hashFile(abs);
      if (current !== expected) {
        if (!force) {
          conflicts.push(`${skillName}/${rel}`);
          // R3: record the PACKAGED baseline even though we did not copy, so
          // the next upgrade still detects the user edit instead of treating
          // the file as unowned and overwriting it.
          files[`${skillName}/${rel}`] = expected;
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
  /** Package version stamped into the manifest (CLI passes its own; tests default). */
  packageVersion?: string;
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
    // R4: start from the existing manifest and OVERLAY this run's results —
    // a partial (--only) install must not drop ownership of files installed
    // by earlier runs that are still on disk.
    const files: Record<string, string> = { ...oldManifest.files };
    // What THIS run installed/refreshed (prune decisions compare against this,
    // never against the merged manifest).
    const installedThisRun = new Set<string>();
    let conflictCount = 0;

    for (const skillName of skillNames) {
      const { files: skillFiles, conflicts } = await installSkill(skillsDirectory, destDir, skillName, oldManifest, options.force === true);
      Object.assign(files, skillFiles);
      for (const rel of Object.keys(skillFiles)) installedThisRun.add(rel);
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
    // other still-installed skills (F09 upgrade semantics). Retired = the
    // skill is not packaged anymore AND was not (re)installed this run.
    if (!requested) {
      const prunedSkills = new Set<string>();
      for (const owned of Object.keys(oldManifest.files)) {
        const skillDir = owned.split('/')[0];
        if (skillNames.includes(skillDir)) continue;
        delete files[owned]; // ownership does not outlive retired files
        if (!installedThisRun.has(owned)) {
          const abs = path.join(destDir, owned);
          if (existsSync(abs)) {
            await rm(abs, { force: true });
            prunedSkills.add(skillDir);
          }
        }
      }
      // Drop skill directories that no longer hold ANY file — managed or
      // user-added (S1: a user note inside a retired skill keeps the dir).
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

    await saveManifest(destDir, {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      packageVersion: options.packageVersion ?? 'dev',
      files,
    });
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
 * Remove ONLY manifest-owned files. Unmanaged files inside a managed skill
 * directory (user notes, extra scripts) are preserved; managed skill
 * directories are removed only when nothing remains inside them after the
 * owned files are gone (second-pass audit S1). A custom `aba-payway-*`
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
    if (!existsSync(dir)) {
      console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('not installed')}`);
      continue;
    }

    const manifest = await loadManifest(dir);
    const ownedSkills = new Set(Object.keys(manifest.files).map((key) => key.split('/')[0]));

    let removed = 0;
    let preservedFiles = 0;
    // S1: delete exactly the manifest-owned FILES, never a whole directory.
    for (const rel of Object.keys(manifest.files)) {
      const abs = path.join(dir, rel);
      if (existsSync(abs)) {
        await rm(abs, { force: true });
        removed++;
      }
    }
    // Drop managed skill directories that are EMPTY after removing owned files
    // (nothing managed or user-added remains → safe to delete). A directory
    // that still holds user files keeps them.
    for (const skillDir of ownedSkills) {
      const abs = path.join(dir, skillDir);
      try {
        const remaining = await readdir(abs);
        if (remaining.length === 0) await rm(abs, { recursive: true, force: true });
        else preservedFiles += remaining.length;
      } catch {
        // already gone
      }
    }
    await saveManifest(dir, { schemaVersion: MANIFEST_SCHEMA_VERSION, packageVersion: 'removed', files: {} });
    if (removed > 0) {
      console.log(
        `  ${c.red(`Removed ${removed} managed file(s) from ${agent}`)}${preservedFiles > 0 ? c.yellow(` (kept ${preservedFiles} unmanaged file(s) in managed skill dirs)`) : ''}\n`,
      );
    } else {
      console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('no managed skills to remove')}\n`);
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
 * Installation health check (F09 + second-pass audit R7): for each requested
 * agent (or one agent via --agent), verify every packaged skill is present,
 * every SKILL.md parses (frontmatter checked for real, not just its opening
 * delimiter), the scripts the skill bundles actually exist, and classify per
 * file against THREE hashes — package (outdated install), manifest baseline
 * (user-modified), and disk (missing/deleted). A packaged guide that changed
 * upstream reads as outdated, not healthy: the previous doctor compared
 * installed bytes with the OLD manifest only, so it approved stale installs.
 */
export async function doctorSkills(
  skillsDirectory: string,
  options: { agent?: string; dest?: string } = {},
): Promise<boolean> {
  const packagedSkills = await getPackagedSkillNames(skillsDirectory);
  const targets: Array<[string, string]> = options.agent
    ? [[options.agent, options.dest ?? SKILL_AGENT_DIRS[options.agent]]]
    : options.dest
      ? [['(custom)', options.dest]]
      : (Object.entries(SKILL_AGENT_DIRS) as Array<[string, string]>);

  // R7: hash every packaged file ONCE up front — the comparison baseline is
  // the CURRENT package, not the install-time manifest.
  const packageHashes: Record<string, string> = {};
  for (const skillName of packagedSkills) {
    for (const rel of await listFilesRecursive(path.join(skillsDirectory, skillName)).catch(() => [] as string[])) {
      packageHashes[`${skillName}/${rel}`] = await hashFile(path.join(skillsDirectory, skillName, rel));
    }
  }

  /** Parse YAML frontmatter minimally: `name:` and `description:` keys. */
  const parseFrontmatter = (content: string): { name?: string; description?: string } | null => {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    const out: { name?: string; description?: string } = {};
    for (const line of match[1].split(/\r?\n/)) {
      const kv = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
      if (kv && kv[2] === 'name') out.name = kv[3].trim();
      if (kv && kv[2] === 'description') out.description = kv[3].trim();
    }
    return out;
  };

  let allHealthy = true;

  console.log(`\n${c.bold('ABA PayWay Skills Doctor')}\n`);
  console.log(`Packaged skills: ${c.cyan(String(packagedSkills.length))}\n`);

  for (const [agent, directory] of targets) {
    let dirExists = false;
    const issues: string[] = [];

    let agentSkills: string[] = [];
    let manifest: SkillInstallManifest = { schemaVersion: MANIFEST_SCHEMA_VERSION, packageVersion: 'none', files: {} };
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
          const frontmatter = parseFrontmatter(content);
          if (!frontmatter) {
            issues.push(`${skillName}/SKILL.md has no frontmatter block`);
          } else if (!frontmatter.name || !frontmatter.description) {
            issues.push(`${skillName}/SKILL.md frontmatter is missing name/description`);
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
      }

      // Per-file drift classification (R7): manifest baseline = what the
      // installer owns; package hash = what currently ships.
      for (const [rel, baseline] of Object.entries(manifest.files)) {
        const abs = path.join(directory, rel);
        if (!existsSync(abs)) {
          issues.push(`${rel} was deleted since install (stale — re-run skills add)`);
          continue;
        }
        const current = await hashFile(abs).catch(() => null);
        if (current === null) continue;
        if (current !== baseline) {
          // User edit against the recorded baseline (or an edit skipped by an
          // old installer that dropped the entry) — either way: preserved.
          issues.push(`${rel} modified since install (user edit — preserved on upgrade)`);
        } else if (packageHashes[rel] !== undefined && packageHashes[rel] !== baseline) {
          // Disk matches the OLD baseline while the package moved on: the
          // install is outdated. Health-wise this is informational but must
          // NOT report healthy as the old doctor did.
          issues.push(`${rel} is outdated (a newer version ships in the package — re-run skills add)`);
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
