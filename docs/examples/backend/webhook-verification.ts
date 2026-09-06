import { verifyCallbackSignature } from 'aba-payway-ts';

export interface WebhookHeaders {
  'x-payway-hmac-sha512'?: string | string[];
  [header: string]: string | string[] | undefined;
}

export function extractWebhookSignature(headers: WebhookHeaders): string | undefined {
  const rawSignature = headers['x-payway-hmac-sha512'];
  if (typeof rawSignature === 'string') {
    return rawSignature;
  }
  if (Array.isArray(rawSignature)) {
    return rawSignature[0];
  }
  return undefined;
}

export function removeHashField(body: Record<string, unknown>): Record<string, unknown> {
  const { hash, ...payload } = body;
  return payload;
}

export function verifyWebhookSignature(
  body: Record<string, unknown>,
  signature: string,
  apiKey: string,
): boolean {
  const payload = removeHashField(body);
  return verifyCallbackSignature(payload, signature, apiKey);
}
