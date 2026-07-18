import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type DetectedFramework = 'next-app' | 'next-pages' | 'express' | 'fastify' | 'nuxt' | 'unknown';

export interface FrameworkDetection {
  readonly framework: DetectedFramework;
  readonly evidence: readonly string[];
}

interface PackageJsonShape {
  readonly dependencies?: Record<string, unknown>;
  readonly devDependencies?: Record<string, unknown>;
  readonly peerDependencies?: Record<string, unknown>;
}

function readPackageJson(cwd: string): PackageJsonShape | undefined {
  const pkgPath = path.join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed as PackageJsonShape;
    return undefined;
  } catch {
    return undefined;
  }
}

function collectDeps(pkg: PackageJsonShape): Record<string, string> {
  const out: Record<string, string> = {};
  const merge = (group?: Record<string, unknown>) => {
    if (!group) return;
    for (const [name, version] of Object.entries(group)) {
      if (typeof version === 'string') out[name] = version;
    }
  };
  merge(pkg.dependencies);
  merge(pkg.devDependencies);
  merge(pkg.peerDependencies);
  return out;
}

function isDirectory(cwd: string, name: string): boolean {
  const p = path.join(cwd, name);
  if (!existsSync(p)) return false;
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Detect the web framework used in the given directory.
 *
 * Reads `package.json` dependencies and checks for well-known directory
 * structures (`app/`, `pages/`) to determine the framework and variant.
 */
export function detectFramework(cwd: string = process.cwd()): FrameworkDetection {
  const pkg = readPackageJson(cwd);
  const evidence: string[] = [];

  if (!pkg) {
    evidence.push('no package.json found');
    return { framework: 'unknown', evidence };
  }

  const deps = collectDeps(pkg);
  const hasDep = (name: string) => name in deps;

  if (hasDep('next')) {
    evidence.push(`package.json depends on next@${deps.next}`);
    const appExists = isDirectory(cwd, 'app');
    const pagesExists = isDirectory(cwd, 'pages');
    if (appExists) {
      evidence.push('found app/ directory');
      return { framework: 'next-app', evidence };
    }
    if (pagesExists) {
      evidence.push('found pages/ directory');
      return { framework: 'next-pages', evidence };
    }
    evidence.push('no app/ or pages/ directory yet — defaulting to next-app');
    return { framework: 'next-app', evidence };
  }
  if (hasDep('nuxt') || hasDep('@nuxt/kit') || hasDep('@nuxt/bridge')) {
    evidence.push('package.json depends on nuxt');
    return { framework: 'nuxt', evidence };
  }
  if (hasDep('fastify')) {
    evidence.push(`package.json depends on fastify@${deps.fastify}`);
    return { framework: 'fastify', evidence };
  }
  if (hasDep('express')) {
    evidence.push(`package.json depends on express@${deps.express}`);
    return { framework: 'express', evidence };
  }

  evidence.push('no supported framework dependency found');
  return { framework: 'unknown', evidence };
}
