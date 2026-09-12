import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';

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

/** v2 adds package identity to the legacy flat hash map; selection is additive. */
const MANIFEST_SCHEMA_VERSION = 2;

export interface SkillInstallManifest {
  schemaVersion: number;
  /** Version of the package whose skills/ directory produced this install. */
  packageVersion: string;
  /** skill/relPath → sha256 of the PACKAGED file at install time. */
  files: Record<string, string>;
  /** Missing in older manifests; infer their intended skills from owned paths. */
  selection?: { mode: 'all' | 'only'; skills: string[] };
}

const validSkillName = (name: string) => /^aba-payway-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function validOwnedPath(rel: string): boolean {
  const parts = rel.split('/');
  return (
    parts.length > 1 &&
    validSkillName(parts[0]) &&
    parts.every((part) => part !== '' && part !== '.' && part !== '..' && !/[\\:\0]/.test(part))
  );
}

/** Validate manifest paths before touching disk; never follow a nested symlink/junction. */
async function ownedPath(root: string, rel: string): Promise<string> {
  if (!validOwnedPath(rel)) throw new Error(`Invalid skill resource path: ${rel}`);
  let abs = path.resolve(root);
  for (const part of rel.split('/')) {
    abs = path.join(abs, part);
    const stat = await lstat(abs).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Refusing linked skill resource: ${rel}`);
  }
  return abs;
}

/** Remove empty parent directories only, stopping before the install root. */
async function removeEmptyParents(root: string, file: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  let dir = path.dirname(file);
  while (dir !== resolvedRoot && dir.startsWith(`${resolvedRoot}${path.sep}`)) {
    try {
      await rmdir(dir);
    } catch (error) {
      if (['ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    dir = path.dirname(dir);
  }
}

/** A baseline owns only its unchanged bytes. Modified resources remain recoverable. */
async function removeOwnedFile(root: string, rel: string, baseline: string, force = false): Promise<boolean> {
  const abs = await ownedPath(root, rel);
  if (!existsSync(abs)) return true;
  if (!force && (await hashFile(abs)) !== baseline) return false;
  await rm(abs); // no recursive deletion; only this verified owned file
  await removeEmptyParents(root, abs);
  return true;
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
  return entries.filter((entry) => entry.isDirectory() && validSkillName(entry.name)).map((entry) => entry.name);
}

/** Recursively list every file under a directory, as relative paths. */
async function listFilesRecursive(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(path.join(root, entry.name), rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    } else {
      throw new Error(`Unsupported linked or special skill resource: ${rel}`);
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
 * and the v2 envelope. Missing/corrupt ownership never authorizes overwriting.
 */
async function loadManifest(agentDir: string): Promise<SkillInstallManifest> {
  try {
    const raw = JSON.parse(await readFile(path.join(agentDir, MANIFEST_NAME), 'utf8')) as unknown;
    if (isRecord(raw)) {
      const envelope = 'schemaVersion' in raw;
      const input = envelope ? (raw.schemaVersion === MANIFEST_SCHEMA_VERSION ? raw.files : undefined) : raw;
      if (!isRecord(input)) throw new Error('Invalid or unsupported skill manifest');
      const files = Object.fromEntries(
        Object.entries(input).filter(
          ([rel, hash]) => validOwnedPath(rel) && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
        ),
      ) as Record<string, string>;
      const selection = raw.selection;
      const inferred = [...new Set(Object.keys(files).map((rel) => rel.split('/')[0]))];
      return {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        packageVersion: typeof raw.packageVersion === 'string' ? raw.packageVersion : 'legacy',
        files,
        selection:
          isRecord(selection) &&
          (selection.mode === 'all' || selection.mode === 'only') &&
          Array.isArray(selection.skills) &&
          selection.skills.every((name) => typeof name === 'string' && validSkillName(name))
            ? { mode: selection.mode, skills: selection.skills as string[] }
            : inferred.length
              ? { mode: 'only', skills: inferred }
              : undefined,
      };
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
  const files: Record<string, string> = {};
  const conflicts: string[] = [];

  const relFiles = await listFilesRecursive(skillSource);
  for (const rel of relFiles) {
    const key = `${skillName}/${rel}`;
    const abs = await ownedPath(destDir, key);
    const packagedHash = await hashFile(path.join(skillSource, rel));
    const expected = oldManifest.files[key];
    if (existsSync(abs)) {
      const current = await hashFile(abs);
      if (current === packagedHash) {
        files[key] = packagedHash; // safely adopt identical unowned bytes
        continue;
      }
      if (!force && current !== expected) {
        conflicts.push(key);
        if (expected !== undefined) files[key] = expected;
        continue; // unowned conflicts stay unowned; managed conflicts retain their baseline
      }
    }
    await mkdir(path.dirname(abs), { recursive: true });
    await cp(path.join(skillSource, rel), abs, { force: true });
    files[key] = packagedHash;
  }
  return { files, conflicts };
}

export interface AddSkillsOptions {
  /** Install only this skill (or comma-separated list) instead of the full catalog. */
  only?: string[];
  /** Overwrite reported conflicts, including pre-existing unowned files. */
  force?: boolean;
  /** Explicit destination directory (overrides the agent's default root). */
  dest?: string;
  /** Package version stamped into the manifest (CLI passes its own; tests default). */
  packageVersion?: string;
}

export async function addSkills(
  agentNames: string[],
  skillsDirectory: string,
  options: AddSkillsOptions = {},
): Promise<void> {
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
    const packagedThisRun = new Set<string>();
    let conflictCount = 0;

    for (const skillName of skillNames) {
      const { files: skillFiles, conflicts } = await installSkill(
        skillsDirectory,
        destDir,
        skillName,
        oldManifest,
        options.force === true,
      );
      Object.assign(files, skillFiles);
      for (const rel of await listFilesRecursive(path.join(skillsDirectory, skillName)))
        packagedThisRun.add(`${skillName}/${rel}`);
      conflictCount += conflicts.length;
      if (conflicts.length > 0) {
        console.log(
          `  ${c.yellow('⚠')} ${c.bold(agent)} ${c.dim('→')} ${skillName} ${c.yellow(`kept ${conflicts.length} user-modified file(s) (use --force-skills to overwrite)`)}`,
        );
      } else {
        console.log(`  ${c.green('✓')} ${c.bold(agent)} ${c.dim('→')} ${skillName}`);
      }
    }

    // Partial updates prune only resources in selected skills. Full updates
    // also retire entire skills. Both retain edited resources and baselines.
    for (const [owned, baseline] of Object.entries(oldManifest.files)) {
      if (requested && !skillNames.includes(owned.split('/')[0])) continue;
      if (packagedThisRun.has(owned)) continue;
      if (await removeOwnedFile(destDir, owned, baseline, options.force)) {
        delete files[owned];
      } else {
        conflictCount++;
        console.log(`  ${c.yellow('⚠')} Kept modified retired resource: ${owned}`);
      }
    }

    await saveManifest(destDir, {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      packageVersion: options.packageVersion ?? 'dev',
      files,
      selection: {
        mode: !requested || oldManifest.selection?.mode === 'all' ? 'all' : 'only',
        skills: requested ? [...new Set([...(oldManifest.selection?.skills ?? []), ...skillNames])] : skillNames,
      },
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
export async function removeSkills(
  agentNames: string[],
  options: { dest?: string; force?: boolean } = {},
): Promise<void> {
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
    const files = { ...manifest.files };
    let removed = 0;
    let preservedFiles = 0;
    for (const [rel, baseline] of Object.entries(manifest.files)) {
      if (await removeOwnedFile(dir, rel, baseline, options.force)) {
        delete files[rel];
        removed++;
      } else {
        preservedFiles++;
        console.log(`  ${c.yellow('⚠')} Kept modified resource: ${rel}`);
      }
    }
    await saveManifest(dir, {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      packageVersion: 'removed',
      files,
      selection: { mode: 'only', skills: [] },
    });
    if (removed > 0) {
      console.log(
        `  ${c.red(`Removed ${removed} managed file(s) from ${agent}`)}${preservedFiles > 0 ? c.yellow(` (kept ${preservedFiles} modified file(s))`) : ''}\n`,
      );
    } else {
      console.log(
        `  ${c.dim('○')} ${c.bold(agent)}  ${c.dim(`no removable managed files (${preservedFiles} modified file(s) preserved)`)}\n`,
      );
    }
  }
}

/**
 * Discoverability (2026-09-12): summarize an installed skill for `skills list`
 * — frontmatter description (first sentence) + metadata.version, so agents and
 * humans can pick the right guide without opening every SKILL.md.
 */
async function describeInstalledSkill(
  directory: string,
  name: string,
): Promise<{ version?: string; summary?: string }> {
  try {
    const raw = await readFile(path.join(directory, name, 'SKILL.md'), 'utf8');
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) return {};
    const doc = parseDocument(frontmatter[1], { uniqueKeys: true });
    const description = String(doc.get('description') ?? '').trim();
    const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
    return {
      version: String(doc.getIn(['metadata', 'version']) ?? '') || undefined,
      summary: firstSentence.length > 96 ? `${firstSentence.slice(0, 95)}…` : firstSentence || undefined,
    };
  } catch {
    return {};
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
          const { version, summary } = await describeInstalledSkill(directory, name);
          const versionTag = version ? c.dim(` v${version}`) : '';
          console.log(`    ${c.dim('├')} ${name}${versionTag}`);
          if (summary) console.log(`    ${c.dim('│ ')} ${summary}`);
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

      const intendedSkills = manifest.selection?.mode === 'only' ? manifest.selection.skills : packagedSkills;
      const missing = intendedSkills.filter((s) => !agentSkills.includes(s));
      if (missing.length > 0) {
        issues.push(
          `Missing ${missing.length} skill(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`,
        );
      }

      for (const skillName of agentSkills) {
        const skillDir = path.join(directory, skillName);
        const skillSourceDir = path.join(skillsDirectory, skillName);
        try {
          const content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
          if (!match) {
            issues.push(`${skillName}/SKILL.md has no frontmatter block`);
          } else {
            const doc = parseDocument(match[1], { uniqueKeys: true });
            if (doc.errors.length) {
              issues.push(`${skillName}/SKILL.md has invalid YAML frontmatter`);
            } else {
              const frontmatter: unknown = doc.toJS({ maxAliasCount: 50 });
              if (
                !isRecord(frontmatter) ||
                frontmatter.name !== skillName ||
                typeof frontmatter.description !== 'string' ||
                !frontmatter.description.trim()
              ) {
                issues.push(`${skillName}/SKILL.md requires a matching name and a nonempty string description`);
              }
            }
          }
          // Check skill-local resources and cross-skill links. Repository-only
          // documentation links are outside the installed-skill contract.
          for (const link of content.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g)) {
            const target = link[1].split('#')[0];
            const local = /^(?:\.\/)?(?:references|scripts|assets)\//.test(target);
            const dependency = /^\.\.\/aba-payway-[^/]+\//.test(target);
            if (!(local || dependency)) continue;
            const rel = path.relative(directory, path.resolve(skillDir, target)).split(path.sep).join('/');
            const abs = await ownedPath(directory, rel);
            if (!existsSync(abs))
              issues.push(`${skillName}: missing ${dependency ? 'dependency' : 'reference'} ${target}`);
          }
        } catch {
          issues.push(`${skillName}/SKILL.md not found or unreadable`);
        }
        // Bundled scripts referenced by the guide must exist on disk.
        if (existsSync(skillSourceDir)) {
          const sourceScripts = await listFilesRecursive(path.join(skillSourceDir, 'scripts')).catch(
            () => [] as string[],
          );
          for (const script of sourceScripts) {
            if (!existsSync(path.join(skillDir, 'scripts', script))) {
              issues.push(`${skillName}/scripts/${script} missing on disk`);
            }
          }
        }
      }

      // New packaged resources and unowned guides are not necessarily present
      // in the old manifest. Compare the selected package files as well.
      for (const [rel, packagedHash] of Object.entries(packageHashes)) {
        if (!intendedSkills.includes(rel.split('/')[0]) || manifest.files[rel] !== undefined) continue;
        const abs = await ownedPath(directory, rel);
        if (!existsSync(abs)) issues.push(`${rel} missing from selected installation`);
        else if ((await hashFile(abs)) !== packagedHash)
          issues.push(`${rel} is an unowned conflict (preserved on upgrade)`);
      }

      // Per-file drift classification (R7): manifest baseline = what the
      // installer owns; package hash = what currently ships.
      for (const [rel, baseline] of Object.entries(manifest.files)) {
        const abs = await ownedPath(directory, rel);
        if (!existsSync(abs)) {
          issues.push(`${rel} was deleted since install (stale — re-run skills add)`);
          continue;
        }
        const current = await hashFile(abs).catch(() => null);
        if (current === null) continue;
        if (packageHashes[rel] === undefined) {
          issues.push(
            `${rel} is retired${current !== baseline ? ' and modified (preserved)' : ' — re-run skills add'}`,
          );
        } else if (current !== baseline) {
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
