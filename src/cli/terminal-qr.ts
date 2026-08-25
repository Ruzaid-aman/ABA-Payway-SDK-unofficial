/**
 * Render a scannable QR code directly in the terminal.
 * Uses the `qrcode` package's half-block terminal renderer — no image files,
 * works over SSH, and is immediately scannable by the ABA app.
 */
import QRCode from 'qrcode';

export async function renderQrToTerminal(content: string): Promise<string> {
  return QRCode.toString(content, { type: 'terminal', small: true, margin: 1 });
}

/** True when we should auto-render QRs (interactive terminal). */
export function shouldAutoRenderQr(stream: { isTTY?: boolean } | undefined, flag?: boolean): boolean {
  if (flag === false) return false;
  if (flag === true) return true;
  return Boolean(stream?.isTTY);
}
