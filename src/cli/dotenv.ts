/**
 * Shared minimal .env loader used by the CLI entrypoint, doctor, and tools.
 *
 * Supports the formats merchants actually use (sandbox-verified 2026-08-25):
 * - KEY=value
 * - KEY="value"            (quotes stripped)
 * - multi-line quoted values such as RSA public key PEMs spanning several
 *   physical lines — folded into one logical value with real newlines
 * - single-line values with literal \n escapes (converted to newlines)
 */
import { existsSync, readFileSync } from 'node:fs';

export function parseDotEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(envPath)) return result;

  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r/g, '').trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    const opensQuote =
      (val.startsWith('"') && !val.slice(1).endsWith('"')) || (val.startsWith("'") && !val.slice(1).endsWith("'"));
    if (opensQuote) {
      const quote = val[0];
      const parts = [val.slice(1)];
      while (i + 1 < lines.length) {
        i += 1;
        const next = lines[i].replace(/\r/g, '');
        parts.push(next);
        if (next.trimEnd().endsWith(quote)) break;
      }
      val = `${parts.join('\n').trimEnd()}`.replace(/\\n/g, '\n').trim();
      if (val.endsWith(quote)) val = val.slice(0, -1);
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\n/g, '\n');
    }

    result[key] = val;
  }
  return result;
}

/** Parse `<cwd>/.env` and inject any variables not already in process.env. */
export function loadDotEnvIntoProcess(cwd: string, target: NodeJS.ProcessEnv = process.env): void {
  const parsed = parseDotEnvFile(`${cwd}/.env`);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in target)) target[key] = value;
  }
}
