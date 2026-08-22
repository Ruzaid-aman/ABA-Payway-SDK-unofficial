/**
 * Tests for the setup-webhook CLI command integration.
 *
 * Verifies the command registration and help output via the built CLI binary.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/cli.js');

// Only run if the CLI is built
const cliAvailable = existsSync(CLI_PATH);

describe.skipIf(!cliAvailable)('setup-webhook CLI command', () => {
  it('appears in --help output', () => {
    const result = spawnSync('node', [CLI_PATH, '--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    expect(result.stdout).toContain('setup-webhook');
    expect(result.stdout).toContain('webhook listener');
  });

  it('shows subcommand help with --help', () => {
    const result = spawnSync('node', [CLI_PATH, 'setup-webhook', '--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    expect(result.stdout).toContain('--port');
    expect(result.stdout).toContain('--storage');
    expect(result.stdout).toContain('--tunnel');
    expect(result.stdout).toContain('--url');
  });
});
