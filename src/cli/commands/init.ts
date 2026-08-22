import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type EnvIssue, validatePayWayEnv } from '../../config/envValidator.js';
import { type DetectedFramework, detectFramework } from '../../config/frameworkDetector.js';
import { selectTemplateFiles, type TemplateModule } from '../../config/templates/index.js';

const ENV_TEMPLATE =
  '# ABA PayWay credentials\n' +
  'PAYWAY_ENV=sandbox\n' +
  'PAYWAY_MERCHANT_ID=\n' +
  'PAYWAY_API_KEY=\n\n' +
  '# URLs (required for checkout redirect)\n' +
  'PAYWAY_RETURN_URL=https://yoursite.com/payment/return\n' +
  'PAYWAY_CANCEL_URL=https://yoursite.com/payment/cancel\n' +
  '# PAYWAY_CALLBACK_URL=https://yoursite.com/api/payment/callback\n';

export interface InitOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface InitResult {
  readonly framework: DetectedFramework;
  readonly frameworkEvidence: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly envIssues: readonly EnvIssue[];
  readonly envWritten: boolean;
  readonly reportPath: string;
}

function writeFileIfMissing(filePath: string, content: string): boolean {
  if (existsSync(filePath)) return false;
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8' });
  return true;
}

function renderReport(result: InitResult): string {
  const lines: string[] = [];
  lines.push('# ABA PayWay Integration Report');
  lines.push('');
  lines.push(`- Framework: \`${result.framework}\``);
  lines.push('- Evidence:');
  for (const e of result.frameworkEvidence) lines.push(`  - ${e}`);
  lines.push('');
  lines.push('## Files written');
  if (result.writtenFiles.length === 0) {
    lines.push('- _(none)_');
  } else {
    for (const f of result.writtenFiles) lines.push(`- \`${f}\``);
  }
  if (result.skippedFiles.length > 0) {
    lines.push('');
    lines.push('## Files skipped (already existed)');
    for (const f of result.skippedFiles) lines.push(`- \`${f}\``);
  }
  lines.push('');
  lines.push('## Environment check');
  if (result.envIssues.length === 0) {
    lines.push('- ✅ no env issues detected');
  } else {
    for (const issue of result.envIssues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Run the `init` command: detect framework, scaffold routes, write .env, generate report.
 */
export function runInit(options: InitOptions = {}): InitResult {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  const detection = detectFramework(cwd);
  const modules: TemplateModule[] = ['checkout', 'callback'];
  const templateFiles = selectTemplateFiles(detection.framework, modules);

  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of templateFiles) {
    const target = path.join(cwd, file.path);
    if (writeFileIfMissing(target, file.content)) {
      written.push(file.path);
    } else {
      skipped.push(file.path);
    }
  }

  const envPath = path.join(cwd, '.env');
  const envWritten = writeFileIfMissing(envPath, ENV_TEMPLATE);

  const envIssues = validatePayWayEnv(env);

  const reportPath = path.join(cwd, 'INTEGRATION_REPORT.md');
  const report: InitResult = {
    framework: detection.framework,
    frameworkEvidence: detection.evidence,
    writtenFiles: written,
    skippedFiles: skipped,
    envIssues,
    envWritten,
    reportPath,
  };
  writeFileSync(reportPath, renderReport(report), { encoding: 'utf8' });

  return report;
}
