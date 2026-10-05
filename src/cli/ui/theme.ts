/**
 * Terminal theme primitives for the CLI TUI layer.
 *
 * Zero-dependency ANSI styling with three switches, checked in order:
 * 1. runtime override (`setColorOverride`, wired to the global `--no-color` flag)
 * 2. `NO_COLOR` env (https://no-color.org) — any non-empty value disables color
 * 3. `FORCE_COLOR` env — any non-empty value forces color (CI logs etc.)
 * 4. TTY detection on the target stream
 */

interface TtyStream {
  isTTY?: boolean;
}

type AnsiFn = (s: string) => string;

export interface AnsiPalette {
  bold: AnsiFn;
  dim: AnsiFn;
  green: AnsiFn;
  red: AnsiFn;
  yellow: AnsiFn;
  cyan: AnsiFn;
}

let colorOverride: boolean | undefined;

/** Force color on/off regardless of TTY/env (used by the global `--no-color` flag). */
export function setColorOverride(enabled: boolean | undefined): void {
  colorOverride = enabled;
}

function envFlag(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

export function isColorEnabled(stream: TtyStream = process.stdout, env: NodeJS.ProcessEnv = process.env): boolean {
  if (colorOverride !== undefined) return colorOverride;
  if (envFlag(env.NO_COLOR)) return false;
  if (envFlag(env.FORCE_COLOR)) return true;
  return stream.isTTY === true;
}

const identity: AnsiFn = (s) => s;

function wrap(code: string): AnsiFn {
  return (s: string) => `\x1b[${code}m${s}\x1b[0m`;
}

/** Palette matching the shape of the legacy `c` object in src/cli.ts. */
export function createStyler(enabled: boolean): AnsiPalette {
  if (!enabled) {
    return { bold: identity, dim: identity, green: identity, red: identity, yellow: identity, cyan: identity };
  }
  return {
    bold: wrap('1'),
    dim: wrap('2'),
    green: wrap('32'),
    red: wrap('31'),
    yellow: wrap('33'),
    cyan: wrap('36'),
  };
}

/** Palette for the current process, resolving TTY/env/override once. */
export function currentPalette(stream: TtyStream = process.stdout, env: NodeJS.ProcessEnv = process.env): AnsiPalette {
  return createStyler(isColorEnabled(stream, env));
}

/**
 * Palette for module-level `const c = lazyPalette()` in command modules: the
 * Proxy forwards every property access to `currentPalette()` at CALL time, so
 * a `setColorOverride()` issued after module load (the global `--no-color`
 * flag is parsed long after imports run) still restyles existing call sites.
 * A plain `currentPalette()` constant would freeze the switch state instead.
 */
export function lazyPalette(): AnsiPalette {
  return new Proxy({} as AnsiPalette, {
    get(_target, property) {
      const palette = currentPalette();
      const value = palette[property as keyof AnsiPalette];
      return typeof value === 'function' ? (value as AnsiFn).bind(palette) : value;
    },
  });
}
