/**
 * Minimal ANSI styling helpers shared by the agent command modules.
 *
 * Styling resolves through the TUI theme layer (`cli/ui/theme.ts`) at CALL
 * time, so agent output honours the same color controls as the rest of the
 * CLI (`--no-color`, `NO_COLOR`, `FORCE_COLOR`, TTY detection). The six
 * function names are load-bearing: every agent module imports this object
 * as `c`.
 */
import { lazyPalette } from '../cli/ui/theme.js';

export const ansi = lazyPalette();
