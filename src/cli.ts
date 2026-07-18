#!/usr/bin/env node
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { sdk } from './sdk.js';
import { formatTestReport } from './test/index.js';

const executableDirectory = path.dirname(process.argv[1] ?? process.cwd());

const SKILL_AGENTS = {
  claude: path.join(homedir(), '.claude', 'skills'),
  codex: path.join(homedir(), '.codex', 'skills'),
  opencode: path.join(homedir(), '.opencode', 'skills'),
  cursor: path.join(homedir(), '.cursor', 'skills'),
  copilot: path.join(homedir(), '.copilot', 'skills'),
} as const;

type SkillAgent = keyof typeof SKILL_AGENTS;

function printSkillsHelp(): void {
  console.log(`Usage:
  payway-sdk skills add <agent...>
  payway-sdk skills remove <agent...>
  payway-sdk skills list
  payway-sdk skills help

Supported agents: ${Object.keys(SKILL_AGENTS).join(', ')}`);
}

function getSkillAgents(agentNames: string[]): SkillAgent[] {
  const invalidAgents = agentNames.filter((agent) => !(agent in SKILL_AGENTS));
  if (invalidAgents.length > 0) {
    throw new Error(`Unsupported agent: ${invalidAgents.join(', ')}`);
  }
  return agentNames as SkillAgent[];
}

async function getPackagedSkillNames(): Promise<string[]> {
  const skillsDirectory = path.join(executableDirectory, '..', 'skills');
  try {
    const entries = await readdir(skillsDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
      .map((entry) => entry.name);
  } catch {
    throw new Error(`Packaged skills were not found at ${skillsDirectory}. Reinstall or rebuild aba-payway-ts.`);
  }
}

async function addSkills(agentNames: string[]): Promise<void> {
  const agents = getSkillAgents(agentNames);
  if (agents.length === 0) {
    throw new Error('Specify at least one agent to install skills for.');
  }

  const skillsDirectory = path.join(executableDirectory, '..', 'skills');
  const skillNames = await getPackagedSkillNames();
  for (const agent of agents) {
    await mkdir(SKILL_AGENTS[agent], { recursive: true });
    for (const skillName of skillNames) {
      await cp(path.join(skillsDirectory, skillName), path.join(SKILL_AGENTS[agent], skillName), {
        recursive: true,
        force: true,
      });
      console.log(`[installed] ${agent} ${skillName}`);
    }
  }
}

async function removeSkills(agentNames: string[]): Promise<void> {
  const agents = getSkillAgents(agentNames);
  if (agents.length === 0) {
    throw new Error('Specify at least one agent to remove skills from.');
  }

  for (const agent of agents) {
    let entries: Dirent[];
    try {
      entries = await readdir(SKILL_AGENTS[agent], { withFileTypes: true });
    } catch {
      console.log(`[not installed] ${agent}`);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('aba-payway-')) {
        continue;
      }
      await rm(path.join(SKILL_AGENTS[agent], entry.name), { recursive: true, force: true });
      console.log(`[removed] ${agent} ${entry.name}`);
    }
  }
}

async function listSkills(): Promise<void> {
  for (const [agent, directory] of Object.entries(SKILL_AGENTS) as Array<[SkillAgent, string]>) {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const installed = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
        .map((entry) => entry.name);
      console.log(`${agent}: ${installed.length > 0 ? installed.join(', ') : 'No skills installed'}`);
    } catch {
      console.log(`${agent}: No skills installed`);
    }
  }
}

async function handleSkills(args: string[]): Promise<void> {
  const [action = 'help', ...agentNames] = args;
  if (action === 'add') {
    await addSkills(agentNames);
    return;
  }
  if (action === 'remove') {
    await removeSkills(agentNames);
    return;
  }
  if (action === 'list') {
    await listSkills();
    return;
  }
  if (action === 'help') {
    printSkillsHelp();
    return;
  }
  throw new Error(`Unknown skills command: ${action}`);
}

async function main(): Promise<void> {
  const [command = 'test', ...args] = process.argv.slice(2);
  if (command === 'test') {
    console.log('Running PayWay SDK test suite...\n');
    const report = await sdk.runTestSuite();
    console.log(formatTestReport(report));
    process.exitCode = report.success ? 0 : 1;
    return;
  }
  if (command === 'demo') {
    console.log('Running PayWay SDK demo...\n');
    const report = await sdk.runTestSuite();
    for (const result of report.results) {
      const icon = result.passed ? 'PASS' : 'FAIL';
      console.log(`  [${icon}] ${result.name} -> ${result.message}`);
    }
    console.log(`\nTotal: ${report.total} Passed: ${report.passed} Failed: ${report.failed}`);
    process.exitCode = report.success ? 0 : 1;
    return;
  }
  if (command === 'skills') {
    await handleSkills(args);
    return;
  }
  console.error(`Unknown command: ${command}`);
  console.error('Available commands: test, demo, skills');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('CLI error:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
