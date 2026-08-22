/**
 * Agentic PayWay CLI — privacy scrubber.
 *
 * Recursively redacts sensitive data from values that may be written into
 * durable session files or sent to a provider for context. Redaction is by
 * secret KEY NAME (matching well-known secret-ish key substrings) and by exact
 * secret VALUE. Redaction is non-recoverable: replaced with the literal string
 * '[REDACTED]'. The input is never mutated; a new structure is returned.
 */

const REDACTED = '[REDACTED]';

const SECRET_KEY_PATTERNS: RegExp[] = [
  /apikey/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /authorization/i,
  /privatekey/i,
  /private[_-]?key/i,
  /\bpem\b/i,
  /merchantid/i,
  /merchant[_-]?id/i,
  /rsa/i,
  /x-api-key/i,
  /bearer/i,
  /credential/i,
];

function isSecretKeyName(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isSecretValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized === '') return false;
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Recursively scrub a value, redacting by secret key name and by exact secret
 * value. Returns a brand-new structure; the input is never mutated.
 */
export function scrubSensitive(value: unknown, secrets: string[]): unknown {
  const knownSecrets = secrets.filter((s) => typeof s === 'string' && s.trim() !== '');

  function scrub(node: unknown): unknown {
    if (node === null || typeof node !== 'object') {
      if (typeof node === 'string' && (knownSecrets.includes(node) || isSecretValue(node))) {
        return REDACTED;
      }
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((item) => scrub(item));
    }

    const source = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      const child = source[key];
      if (isSecretKeyName(key)) {
        result[key] = REDACTED;
        continue;
      }
      if (typeof child === 'string' && (knownSecrets.includes(child) || isSecretValue(child))) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = scrub(child);
    }
    return result;
  }

  return scrub(value);
}
