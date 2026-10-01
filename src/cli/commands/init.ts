import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type EnvIssue, validatePayWayEnv } from '../../config/envValidator.js';
import { type DetectedFramework, detectFramework } from '../../config/frameworkDetector.js';
import { selectTemplateFiles, type TemplateModule } from '../../config/templates/index.js';
import { FIRST_PAYMENT_TEMPLATE } from '../templates/first-payment/index.js';

export type InitMode = 'demo' | 'sandbox';
export type InitTemplate = 'framework' | 'first-payment';

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
  readonly mode?: InitMode;
  readonly template?: InitTemplate;
}

export interface InitResult {
  readonly mode: InitMode;
  readonly template: InitTemplate;
  readonly framework: DetectedFramework;
  readonly frameworkEvidence: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly envIssues: readonly EnvIssue[];
  readonly envWritten: boolean;
  readonly reportPath: string;
  readonly nextCommand: string;
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
  lines.push(`- Mode: \`${result.mode}\``);
  lines.push(`- Template: \`${result.template}\``);
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
  lines.push('## Next command');
  lines.push('');
  lines.push(`\`${result.nextCommand}\``);
  lines.push('');
  return lines.join('\n');
}

/**
 * Run the `init` command: detect framework, scaffold routes, write .env, generate report.
 */
export function runInit(options: InitOptions = {}): InitResult {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const mode = options.mode ?? 'sandbox';
  const template = options.template ?? 'framework';

  const detection = detectFramework(cwd);
  const modules: TemplateModule[] = ['checkout', 'callback'];
  const templateFiles =
    mode === 'demo'
      ? []
      : template === 'first-payment'
        ? FIRST_PAYMENT_TEMPLATE
        : selectTemplateFiles(detection.framework, modules);

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
  if (mode === 'sandbox') {
    const examplePath = path.join(cwd, '.env.example');
    if (writeFileIfMissing(examplePath, ENV_TEMPLATE)) {
      written.push('.env.example');
    } else {
      skipped.push('.env.example');
    }
  }
  const envWritten = mode === 'sandbox' ? writeFileIfMissing(envPath, ENV_TEMPLATE) : false;

  const envIssues = mode === 'sandbox' ? validatePayWayEnv(env) : [];

  const reportPath = path.join(cwd, 'INTEGRATION_REPORT.md');
  const report: InitResult = {
    mode,
    template,
    framework: detection.framework,
    frameworkEvidence: detection.evidence,
    writtenFiles: written,
    skippedFiles: skipped,
    envIssues,
    envWritten,
    reportPath,
    nextCommand:
      mode === 'demo'
        ? 'payway-sdk demo'
        : template === 'first-payment'
          ? // Audit S01: Node does not read .env on its own — without this
            // flag the starter exited with a missing-callback error even
            // though the generated .env was correctly filled in.
            // --env-file-if-exists keeps the command working when a user
            // deletes .env and prefers real environment variables instead.
            'node --env-file-if-exists=.env payway-first-payment.mjs'
          : 'payway-sdk doctor',
  };
  writeFileSync(reportPath, renderReport(report), { encoding: 'utf8' });

  return report;
}
