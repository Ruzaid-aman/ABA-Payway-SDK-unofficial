/**
 * Tests for the setup-webhook CLI command integration.
 *
 * Verifies the command registration and help output via the built CLI binary.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { distCliPath, runDistCliSync } from '../test/test-utils.js';

// Only run if the CLI is built
const cliAvailable = existsSync(distCliPath());

describe.skipIf(!cliAvailable)('setup-webhook CLI command', () => {
  it('appears in --help output', () => {
    const result = runDistCliSync(['--help'], { env: process.env });

    expect(result.stdout).toContain('setup-webhook');
    expect(result.stdout).toContain('webhook listener');
  });

  it('shows subcommand help with --help', () => {
    const result = runDistCliSync(['setup-webhook', '--help'], { env: process.env });

    expect(result.stdout).toContain('--port');
    expect(result.stdout).toContain('--storage');
    expect(result.stdout).toContain('--tunnel');
    expect(result.stdout).toContain('--url');
  });
});
