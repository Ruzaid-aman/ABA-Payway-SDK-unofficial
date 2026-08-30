/**
 * Loader for the `payment-link create --image <path>` flag: reads the file
 * and infers a sensible multipart content type from the extension.
 * Errors are plain Error messages the command renders with the exit-1 path.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PaymentLinkImage } from '../client.js';

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Infer the multipart MIME type for a payment-link image from its extension. */
export function contentTypeForImageFile(filePath: string): string {
  return CONTENT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Read and validate an image file for `paymentLink.create({ image })`. */
export function loadPaymentLinkImage(filePath: string): PaymentLinkImage {
  if (!existsSync(filePath)) {
    throw new Error(`--image file not found: ${filePath}`);
  }
  const data = readFileSync(filePath);
  if (data.byteLength === 0) {
    throw new Error(`--image file is empty: ${filePath}`);
  }
  return {
    data,
    filename: path.basename(filePath),
    contentType: contentTypeForImageFile(filePath),
  };
}
