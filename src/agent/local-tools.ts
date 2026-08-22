/**
 * Agentic PayWay CLI — local utilities guarded by a fixed allowlist.
 *
 * `openArtifact` and `copyToClipboard` are the only tools that touch the host
 * shell. Both spawn with `shell: false` and a hard-coded (platform, command,
 * arg) allowlist so a model can never inject arbitrary commands or arguments.
 * `openArtifact` additionally confines file references to the current session's
 * artifact root, allowing only https URLs or in-root paths.
 */

import { spawn } from 'node:child_process';
import { defaultArtifactRoot, resolveArtifactPath } from './artifacts.js';
import type { AgentSessionV1 } from './contracts.js';

export function sessionArtifactRoot(): string {
  return defaultArtifactRoot();
}

const HTTPS_PATTERN = /^https:\/\//i;
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

interface AllowedCommand {
  command: string;
  args: string[];
  /** When true, `target` is piped to stdin instead of passed as an argument. */
  stdin?: boolean;
}

/**
 * Returns the fixed, allowed (command, args) pair for opening `target` on the
 * current platform. `target` is always a single, validated argument.
 */
function openCommandFor(target: string): AllowedCommand {
  switch (process.platform) {
    case 'win32':
      // `cmd /c start "" <target>` — empty title arg prevents mis-parsing.
      return { command: 'cmd', args: ['/c', 'start', '', target] };
    case 'darwin':
      return { command: 'open', args: [target] };
    case 'linux':
      return { command: 'xdg-open', args: [target] };
    default:
      throw new Error(`unsupported platform for openArtifact: ${process.platform}`);
  }
}

function clipboardCommandFor(): AllowedCommand {
  switch (process.platform) {
    case 'win32':
      return { command: 'cmd', args: ['/c', 'clip'], stdin: true };
    case 'darwin':
      return { command: 'pbcopy', args: [], stdin: true };
    case 'linux':
      return { command: 'xclip', args: ['-selection', 'clipboard'], stdin: true };
    default:
      throw new Error(`unsupported platform for copyToClipboard: ${process.platform}`);
  }
}

/**
 * Spawns a fixed, allowlisted command without a shell. Resolves on a clean
 * exit, rejects on spawn error or a non-zero exit code.
 */
function runAllowed(allowed: AllowedCommand, stdinText?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(allowed.command, allowed.args, {
      shell: false,
      stdio: allowed.stdin ? ['pipe', 'ignore', 'pipe'] : ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      reject(new Error(`failed to launch "${allowed.command}": ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`"${allowed.command}" exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
      }
    });

    if (allowed.stdin && stdinText !== undefined) {
      child.stdin?.write(stdinText);
      child.stdin?.end();
    }
  });
}

/**
 * Opens an artifact for the user.
 *
 * Permits exactly two kinds of references:
 *  1. An explicitly selected `https://` URL.
 *  2. A path to a current-session artifact, which must resolve inside the
 *     session artifact root (no traversal / absolute escape without an
 *     explicit confirmed override).
 *
 * Any other URI scheme (http, ftp, file, …) or out-of-root path is rejected.
 */
export async function openArtifact(reference: string, session: AgentSessionV1): Promise<void> {
  if (!session?.sessionId) {
    throw new Error('openArtifact requires a valid session');
  }

  // Case 1: explicitly selected https URL.
  if (HTTPS_PATTERN.test(reference)) {
    await runAllowed(openCommandFor(reference));
    return;
  }

  // A URI scheme other than https (e.g. http://, ftp://, file://) is rejected.
  if (SCHEME_PATTERN.test(reference)) {
    throw new Error(`openArtifact only allows https URLs or in-root artifact paths; rejected scheme in "${reference}"`);
  }

  // Case 2: a current-session artifact path confined to the session root.
  const resolved = resolveArtifactPath(sessionArtifactRoot(), reference, false);
  await runAllowed(openCommandFor(resolved));
}

/**
 * Copies text to the system clipboard via the platform clipboard utility.
 * Spawns with `shell: false`; the text is piped to stdin, never interpolated
 * into a shell command line.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await runAllowed(clipboardCommandFor(), text);
}
