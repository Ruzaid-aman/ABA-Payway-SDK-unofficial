import * as crypto from 'node:crypto';

/**
 * Generates the PayWay HMAC signature.
 * Concatenates the values of the fields in the order specified by the fieldList,
 * substituting empty string for undefined/null values.
 *
 * `algorithm` defaults to sha512 (every merchant-portal/gateway endpoint).
 * The online-self-activation partner endpoints sign with sha256 per the
 * archived spec — except get-mc-credential-info, whose prose says sha512
 * (an in-spec inconsistency; see the self-activation domain). Callers that
 * need the non-default algorithm pass it explicitly.
 */
export function generateHmac(
  payload: Record<string, unknown>,
  fieldList: string[],
  apiKey: string,
  encoding: 'base64' | 'hex' = 'base64',
  algorithm: 'sha512' | 'sha256' = 'sha512',
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

  return crypto.createHmac(algorithm, apiKey).update(concatenated).digest(encoding);
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
 * Why {@link verifyCallbackSignature} rejected a callback (DX review
 * 2026-08-30: a bare boolean cannot tell a merchant whether the canonical
 * form, the key, or the payload shape was wrong).
 */
export type CallbackVerificationFailure = 'signature_mismatch' | 'malformed_signature' | 'empty_body';

export interface CallbackVerificationResult {
  valid: boolean;
  /** Present only when `valid === false`. */
  reason?: CallbackVerificationFailure;
}

/**
 * Detailed variant of {@link verifyCallbackSignature}: identical
 * canonicalization and timing-safe comparison, but returns *why* a callback
 * was rejected so integrators can self-diagnose (wrong key, missing header,
 * body passed with `hash` still attached, tampered payload).
 */
export function verifyCallbackDetailed(
  body: Record<string, unknown>,
  receivedSignature: string,
  apiKey: string,
  options?: { stripHash?: boolean },
): CallbackVerificationResult {
  if (typeof receivedSignature !== 'string' || receivedSignature.length === 0) {
    return { valid: false, reason: 'malformed_signature' };
  }
  if (!body || typeof body !== 'object') {
    return { valid: false, reason: 'empty_body' };
  }

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
    return { valid: false, reason: 'signature_mismatch' };
  }

  return crypto.timingSafeEqual(computedBuf, receivedBuf)
    ? { valid: true }
    : { valid: false, reason: 'signature_mismatch' };
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
  return verifyCallbackDetailed(body, receivedSignature, apiKey, options).valid;
}

/**
 * Sign a callback body with the same canonicalization the gateway uses
 * (sorted-key concat → HMAC-SHA512 → Base64) — the exact inverse of
 * {@link verifyCallbackDetailed}. Used by the webhook `trigger` fixtures so
 * a correctly-configured receiver accepts them, and by tests to build
 * adversarial invalid signatures. Sign a callback only when you are the
 * merchant testing your OWN receiver; the gateway is the signer in production.
 */
export function signCallbackBody(body: Record<string, unknown>, apiKey: string): string {
  const sortedKeys = Object.keys(body).sort();

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

  return crypto.createHmac('sha512', apiKey).update(concatenated).digest('base64');
}

/**
 * Verify a callback signature over the RAW HTTP request body, exactly as
 * received — the documented Customer Module (Customer Dedicated KHQR)
 * contract (ABA-bot relay 2026-10-03): "Compute HMAC-SHA512 (Base64) over
 * the exact raw HTTP request body bytes as received. Do not parse and
 * re-serialize JSON, and do not reorder keys." The sorted-key model exposed
 * by {@link verifyCallbackDetailed} describes how ABA internally constructs
 * the body; when your framework still holds the original bytes (e.g. Express
 * `express.raw`), prefer this verifier — re-serialization can silently break
 * key order or number formatting. Both verifiers agree on a byte-identical,
 * canonically-keyed body.
 *
 * @example Express with raw body capture:
 * ```ts
 * import { verifyCallbackSignatureRaw } from 'aba-payway-ts';
 * app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
 *   const ok = verifyCallbackSignatureRaw(req.body, req.header('X-PAYWAY-HMAC-SHA512') ?? '', process.env.PAYWAY_API_KEY!);
 *   if (!ok) { res.status(403).send('invalid signature'); return; } // log & discard
 *   res.sendStatus(200);
 *   // handle JSON.parse(req.body.toString()) asynchronously…
 * });
 * ```
 */
export function verifyCallbackSignatureRaw(
  rawBody: string | Buffer,
  receivedSignature: string,
  apiKey: string,
): boolean {
  if (typeof receivedSignature !== 'string' || receivedSignature.length === 0) return false;
  if (rawBody === undefined || rawBody === null) return false;
  const expected = crypto.createHmac('sha512', apiKey).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(receivedSignature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
