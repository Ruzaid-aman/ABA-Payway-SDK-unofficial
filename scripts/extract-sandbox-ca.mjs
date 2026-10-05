/**
 * Extract the sandbox TLS CA bundle → payway-sandbox-ca.pem (DX-SEC-001).
 *
 * The safe alternative to the classic TLS-verification-bypass env var: extract the
 * certificate chain the gateway actually presents and point PAYWAY_TLS_CA_FILE
 * (or the SDK `tlsCaFile` option) at the bundle. The file is gitignored —
 * it must NEVER be committed.
 *
 *   node scripts/extract-sandbox-ca.mjs
 *
 * Under the hood it runs the raw extraction command and post-processes it:
 *
 *   openssl s_client -showcerts -connect checkout-sandbox.payway.com.kh:443 \
 *     -servername checkout-sandbox.payway.com.kh </dev/null
 *
 * Why the post-processing: the sandbox chain stops at a CROSS-SIGNED root
 * whose own issuer is never presented — trusting that dead-end variant makes
 * the OpenSSL chain builder fail with `unable to get issuer certificate`
 * even though the matching self-signed root is in the bundle. The script
 * therefore anchors the bundle at the matching SELF-SIGNED root from Node's
 * own bundled store (kept first), keeps every presented non-self-signed
 * certificate, and drops dead ends (certificates whose issuer is resolvable
 * by nothing in the final bundle). Verified live 2026-10-05:
 *   PAYWAY_TLS_CA_FILE="$PWD/payway-sandbox-ca.pem" npx tsx src/cli.ts exchange-rate --json
 * succeeds with the bypass env var unset.
 */
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import tls from 'node:tls';

const HOST = 'checkout-sandbox.payway.com.kh';
const OUT = 'payway-sandbox-ca.pem';

const parse = (pem) => new X509Certificate(pem);
const isCert = (pem) => {
  try {
    parse(pem);
    return true;
  } catch {
    return false;
  }
};
const isSelfSigned = (pem) => parse(pem).subject === parse(pem).issuer;

const probe = spawnSync(
  'openssl',
  ['s_client', '-showcerts', '-connect', `${HOST}:443`, '-servername', HOST],
  { encoding: 'utf8', input: '' },
);
if (probe.error || !probe.stdout) {
  console.error(
    `Could not run "openssl s_client -showcerts -connect ${HOST}:443" (${probe.error?.message ?? 'no output'}). ` +
      'openssl must be on PATH (Git Bash / Git for Windows ships it).',
  );
  process.exit(1);
}

// Anchor: the matching SELF-SIGNED root from Node's bundled store (kept
// first) — see the dead-end explanation in the header comment.
const anchor = tls.rootCertificates.find((pem) => {
  try {
    const cert = parse(pem);
    return cert.subject.includes('GlobalSign Root CA - R3') && cert.subject === cert.issuer;
  } catch {
    return false;
  }
});

let keep = (probe.stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [])
  .filter(isCert)
  .filter((pem) => !isSelfSigned(pem));

// Drop dead ends (fixpoint): a presented certificate whose issuer is
// resolvable by nothing in the final bundle — e.g. the cross-signed root.
for (;;) {
  const resolvable = new Set(keep.map((pem) => parse(pem).subject));
  if (anchor) resolvable.add(parse(anchor).subject);
  const next = keep.filter((pem) => resolvable.has(parse(pem).issuer));
  if (next.length === keep.length) break;
  keep = next;
}

if (!anchor || keep.length === 0) {
  console.error(
    `Could not build the CA bundle from what ${HOST} presented ` +
      '(no matching self-signed anchor or no presented chain). Report the chain to the maintainers.',
  );
  process.exit(1);
}

writeFileSync(OUT, [anchor, ...keep].map((pem) => `${pem.trim()}\n`).join('\n'));
console.error(`${OUT} written: ${1 + keep.length} certificates (self-signed anchor first).`);
console.error('Verify: PAYWAY_TLS_CA_FILE="$PWD/payway-sandbox-ca.pem" npx tsx src/cli.ts exchange-rate --json');
