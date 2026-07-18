#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sdk } from './sdk.js';
import { formatTestReport } from './test/index.js';
import { runInit } from './cli/commands/init.js';
import { runDoctor } from './cli/commands/doctor.js';
import {
  addSkills,
  removeSkills,
  listSkills,
  doctorSkills,
} from './cli/commands/skills.js';

// ---------------------------------------------------------------------------
// ANSI helpers (no external deps)
// ---------------------------------------------------------------------------
const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const executableDirectory = path.dirname(process.argv[1] ?? process.cwd());

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(executableDirectory, '..', 'package.json'), 'utf8'),
    );
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getSkillsDir(): string {
  return path.join(executableDirectory, '..', 'skills');
}

// ---------------------------------------------------------------------------
// Commander program
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name('payway-sdk')
  .description('CLI for the ABA PayWay TypeScript SDK')
  .version(readPackageVersion());

// --- init ---
program
  .command('init')
  .description('Initialize PayWay integration in the current project')
  .action(() => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — initializing project\n`);
    const result = runInit();

    console.log(`  Framework: ${c.cyan(result.framework)}`);
    for (const e of result.frameworkEvidence) {
      console.log(`    ${c.dim('•')} ${e}`);
    }
    console.log();

    if (result.writtenFiles.length > 0) {
      console.log(`  ${c.green('Files created:')}`);
      for (const f of result.writtenFiles) console.log(`    ${c.green('✓')} ${f}`);
    }
    if (result.skippedFiles.length > 0) {
      console.log(`  ${c.yellow('Files skipped (already exist):')}`);
      for (const f of result.skippedFiles) console.log(`    ${c.yellow('○')} ${f}`);
    }
    if (result.envWritten) {
      console.log(`  ${c.green('✓')} .env template created`);
    }
    console.log();

    if (result.envIssues.length > 0) {
      console.log(`  ${c.yellow('Environment issues:')}`);
      for (const issue of result.envIssues) {
        const icon = issue.severity === 'error' ? c.red('✗') : c.yellow('⚠');
        console.log(`    ${icon} ${issue.message}`);
      }
      console.log();
    }

    console.log(`  Report: ${c.cyan(result.reportPath)}`);
    console.log(`  ${c.dim('Next: fill PAYWAY_MERCHANT_ID and PAYWAY_API_KEY in .env')}\n`);
  });

// --- doctor ---
program
  .command('doctor')
  .description('Validate environment configuration and connectivity')
  .action(() => {
    console.log(`\n${c.bold('ABA PayWay SDK Doctor')}\n`);
    const result = runDoctor();

    console.log(`  Framework: ${c.cyan(result.framework)}`);
    for (const e of result.frameworkEvidence) {
      console.log(`    ${c.dim('•')} ${e}`);
    }
    console.log();

    for (const check of result.checks) {
      const icon = check.ok ? c.green('✓') : c.red('✗');
      console.log(`  ${icon} ${check.label}  ${c.dim(check.detail)}`);
      if (check.fix) {
        console.log(`    ${c.yellow('→')} ${check.fix}`);
      }
    }
    console.log();

    if (result.allHealthy) {
      console.log(`  ${c.green('All checks passed.')}\n`);
      process.exitCode = 0;
    } else {
      console.log(`  ${c.yellow('Run')} ${c.cyan('payway-sdk init')} ${c.yellow('to fix configuration issues.')}\n`);
      process.exitCode = 1;
    }
  });

// --- test ---
program
  .command('test')
  .description('Run the PayWay sandbox test suite')
  .action(async () => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — running sandbox test suite\n`);
    const report = await sdk.runTestSuite();
    console.log(formatTestReport(report));
    process.exitCode = report.success ? 0 : 1;
  });

// --- demo ---
program
  .command('demo')
  .description('Run the test suite with pass/fail output')
  .action(async () => {
    console.log(`\n${c.bold('ABA PayWay SDK')} — demo run\n`);
    const report = await sdk.runTestSuite();
    for (const result of report.results) {
      const icon = result.passed ? c.green('PASS') : c.red('FAIL');
      console.log(`  [${icon}] ${result.name} → ${result.message}`);
    }
    console.log(
      `\n  Total: ${c.bold(String(report.total))}  Passed: ${c.green(String(report.passed))}  Failed: ${c.red(String(report.failed))}`,
    );
    process.exitCode = report.success ? 0 : 1;
  });

// --- skills ---
const skillsCmd = program
  .command('skills')
  .description('Manage AI skill guides for coding agents');

skillsCmd
  .command('add')
  .description('Install skills for one or more agents')
  .argument('<agents...>', 'Agent names: claude, codex, opencode, cursor, copilot')
  .action(async (agents: string[]) => {
    await addSkills(agents, getSkillsDir());
  });

skillsCmd
  .command('remove')
  .description('Remove skills from one or more agents')
  .argument('<agents...>', 'Agent names: claude, codex, opencode, cursor, copilot')
  .action(async (agents: string[]) => {
    await removeSkills(agents);
  });

skillsCmd
  .command('list')
  .description('Show installed skills per agent')
  .action(async () => {
    await listSkills();
  });

skillsCmd
  .command('doctor')
  .description('Verify installation health for all agents')
  .action(async () => {
    await doctorSkills(getSkillsDir());
  });

// --- parse ---
program.parse();
