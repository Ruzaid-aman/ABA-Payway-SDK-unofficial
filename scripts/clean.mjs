import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(repositoryRoot, 'dist');
const relative = path.relative(repositoryRoot, target);

if (relative !== 'dist' || path.basename(target) !== 'dist') {
  throw new Error(`Refusing to clean unexpected path: ${target}`);
}

rmSync(target, { recursive: true, force: true });
