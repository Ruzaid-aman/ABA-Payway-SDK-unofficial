import * as crypto from 'node:crypto';

/**
 * Generates the PayWay HMAC signature.
 * Concatenates the values of the fields in the order specified by the fieldList,
 * substituting empty string for undefined/null values.
 */
export function generateHmac(
  payload: Record<string, unknown>,
  fieldList: string[],
  apiKey: string,
  encoding: 'base64' | 'hex' = 'base64',
): string {
  const concatenated = fieldList
    .map((field) => {
      const val = payload[field];
      if (val === undefined || val === null) {
        return '';
      }
      return String(val);
    })
    .join('');

  return crypto.createHmac('sha512', apiKey).update(concatenated).digest(encoding);
}

/**
 * Encrypts data using RSA public key encryption with PKCS1 padding.
 * Plaintext is split into 117-byte chunks, each chunk is encrypted,
 * the encrypted chunks are concatenated, and the final buffer is Base64 encoded.
 */
export function encryptMerchantAuth(data: unknown, publicKeyPem: string): string {
  const jsonStr = JSON.stringify(data);
  const buffer = Buffer.from(jsonStr, 'utf8');
  const chunkSize = 117;
  const encryptedChunks: Buffer[] = [];

  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      chunk,
    );
    encryptedChunks.push(encrypted);
  }

  return Buffer.concat(encryptedChunks).toString('base64');
}

/**
 * Verifies a webhook signature using PayWay's sorted-key signature validation algorithm.
 *
 * @param options.stripHash - Strip a `hash` field from the body before
 *   verifying. Default `false` for backward compatibility: raw callback
 *   payloads that still carry `hash` never validate unless it is removed
 *   first (the webhook server strips it; direct callers can now opt in).
 */
export function verifyCallbackSignature(
  body: Record<string, unknown>,
  receivedSignature: string,
  apiKey: string,
  options?: { stripHash?: boolean },
): boolean {
  const payload = options?.stripHash
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'hash'))
    : body;

  // Sort response keys ascending
  const sortedKeys = Object.keys(payload).sort();

  // Concatenate all values, JSON-encoding any array/object values
  const concatenated = sortedKeys
    .map((key) => {
      const val = payload[key];
      if (val === undefined || val === null) {
        return '';
      }
      if (typeof val === 'object') {
        return JSON.stringify(val);
      }
      return String(val);
    })
    .join('');

  const computedSignature = crypto.createHmac('sha512', apiKey).update(concatenated).digest('base64');

  const computedBuf = Buffer.from(computedSignature, 'utf8');
  const receivedBuf = Buffer.from(receivedSignature, 'utf8');

  if (computedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, receivedBuf);
}
