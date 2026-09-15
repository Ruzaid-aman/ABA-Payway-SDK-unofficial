import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { resolvePaywayDataRoot } from '../config/data-root.js';

export interface WebhookLifecycleState {
  version: 1;
  pid: number;
  port: number;
  publicBaseUrl: string | null;
  callbackUrl: string | null;
  previousCallbackUrl: string | null;
  startedAt: string;
}

export function lifecyclePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolvePaywayDataRoot(undefined, env), 'webhook_data', 'receiver.json');
}

export function writeLifecycleState(state: WebhookLifecycleState, env?: NodeJS.ProcessEnv): void {
  const file = lifecyclePath(env);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function readLifecycleState(env?: NodeJS.ProcessEnv): WebhookLifecycleState | null {
  const file = lifecyclePath(env);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as WebhookLifecycleState;
    if (parsed.version !== 1 || !Number.isInteger(parsed.pid) || !Number.isInteger(parsed.port)) return null;
    return parsed;
  } catch { return null; }
}

export function clearLifecycleState(env?: NodeJS.ProcessEnv): void {
  try { unlinkSync(lifecyclePath(env)); } catch { /* already absent */ }
}
