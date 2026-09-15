/**
 * Cloudflare Tunnel subprocess manager.
 *
 * Spawns `cloudflared tunnel --url` to expose the local webhook server
 * to the public internet, parses stdout for the generated trycloudflare.com URL,
 * and manages the subprocess lifecycle.
 */

import { type ChildProcess, exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface TunnelManager {
  /** Start the tunnel and return the public URL once available. */
  start(localPort: number): Promise<string>;
  /** Stop the tunnel subprocess. */
  stop(): Promise<void>;
  /** Whether the tunnel subprocess is currently running. */
  readonly isRunning: boolean;
}

/** One bounded retry for transient quick-tunnel startup failures. */
export async function startTunnelWithRetry(
  start: (port: number) => Promise<string>,
  localPort: number,
  attempts = 2,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await start(localPort);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Match tunnel URLs like https://random-name-123.trycloudflare.com
// but NOT informational log messages like "api.trycloudflare.com"
// Tunnel URLs have at least 6 chars in the subdomain (random hex/gibberish)
const URL_PATTERN = /https:\/\/[a-z0-9-]{6,}\.trycloudflare\.com/;

/**
 * Check if `cloudflared` is installed and available in PATH.
 * Returns the path to the binary, or null if not found.
 */
export async function findCloudflared(): Promise<string | null> {
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'where cloudflared' : 'which cloudflared';
    const { stdout } = await execAsync(cmd);
    // Split on newlines, strip \r, trim whitespace, remove empty lines
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return null;

    if (isWindows) {
      // On Windows, `where` returns multiple results (shell script, .cmd, .ps1).
      // The actual cloudflared.exe is typically buried inside node_modules and
      // NOT on PATH — only the wrapper scripts (.cmd, shell script) are exposed.
      // Node.js spawn() can run .cmd files natively on Windows (it auto-invokes cmd.exe).
      // Prefer .cmd over .ps1 — skip the raw shell script (no extension) which
      // cannot be spawned directly by Node.js child_process.spawn.
      const cmdFile = lines.find((l) => /\.cmd$/i.test(l));
      if (cmdFile) return cmdFile;
      const ps1 = lines.find((l) => /\.ps1$/i.test(l));
      if (ps1) return ps1;
    }

    return lines[0] ?? null;
  } catch {
    return null;
  }
}

export function createTunnelManager(binaryPath?: string): TunnelManager {
  let child: ChildProcess | null = null;
  let running = false;
  const binary = binaryPath || (process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  // On Windows, .cmd/.bat files must be spawned with `shell: true` because
  // they are batch scripts interpreted by cmd.exe, not standalone executables.
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary);

  return {
    get isRunning() {
      return running;
    },

    start(localPort: number): Promise<string> {
      return new Promise((resolve, reject) => {
        child = spawn(binary, ['tunnel', '--url', `http://localhost:${localPort}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
          shell: needsShell,
        });

        let urlResolved = false;
        let stderrData = '';

        child.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') {
            reject(
              new Error(
                'cloudflared not found. Please install it or provide a public URL.\n' +
                  '  Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/\n' +
                  '  Or use: payway-sdk setup-webhook --url <your-public-url>',
              ),
            );
          } else {
            reject(err);
          }
        });

        // Parse stdout for the public URL
        child.stdout?.on('data', (data: Buffer) => {
          const text = data.toString('utf-8');
          const match = text.match(URL_PATTERN);
          if (match && !urlResolved) {
            urlResolved = true;
            running = true;
            resolve(match[0]);
          }
        });

        // Collect stderr for error reporting
        child.stderr?.on('data', (data: Buffer) => {
          stderrData += data.toString('utf-8');
          // Some versions output the URL on stderr
          const match = stderrData.match(URL_PATTERN);
          if (match && !urlResolved) {
            urlResolved = true;
            running = true;
            resolve(match[0]);
          }
        });

        child.on('close', (code) => {
          running = false;
          child = null;
          if (!urlResolved) {
            reject(new Error(`cloudflared exited with code ${code}. Output:\n${stderrData.slice(0, 500)}`));
          }
        });

        // Timeout after 30 seconds if URL not found
        setTimeout(() => {
          if (!urlResolved) {
            child?.kill();
            reject(
              new Error(
                'Timed out waiting for cloudflared to produce a tunnel URL.\n' +
                  `Last output: ${stderrData.slice(0, 300)}`,
              ),
            );
          }
        }, 30_000);
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!child || !running) {
          resolve();
          return;
        }

        const proc = child;

        // Give the process a moment to exit gracefully
        const killTimer = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // Process may already be dead
          }
        }, 3_000);

        proc.on('close', () => {
          clearTimeout(killTimer);
          running = false;
          child = null;
          resolve();
        });

        try {
          proc.kill('SIGTERM');
        } catch {
          // Process may already be dead
          clearTimeout(killTimer);
          running = false;
          child = null;
          resolve();
        }
      });
    },
  };
}
