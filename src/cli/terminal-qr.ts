/**
 * Render a scannable QR code directly in the terminal.
 * Uses the `qrcode` package's half-block terminal renderer — no image files,
 * works over SSH, and is immediately scannable by the ABA app.
 */
import QRCode from 'qrcode';

export async function renderQrToTerminal(content: string): Promise<string> {
  return QRCode.toString(content, { type: 'terminal', small: true, margin: 1 });
}

/** Render a QR payload to a PNG buffer (used to save KHQRs without an API image). */
export async function renderQrToPngBuffer(content: string): Promise<Buffer> {
  return QRCode.toBuffer(content, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512 });
}

/** True when we should auto-render QRs (interactive terminal). */
export function shouldAutoRenderQr(stream: { isTTY?: boolean } | undefined, flag?: boolean): boolean {
  if (flag === false) return false;
  if (flag === true) return true;
  return Boolean(stream?.isTTY);
}
