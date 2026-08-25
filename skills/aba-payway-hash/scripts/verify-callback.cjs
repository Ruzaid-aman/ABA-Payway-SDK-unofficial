#!/usr/bin/env node
/**
 * verify-callback.cjs — Verify an ABA PayWay webhook/callback signature.
 *
 * Replicates the SDK's algorithm (src/auth.ts verifyCallbackSignature):
 *   1. Sort the JSON body keys ascending.
 *   2. Concatenate the values (JSON-encode nested objects/arrays, '' for null).
 *   3. HMAC-SHA512, keyed by the API key, Base64 digest.
 *   4. Timing-safe compare against the X-PAYWAY-HMAC-SHA512 header value.
 *
 * Usage:
 *   node verify-callback.cjs --body '{"tran_id":"x",...}' --sig "abc123=="
 *   node verify-callback.cjs --body-file callback.json --sig "abc123=="
 *   curl -s https://your.api/callback | node verify-callback.cjs --sig "abc123=="
 *
 * Key: --api-key flag or PAYWAY_API_KEY env.
 * Exit codes: 0 = valid, 1 = INVALID, 2 = usage error.
 * NEVER process a callback that fails this check — log and discard (MITM risk).
 */
const crypto = require('node:crypto');

function buildConcatenated(body) {
  return Object.keys(body)
    .sort()
    .map((key) => {
      const val = body[key];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    })
    .join('');
}

function computeSignature(body, apiKey) {
  return crypto.createHmac('sha512', apiKey).update(buildConcatenated(body)).digest('base64');
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // keep constant-time shape even on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyCallback(body, receivedSignature, apiKey) {
  const computed = computeSignature(body, apiKey);
  return { computed, valid: timingSafeEqual(computed, receivedSignature) };
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args['api-key'] || process.env.PAYWAY_API_KEY;
  if (!apiKey) {
    console.error('Missing API key. Pass --api-key or set PAYWAY_API_KEY.');
    process.exit(2);
  }
  const sig = args.sig || process.env.X_PAYWAY_HMAC_SHA512;
  if (!sig || sig === true) {
    console.error('Missing signature. Pass --sig "<X-PAYWAY-HMAC-SHA512 header value>".');
    process.exit(2);
  }

  let raw = args.body;
  if (!raw && args['body-file']) raw = require('node:fs').readFileSync(args['body-file'], 'utf8');
  if (!raw) raw = await readStdin();
  if (!raw?.trim()) {
    console.error("Missing body. Pass --body '<json>', --body-file <path>, or pipe the raw body via stdin.");
    process.exit(2);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    console.error(`Body is not valid JSON: ${e.message}`);
    process.exit(2);
  }

  const { computed, valid } = verifyCallback(body, sig, apiKey);

  console.log('=== CALLBACK SIGNATURE CHECK ===');
  console.log(`algorithm:   sorted-key concat → HMAC-SHA512 → Base64 (timing-safe compare)`);
  console.log(`received:    ${sig}`);
  console.log(`computed:    ${computed}`);
  console.log(
    `verdict:     ${valid ? 'VALID — safe to process' : 'INVALID — DO NOT PROCESS. Log and discard (possible spoof/MITM).'}`,
  );
  console.log('\n=== PARSED PAYLOAD (sorted keys) ===');
  for (const key of Object.keys(body).sort()) {
    const v = body[key];
    console.log(`  ${key}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`);
  }
  if (body.tran_id || body.merchant_ref) {
    console.log('\nNext: confirm the order via check-transaction/get-transactions-by-mc-ref before fulfilling.');
  }
  process.exit(valid ? 0 : 1);
}

module.exports = { buildConcatenated, computeSignature, timingSafeEqual, verifyCallback };

if (require.main === module) main();
