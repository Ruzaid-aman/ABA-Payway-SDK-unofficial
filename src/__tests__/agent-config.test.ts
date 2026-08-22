import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAgentConfig, updateAgentConfig, writeAgentConfig } from '../agent/config.js';
import type { ProviderConfigV1 } from '../agent/contracts.js';
import { getAgentDataPaths } from '../agent/storage.js';

const { fsState } = vi.hoisted(() => ({ fsState: { failRename: false } }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: vi.fn((...args: Parameters<typeof actual.renameSync>) => {
      if (fsState.failRename) throw new Error('simulated rename failure');
      return actual.renameSync(...args);
    }),
  };
});

const temporaryDirectories: string[] = [];
const originalAppData = process.env.APPDATA;

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-agent-config-'));
  temporaryDirectories.push(directory);
  process.env.APPDATA = directory;
});

afterEach(() => {
  process.env.APPDATA = originalAppData;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function validConfig(overrides: Partial<ProviderConfigV1> = {}): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: 'gpt-4o-mini',
    capabilityMode: 'strict-json-plan',
    ...overrides,
  };
}

describe('agent config storage', () => {
  it('returns null when no config exists yet (first run)', () => {
    expect(readAgentConfig()).toBeNull();
  });

  it('round-trips a valid config through write then read', () => {
    const config = validConfig({ timeoutMs: 45000, baseUrl: 'https://api.openai.com/v1' });
    writeAgentConfig(config);
    expect(readAgentConfig()).toEqual(config);
  });

  it('rejects a malformed JSON config file with a clear error', () => {
    const { root, configFile } = getAgentDataPaths();
    mkdirSync(root, { recursive: true });
    writeFileSync(configFile, '{ this is not valid json', 'utf8');
    expect(() => readAgentConfig()).toThrow(/Malformed agent config JSON/);
  });

  it('rejects an unknown config version', () => {
    const { root, configFile } = getAgentDataPaths();
    mkdirSync(root, { recursive: true });
    writeFileSync(
      configFile,
      JSON.stringify({ version: 'agent-config/v2', provider: 'openai', model: 'x', capabilityMode: 'native-tools' }),
      'utf8',
    );
    expect(() => readAgentConfig()).toThrow(/Invalid agent config/);
  });

  it('rejects forbidden custom headers on write', () => {
    expect(() => writeAgentConfig(validConfig({ headers: { authorization: 'Bearer x' } }))).toThrow(/Forbidden header/);
    expect(() => writeAgentConfig(validConfig({ headers: { 'X-API-Key': 'secret' } }))).toThrow(/Forbidden header/);
  });

  it('updateAgentConfig seeds, applies the patch, defaults timeout and persists', () => {
    const result = updateAgentConfig({ provider: 'openrouter', model: 'mistralai/mixtral' });
    expect(result).toMatchObject({
      version: 'agent-config/v1',
      provider: 'openrouter',
      model: 'mistralai/mixtral',
      capabilityMode: 'strict-json-plan',
      timeoutMs: 30000,
    });
    expect(readAgentConfig()).toEqual(result);
  });

  it('survives an interrupted write: pre-existing file is not corrupted', () => {
    const original = validConfig({ model: 'original-model' });
    writeAgentConfig(original);

    fsState.failRename = true;
    try {
      expect(() => writeAgentConfig(validConfig({ model: 'new-model' }))).toThrow(/simulated rename failure/);
    } finally {
      fsState.failRename = false;
    }

    const { configFile } = getAgentDataPaths();
    const onDisk = JSON.parse(readFileSync(configFile, 'utf8')) as ProviderConfigV1;
    expect(onDisk).toEqual(original);
  });
});
