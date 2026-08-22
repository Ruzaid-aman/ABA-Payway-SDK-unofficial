import { isIP } from 'node:net';

function isPrivateOrReservedIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function isPublicHost(hostname: string): boolean {
  const literal = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const family = isIP(literal);
  if (family === 4) return !isPrivateOrReservedIpv4(literal);
  // Public callbacks intentionally reject all IPv6 literals.
  if (family === 6) return false;

  const host = literal.replace(/\.+$/, '');
  if (host.length === 0 || !host.includes('.')) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local') || host.endsWith('.test') || host.endsWith('.example')) return false;
  return true;
}

/** Return true only for an HTTPS URL with a public DNS name or public IPv4 literal. */
export function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && isPublicHost(parsed.hostname);
  } catch {
    return false;
  }
}
