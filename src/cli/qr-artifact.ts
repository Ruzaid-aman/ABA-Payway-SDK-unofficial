import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

export async function saveQrPng(input: {
  outputPath: string;
  qrImage?: string;
  qrString?: string;
}): Promise<string | undefined> {
  const resolvedPath = path.resolve(input.outputPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });

  if (input.qrImage) {
    const base64Data = input.qrImage.includes('base64,') ? input.qrImage.split('base64,')[1] : input.qrImage;
    writeFileSync(resolvedPath, Buffer.from(base64Data, 'base64'));
    return resolvedPath;
  }

  if (input.qrString) {
    await QRCode.toFile(resolvedPath, input.qrString, { type: 'png' });
    return resolvedPath;
  }

  return undefined;
}
