export const PRODUCTION_CONFIRMATION_PHRASE = 'CONFIRM PRODUCTION';

interface TtyStream {
  isTTY?: boolean;
}

/** Interactive authorization is available only when both terminal directions are TTYs. */
export function isInteractiveTerminal(stdin: TtyStream = process.stdin, stdout: TtyStream = process.stdout): boolean {
  return stdin.isTTY === true && stdout.isTTY === true;
}
