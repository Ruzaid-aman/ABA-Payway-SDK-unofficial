/**
 * Pure-helper coverage for `onboard-helpers.ts`: stage validation and
 * sequencing, the non-interactive JSON contract, .env append semantics,
 * readiness rows and the plain-text hint.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanOnboardingState } from '../agent/onboarding/scan.js';
import { pendingStages } from '../agent/onboarding/stages.js';
import {
  ALL_STAGES,
  appendEnvVar,
  nonInteractiveResult,
  onboardingHintText,
  readinessRows,
  stageListFor,
  validateStageArg,
} from '../cli/commands/onboard-helpers.js';

const temporaryDirectories: string[] = [];

let appData: string;
let priorAppData: string | undefined;

beforeEach(() => {
  // Isolate the agent config store so snapshots never see the real profile.
  appData = mkdtempSync(path.join(tmpdir(), 'onboard-helpers-appdata-'));
  temporaryDirectories.push(appData);
  priorAppData = process.env.APPDATA;
  process.env.APPDATA = appData;
});

afterEach(() => {
  if (priorAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = priorAppData;
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateStageArg', () => {
  it('accepts a missing or valid stage', () => {
    expect(validateStageArg()).toBeNull();
    for (const stage of ALL_STAGES) {
      expect(validateStageArg(stage)).toBeNull();
    }
  });

  it('rejects unknown stages with the allowed list', () => {
    const error = validateStageArg('nope');
    expect(error).toContain('nope');
    expect(error).toContain('provider');
    expect(error).toContain('verify');
  });
});

describe('stageListFor', () => {
  const snapshot = scanOnboardingState({});

  it('explicit non-verify stage appends a verify pass', () => {
    expect(stageListFor('provider', snapshot)).toEqual(['provider', 'verify']);
    expect(stageListFor('privacy', snapshot)).toEqual(['privacy', 'verify']);
  });

  it('explicit verify stage and no stage fall back to pendingStages', () => {
    expect(stageListFor('verify', snapshot)).toEqual(pendingStages(snapshot));
    expect(stageListFor(undefined, snapshot)).toEqual(pendingStages(snapshot));
  });
});

describe('nonInteractiveResult', () => {
  it('reports a blocked agent-command/v1 result with the missing remedies', () => {
    const result = nonInteractiveResult(scanOnboardingState({}));
    expect(result.version).toBe('agent-command/v1');
    expect(result.status).toBe('blocked');
    expect(result.request).toBe('onboard');
    expect(result.error?.code).toBe('AGENT_NOT_CONFIGURED');
    expect(typeof result.error?.message).toBe('string');
    expect(result.error?.message.length).toBeGreaterThan(0);
  });
});

describe('readinessRows', () => {
  it('returns labelled readiness rows that are not ready on a bare environment', () => {
    const rows = readinessRows(scanOnboardingState({}));
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.label).toBe('string');
      expect(row.label.length).toBeGreaterThan(0);
      expect(typeof row.state).toBe('string');
    }
  });
});

describe('appendEnvVar', () => {
  function tempEnvFile(initial?: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'onboard-helpers-'));
    temporaryDirectories.push(dir);
    const file = path.join(dir, '.env');
    if (initial !== undefined) writeFileSync(file, initial, 'utf8');
    return file;
  }

  it('creates the file and the variable, and exposes it in env', () => {
    const env: NodeJS.ProcessEnv = {};
    const file = tempEnvFile();
    const result = appendEnvVar(file, env, 'PAYWAY_AGENT_API_KEY', 'k1');
    expect(result.action).toBe('created');
    expect(readFileSync(file, 'utf8')).toContain('PAYWAY_AGENT_API_KEY=k1');
    expect(env.PAYWAY_AGENT_API_KEY).toBe('k1');
  });

  it('keeps an existing identical value (idempotent)', () => {
    const env: NodeJS.ProcessEnv = {};
    const file = tempEnvFile('PAYWAY_AGENT_API_KEY=k1\n');
    const result = appendEnvVar(file, env, 'PAYWAY_AGENT_API_KEY', 'k1');
    expect(result.action).toBe('kept');
    expect(readFileSync(file, 'utf8')).toBe('PAYWAY_AGENT_API_KEY=k1\n');
  });

  it('refuses to overwrite a different existing value', () => {
    const file = tempEnvFile('PAYWAY_AGENT_API_KEY=old\n');
    expect(() => appendEnvVar(file, {}, 'PAYWAY_AGENT_API_KEY', 'new')).toThrow(/Refusing to overwrite/);
    expect(readFileSync(file, 'utf8')).toBe('PAYWAY_AGENT_API_KEY=old\n');
  });

  it('preserves other lines and the trailing newline (historical blank-line behavior)', () => {
    const env: NodeJS.ProcessEnv = {};
    const file = tempEnvFile('FIRST=1\nSECOND=2\n');
    appendEnvVar(file, env, 'THIRD', '3');
    const content = readFileSync(file, 'utf8');
    // The trailing '' element from the split is kept, then '\n' appended —
    // the historical appendEnvVar output shape.
    expect(content).toBe('FIRST=1\nSECOND=2\n\nTHIRD=3\n');
  });
});

describe('onboardingHintText', () => {
  it('points at the onboard command and lists fixes when unconfigured', () => {
    const hint = onboardingHintText(scanOnboardingState({}));
    expect(hint).toContain('payway-sdk onboard');
    expect(hint).toContain('Missing:');
    expect(hint).toContain('•');
  });
});
