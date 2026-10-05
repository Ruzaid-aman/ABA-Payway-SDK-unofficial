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
import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { defaultArtifactRoot, resolveArtifactPath } from './artifacts.js';
import type { AgentSessionV1, MaterializedAgentAction, OpenArtifactParams } from './contracts.js';
import { isPublicHttpsUrl } from './url-policy.js';

export function sessionArtifactRoot(): string {
  return defaultArtifactRoot();
}

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
      return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', target] };
    case 'darwin':
      return { command: 'open', args: [target] };
    case 'linux':
      return { command: 'xdg-open', args: [target] };
    default:
      throw new Error(`unsupported platform for openArtifact: ${process.platform}`);
  }
}

function activeArtifactPath(reference: string, session: AgentSessionV1): string {
  const artifacts = session.events.filter((event) => event.type === 'artifact').map((event) => event.data);
  const selected = artifacts.find((artifact) => artifact.artifactId === reference || artifact.path === reference);
  if (!selected || typeof selected.path !== 'string') {
    throw new Error('openArtifact local reference does not belong to the active session');
  }
  return selected.path;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** Resolve and validate an opener reference without launching a host process. */
export function validateOpenArtifactReference(reference: string, session: AgentSessionV1): string {
  if (!session?.sessionId) throw new Error('openArtifact requires a valid session');

  if (/^https:/i.test(reference)) {
    if (!isPublicHttpsUrl(reference)) {
      throw new Error('openArtifact HTTPS reference must be a public https URL');
    }
    return reference;
  }

  // Windows drive paths are absolute file paths, not URI schemes.
  if (!path.isAbsolute(reference) && SCHEME_PATTERN.test(reference)) {
    throw new Error(
      `openArtifact only allows public https URLs or active-session artifacts; rejected scheme in "${reference}"`,
    );
  }

  const trackedPath = activeArtifactPath(reference, session);
  const root = sessionArtifactRoot();
  const lexical = resolveArtifactPath(root, trackedPath, false);
  if (!existsSync(root) || !existsSync(lexical)) {
    throw new Error('openArtifact active-session artifact does not exist');
  }
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error('openArtifact artifact root must not be a symlink or junction');
  }
  const realRoot = realpathSync.native(root);
  const realTarget = realpathSync.native(lexical);
  if (!isInsideRoot(realRoot, realTarget)) {
    throw new Error('openArtifact resolved target escapes the artifact root');
  }
  if (!statSync(realTarget).isFile()) {
    throw new Error('openArtifact active-session artifact is not a file');
  }
  return realTarget;
}

/** Validate local-only actions before any create action is authorized or ledgered. */
export function prevalidateLocalAction(
  action: MaterializedAgentAction,
  session: AgentSessionV1,
): MaterializedAgentAction {
  const tool = (action as { tool: string }).tool;
  if (tool === 'open_artifact') {
    const params = action as unknown as OpenArtifactParams;
    validateOpenArtifactReference(params.reference, session);
    return action;
  }
  if (tool === 'save_artifact') {
    const params = action as unknown as { qrString?: string; content?: string };
    if (!params.qrString && !params.content) {
      throw new Error('save_artifact requires qrString or content');
    }
  }
  return action;
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
 *  2. A reference recorded by the active session, whose real filesystem target
 *     must remain inside the non-linked session artifact root.
 *
 * Any other URI scheme (http, ftp, file, …) or out-of-root path is rejected.
 */
export async function openArtifact(reference: string, session: AgentSessionV1): Promise<void> {
  const validated = validateOpenArtifactReference(reference, session);
  await runAllowed(openCommandFor(validated));
}

/**
 * Copies text to the system clipboard via the platform clipboard utility.
 * Spawns with `shell: false`; the text is piped to stdin, never interpolated
 * into a shell command line.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await runAllowed(clipboardCommandFor(), text);
}
