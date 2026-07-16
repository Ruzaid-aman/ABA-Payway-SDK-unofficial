import * as crypto from 'node:crypto';

/**
 * Generates the PayWay HMAC signature.
 * Concatenates the values of the fields in the order specified by the fieldList,
 * substituting empty string for undefined/null values.
 */
export function generateHmac(
  payload: Record<string, any>,
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
export function encryptMerchantAuth(data: Record<string, any>, publicKeyPem: string): string {
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
 */
export function verifyCallbackSignature(body: Record<string, any>, receivedSignature: string, apiKey: string): boolean {
  // Sort response keys ascending
  const sortedKeys = Object.keys(body).sort();

  // Concatenate all values, JSON-encoding any array/object values
  const concatenated = sortedKeys
    .map((key) => {
      const val = body[key];
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

  const computedBuf = Buffer.from(computedSignature);
  const receivedBuf = Buffer.from(receivedSignature);

  if (computedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, receivedBuf);
}
