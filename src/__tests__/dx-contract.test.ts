import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const skills = readdirSync(path.join(root, 'skills')).filter((name) => name.startsWith('aba-payway-'));
const content = skills.map((name) => readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8'));
const help = (command: string) => execFileSync(process.execPath, [path.join(root, 'dist/cli.js'), command, '--help'], { encoding: 'utf8' });

describe('public DX contract', () => {
  it('exports every named package import used by a packaged skill', () => {
    const entry = path.join(root, 'dist/index.d.ts');
    const program = ts.createProgram([entry], { skipLibCheck: true, module: ts.ModuleKind.NodeNext });
    const checker = program.getTypeChecker();
    const symbol = checker.getSymbolAtLocation(program.getSourceFile(entry)!);
    const exports = new Set(checker.getExportsOfModule(symbol!).map((item) => item.name));
    for (const markdown of content) {
      for (const block of markdown.matchAll(/```(?:ts|typescript)\s*\n([\s\S]*?)```/g)) {
        const source = ts.createSourceFile('skill.ts', block[1], ts.ScriptTarget.Latest, true);
        for (const statement of source.statements) {
          if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
          if (statement.moduleSpecifier.text !== 'aba-payway-ts') continue;
          const bindings = statement.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const item of bindings.elements) expect(exports.has((item.propertyName ?? item.name).text), item.getText()).toBe(true);
          }
        }
      }
    }
  }, 30_000); // TypeScript declaration loading is slower under coverage on Windows.

  it('resolves every literal top-level skill command against installed CLI help', () => {
    const commands = new Set(content.flatMap((markdown) => [...markdown.matchAll(/payway-sdk\s+([a-z][a-z-]*)/g)].map((match) => match[1])));
    for (const command of commands) expect(help(command), command).toContain('Usage:');
  }, 60_000);

  it.each(['demo', 'init', 'doctor', 'generate-qr', 'generate-checkout', 'checkout-form', 'payment-link', 'setup-webhook'])(
    '%s help provides a first-payment next step', (command) => {
      expect(help(command)).toContain('First-payment path:');
    },
  );
});
