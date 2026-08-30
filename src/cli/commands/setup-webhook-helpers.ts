/**
 * Pure helpers for the `setup-webhook` command (extracted 2026-08-30 for
 * testability — the command body delegates all decisions here so the
 * interactive/Tunnel/server orchestration stays thin and injectable).
 */

export type PortValidation = { ok: true; port: number } | { ok: false; message: string };

/** Validates the `--port` flag: finite integer 1–65535. */
export function validatePort(input?: string): PortValidation {
  const port = input === undefined || input === '' ? 8443 : Number(input);
  if (!Number.isFinite(port) || port <= 0 || port > 65535 || !Number.isInteger(port)) {
    return { ok: false, message: `Invalid port: ${input ?? ''}. Must be 1-65535.` };
  }
  return { ok: true, port };
}

/** The webhook path the local listener serves. */
export function computeWebhookUrl(publicUrl: string | null, port: number): string {
  return publicUrl ? `${publicUrl}/aba-payway-webhook` : `http://localhost:${port}/aba-payway-webhook`;
}

export interface UpsertResult {
  /** The previously stored PAYWAY_CALLBACK_URL value, or null when none existed. */
  previous: string | null;
}

/**
 * Writes `PAYWAY_CALLBACK_URL=<url>` into the given .env file (creating or
 * updating the single line). Returns the previous value so shutdown can
 * restore it. Lines are preserved verbatim apart from the callback line.
 */
export function upsertEnvCallbackUrl(
  readFile: (path: string) => string | null,
  writeFile: (path: string, content: string) => void,
  envFile: string,
  url: string,
): UpsertResult {
  const key = 'PAYWAY_CALLBACK_URL';
  const existing = readFile(envFile);
  const lines = existing !== null ? existing.split(/\r?\n/) : [''];
  const newLine = `${key}=${url}`;
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  let previous: string | null = null;
  if (idx !== -1) {
    const existingVal = lines[idx].split('=').slice(1).join('=').trim();
    if (existingVal && existingVal !== url) {
      previous = existingVal;
    }
    lines[idx] = newLine;
  } else {
    lines.push(newLine);
  }
  writeFile(envFile, lines.join('\n'));
  return { previous };
}

export type RestoreResult = 'restored' | 'removed' | 'no-op';

/**
 * Shutdown counterpart of {@link upsertEnvCallbackUrl}: with a non-null
 * `previous` the original line is restored; with null the line we wrote is
 * removed. A missing file is a no-op.
 */
export function restoreEnvCallbackUrl(
  readFile: (path: string) => string | null,
  writeFile: (path: string, content: string) => void,
  envFile: string,
  previous: string | null,
): RestoreResult {
  const key = 'PAYWAY_CALLBACK_URL';
  const existing = readFile(envFile);
  if (existing === null) return 'no-op';
  const lines = existing.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
  if (previous !== null) {
    if (idx !== -1) {
      lines[idx] = `${key}=${previous}`;
    } else {
      lines.push(`${key}=${previous}`);
    }
    writeFile(envFile, lines.join('\n'));
    return 'restored';
  }
  if (idx === -1) return 'no-op';
  writeFile(
    envFile,
    lines.filter((l) => !l.trim().startsWith(`${key}=`)).join('\n'),
  );
  return 'removed';
}

/** The install-hint lines printed when cloudflared is missing. */
export function cloudflaredMissingLines(): string[] {
  return [
    'cloudflared not found.',
    'Please install it or provide a public URL.',
    'Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/',
    'Or use:  payway-sdk setup-webhook --url <your-public-url>',
  ];
}
