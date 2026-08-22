import type { Dirent } from 'node:fs';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const SKILL_AGENTS = {
  claude: path.join(homedir(), '.claude', 'skills'),
  codex: path.join(homedir(), '.codex', 'skills'),
  opencode: path.join(homedir(), '.opencode', 'skills'),
  cursor: path.join(homedir(), '.cursor', 'skills'),
  copilot: path.join(homedir(), '.copilot', 'skills'),
} as const;

export type SkillAgent = keyof typeof SKILL_AGENTS;

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function getSkillAgents(agentNames: string[]): SkillAgent[] {
  const invalidAgents = agentNames.filter((agent) => !(agent in SKILL_AGENTS));
  if (invalidAgents.length > 0) {
    throw new Error(
      `${c.red('Unsupported agent:')} ${invalidAgents.join(', ')}. ${c.dim(`Valid: ${Object.keys(SKILL_AGENTS).join(', ')}`)}`,
    );
  }
  return agentNames as SkillAgent[];
}

export async function getPackagedSkillNames(skillsDirectory: string): Promise<string[]> {
  const entries = await readdir(skillsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
    .map((entry) => entry.name);
}

export async function addSkills(agentNames: string[], skillsDirectory: string): Promise<void> {
  const agents = getSkillAgents(agentNames);
  if (agents.length === 0) {
    throw new Error('Specify at least one agent to install skills for.');
  }

  const skillNames = await getPackagedSkillNames(skillsDirectory);
  for (const agent of agents) {
    await mkdir(SKILL_AGENTS[agent], { recursive: true });
    for (const skillName of skillNames) {
      await cp(path.join(skillsDirectory, skillName), path.join(SKILL_AGENTS[agent], skillName), {
        recursive: true,
        force: true,
      });
      console.log(`  ${c.green('✓')} ${c.bold(agent)} ${c.dim('→')} ${skillName}`);
    }
    console.log(`  ${c.green(`Installed ${skillNames.length} skill(s) for ${agent}`)}\n`);
  }
}

export async function removeSkills(agentNames: string[]): Promise<void> {
  const agents = getSkillAgents(agentNames);
  if (agents.length === 0) {
    throw new Error('Specify at least one agent to remove skills for.');
  }

  for (const agent of agents) {
    let entries: Dirent[];
    try {
      entries = await readdir(SKILL_AGENTS[agent], { withFileTypes: true });
    } catch {
      console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('not installed')}`);
      continue;
    }

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('aba-payway-')) {
        continue;
      }
      await rm(path.join(SKILL_AGENTS[agent], entry.name), { recursive: true, force: true });
      console.log(`  ${c.red('✗')} ${c.bold(agent)} ${c.dim('→')} ${entry.name}`);
      removed++;
    }
    if (removed > 0) {
      console.log(`  ${c.red(`Removed ${removed} skill(s) from ${agent}`)}\n`);
    } else {
      console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('no ABA PayWay skills to remove')}\n`);
    }
  }
}

export async function listSkills(): Promise<void> {
  for (const [agent, directory] of Object.entries(SKILL_AGENTS) as Array<[SkillAgent, string]>) {
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
      console.log(`  ${c.dim('○')} ${c.bold(agent)}  ${c.dim('directory not found')}`);
    }
  }
}

export async function doctorSkills(skillsDirectory: string): Promise<boolean> {
  const packagedSkills = await getPackagedSkillNames(skillsDirectory);
  let allHealthy = true;

  console.log(`\n${c.bold('ABA PayWay Skills Doctor')}\n`);
  console.log(`Packaged skills: ${c.cyan(String(packagedSkills.length))}\n`);

  for (const [agent, directory] of Object.entries(SKILL_AGENTS) as Array<[SkillAgent, string]>) {
    let installed = 0;
    let dirExists = false;
    const issues: string[] = [];

    try {
      const entries = await readdir(directory, { withFileTypes: true });
      dirExists = true;
      const agentSkills = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
        .map((entry) => entry.name);

      installed = agentSkills.length;

      const missing = packagedSkills.filter((s) => !agentSkills.includes(s));
      if (missing.length > 0) {
        issues.push(`Missing ${missing.length} skill(s): ${missing.join(', ')}`);
      }

      for (const skillName of agentSkills) {
        try {
          const { readFile } = await import('node:fs/promises');
          await readFile(path.join(directory, skillName, 'SKILL.md'), 'utf8');
        } catch {
          issues.push(`${skillName}/SKILL.md not found or unreadable`);
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
        `  ${c.green('✓')} ${c.bold(agent)}  ${c.green(`${installed}/${packagedSkills.length} skills installed`)}  ${c.dim(directory)}`,
      );
    }
  }

  console.log();
  if (allHealthy) {
    console.log(`  ${c.green('All agents are healthy.')}`);
  } else {
    console.log(
      `  ${c.yellow('Run')} ${c.cyan('payway-sdk skills add <agent>')} ${c.yellow('to install missing skills.')}`,
    );
  }
  console.log();
  return allHealthy;
}
