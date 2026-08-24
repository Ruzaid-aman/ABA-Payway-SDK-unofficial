/**
 * Agentic PayWay CLI — versioned agent configuration.
 *
 * Only non-secret provider settings are persisted here. The provider API key is
 * never accepted or written: it lives exclusively in the `PAYWAY_AGENT_API_KEY`
 * environment variable. All writes are validated by `validateProviderConfig`
 * (Ajv) and applied atomically via `atomicWriteJson`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { validateProviderConfig } from './schemas.js';
import { atomicWriteJson, getAgentDataPaths } from './storage.js';

const FORBIDDEN_HEADERS = ['authorization', 'api-key', 'x-api-key', 'cookie', 'proxy-authorization'];

function guardForbiddenHeaders(headers?: Record<string, string>): void {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (FORBIDDEN_HEADERS.includes(key.toLowerCase())) {
      throw new Error(`Forbidden header "${key}" is not allowed in agent provider config`);
    }
  }
}

function describeErrors(): string {
  return JSON.stringify(validateProviderConfig.errors ?? []);
}

/**
 * Reads the persisted agent config.
 *
 * Returns `null` only when the file is absent. Throws a clear error on
 * malformed JSON, an unknown/invalid version, or forbidden headers so callers
 * can surface the failure instead of silently recovering.
 */
export function readAgentConfig(): import('./contracts.js').ProviderConfigV1 | null {
  const { configFile } = getAgentDataPaths();
  if (!existsSync(configFile)) return null;

  let raw: string;
  try {
    raw = readFileSync(configFile, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read agent config at ${configFile}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Malformed agent config JSON at ${configFile}`);
  }

  if (!validateProviderConfig(parsed)) {
    throw new Error(`Invalid agent config at ${configFile}: ${describeErrors()}`);
  }

  return parsed;
}

/**
 * Validates and atomically writes the given config.
 *
 * Rejects invalid configs (including forbidden headers) before touching disk.
 */
export function writeAgentConfig(config: import('./contracts.js').ProviderConfigV1): void {
  guardForbiddenHeaders(config.headers);
  if (!validateProviderConfig(config)) {
    throw new Error(`Invalid agent provider config: ${describeErrors()}`);
  }
  const { configFile } = getAgentDataPaths();
  atomicWriteJson(configFile, config);
}

/**
 * Merges `patch` over the existing config (or a seed default), validates, and
 * atomically writes the result. Returns the persisted config.
 *
 * The seed default uses `timeoutMs` of 30000 (30s). `version` is always pinned
 * to `agent-config/v1`.
 */
export function updateAgentConfig(
  patch: Partial<import('./contracts.js').ProviderConfigV1>,
): import('./contracts.js').ProviderConfigV1 {
  const existing =
    readAgentConfig() ??
    ({
      version: 'agent-config/v1',
      provider: 'openai',
      model: 'gpt-4o',
      capabilityMode: 'strict-json-plan',
    } as import('./contracts.js').ProviderConfigV1);

  const merged: import('./contracts.js').ProviderConfigV1 = {
    ...existing,
    ...patch,
    version: 'agent-config/v1',
  };

  if (merged.timeoutMs === undefined) merged.timeoutMs = 30000;

  writeAgentConfig(merged);
  return merged;
}
