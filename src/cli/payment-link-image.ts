/**
 * Loader for the `payment-link create --image <path>` flag: reads the file
 * and infers the multipart content type from the extension.
 * Errors are plain Error messages the command renders with the exit-1 path.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PaymentLinkImage } from '../client.js';

/**
 * Spec (payway-openapi/paths/payment-link.yaml:33–37): payment-link images
 * are JPG/JPEG/PNG only. The common `image/jpg` misspelling of
 * `image/jpeg` is not needed here (extensions map to the canonical type).
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

/**
 * Reject a payment-link image path whose extension is outside the
 * spec-allowed JPG/JPEG/PNG set. Throws a plain Error — the command renders
 * loader errors with exit 1.
 */
function assertSupportedImageExtension(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(
      `--image: unsupported image type '${ext || path.basename(filePath)}' — the spec allows JPG/JPEG/PNG only`,
    );
  }
}

/**
 * Infer the multipart MIME type for a payment-link image from its extension.
 * Throws for extensions outside the spec-allowed JPG/JPEG/PNG set.
 */
export function contentTypeForImageFile(filePath: string): string {
  assertSupportedImageExtension(filePath);
  return CONTENT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()];
}

/**
 * Read and validate an image file for `paymentLink.create({ image })`.
 * Throws when the file is missing, empty, or has an extension outside the
 * spec-allowed JPG/JPEG/PNG set.
 */
export function loadPaymentLinkImage(filePath: string): PaymentLinkImage {
  if (!existsSync(filePath)) {
    throw new Error(`--image file not found: ${filePath}`);
  }
  assertSupportedImageExtension(filePath);
  const data = readFileSync(filePath);
  if (data.byteLength === 0) {
    throw new Error(`--image file is empty: ${filePath}`);
  }
  return {
    data,
    filename: path.basename(filePath),
    contentType: CONTENT_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()],
  };
}
