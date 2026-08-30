/**
 * Open a file with the operating system's default associated application.
 *
 * Used by the CLI to pop the generated QR PNG into the merchant's default
 * image viewer immediately after generation, so the code is scannable even
 * in terminals that cannot render half-block QRs.
 *
 * Security: the opener command is selected from a fixed per-platform
 * allowlist (same policy as `src/agent/local-tools.ts`) and spawned with
 * `shell: false`. The target is a single validated file path argument, so
 * no shell interpolation ever happens.
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export interface OpenImageResult {
  /** True when the OS viewer launch was handed off successfully. */
  opened: boolean;
  /** The allowlisted viewer command that was launched, when opened. */
  viewer?: string;
  /** Machine-readable failure reason when opened is false. */
  reason?: 'missing_file' | 'unsupported_platform' | 'spawn_error';
  /** Human-readable detail when opened is false. */
  error?: string;
}

interface ViewerCommand {
  command: string;
  args: string[];
}

/**
 * Fixed (command, args) pair that opens a local file with its default
 * application on the given platform.
 */
export function defaultViewerCommandForPlatform(platform: NodeJS.Platform): ViewerCommand | undefined {
  switch (platform) {
    case 'win32':
      // FileProtocolHandler resolves the default association without a shell.
      return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler'] };
    case 'darwin':
      return { command: 'open', args: [] };
    case 'linux':
      return { command: 'xdg-open', args: [] };
    default:
      return undefined;
  }
}

/**
 * Open an image file with the platform's default image viewer.
 *
 * Best-effort by design: it never throws. Launch failures (viewer not
 * installed, headless environment) are reported through the returned
 * result so callers can degrade gracefully and keep polling for payment.
 *
 * @param imagePath - Path to the image; relative paths resolve against cwd.
 * @param options.launchTimeoutMs - Max wait for the handoff to be accepted
 *   before treating it as success (viewers may outlive the launcher).
 */
export async function openImageInDefaultViewer(
  imagePath: string,
  options: { launchTimeoutMs?: number } = {},
): Promise<OpenImageResult> {
  const { launchTimeoutMs = 3_000 } = options;
  const resolvedPath = path.resolve(imagePath);

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    return { opened: false, reason: 'missing_file', error: `file does not exist: ${resolvedPath}` };
  }

  const viewer = defaultViewerCommandForPlatform(process.platform);
  if (!viewer) {
    return {
      opened: false,
      reason: 'unsupported_platform',
      error: `unsupported platform: ${process.platform}`,
    };
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(viewer.command, [...viewer.args, resolvedPath], {
        shell: false,
        detached: true,
        stdio: 'ignore',
      });

      const timeout = setTimeout(() => {
        child.off('error', reject);
        // Still running after the window: assume the handoff succeeded —
        // some viewers keep the launcher alive while showing the image.
        resolve();
      }, launchTimeoutMs);

      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.unref();
    });
    return { opened: true, viewer: viewer.command };
  } catch (e) {
    return {
      opened: false,
      reason: 'spawn_error',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
