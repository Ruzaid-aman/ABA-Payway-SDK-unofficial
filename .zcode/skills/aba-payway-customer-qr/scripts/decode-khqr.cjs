#!/usr/bin/env node
/**
 * decode-khqr.js — Decode & validate a KHQR/EMVCo QR payload or a QR image.
 *
 * Usage:
 *   node decode-khqr.js "<khqr-string>"
 *   node decode-khqr.js path/to/qr-image.jpg
 *
 * String mode is dependency-free. Image mode requires: npm i jimp@0.22.12 jsqr
 * (run that install in this scripts folder if you need image decoding).
 *
 * Validates CRC-16/CCITT-FALSE per KHQR spec and prints the TLV tree.
 */
const fs = require('node:fs');

const ROOT_TAGS = {
  '00': 'Payload Format Indicator',
  '01': 'Point of Initiation Method (11=static/reusable, 12=dynamic/single-use)',
  29: 'Merchant Account Info — individual (KHQR)',
  30: 'Merchant Account Info — merchant/bakong (KHQR)',
  31: 'Merchant Account Info — merchant by FFT (KHQR)',
  32: 'Merchant Account Info — KHQR (other)',
  33: 'Merchant Account Info — bakong (other)',
  50: 'Merchant Name (alternate)',
  52: 'Merchant Category Code (MCC)',
  53: 'Transaction Currency (ISO 4217 numeric: 840=USD, 116=KHR)',
  54: 'Transaction Amount (absent = payer enters amount)',
  55: 'Tip or Convenience Indicator',
  56: 'Convenience Fee Fixed',
  57: 'Convenience Fee Percentage',
  58: 'Country Code',
  59: 'Merchant Name',
  60: 'Merchant City',
  61: 'Postal Code',
  62: 'Additional Data Template',
  63: 'CRC-16 Checksum',
  64: 'Additional Merchant Data',
  80: 'Unreserved Template',
  68: 'PayWay Routing Template (proprietary)',
  99: 'PayWay Root Extension (proprietary)',
};
const SUB_TAGS = {
  '00': 'Bakong Account ID / scheme identifier',
  '01': 'Account number / outlet code',
  '02': 'Bank name / merchant ID',
  '03': 'Store label',
  '04': 'Loyalty number',
  '05': 'Reference label / QR-type flag',
  '06': 'Customer label',
  '07': 'Terminal label',
  '08': 'Purpose of transaction',
  68: 'PayWay nested marker',
};

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function crcValid(raw) {
  const crc = validateCrc(raw);
  return Boolean(crc.present && crc.ok);
}

function isNestedTemplate(s) {
  if (s.length < 8) return false;
  let i = 0;
  while (i + 4 <= s.length) {
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len) || i + 4 + len > s.length) return false;
    i += 4 + len;
  }
  return i === s.length;
}

function parseTlv(s, indent, path) {
  const out = [];
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    const val = s.slice(i + 4, i + 4 + len);
    if (Number.isNaN(len) || val.length !== len) {
      out.push(`${indent}!! MALFORMED at offset ${i}: tag=${tag} len=${len}`);
      break;
    }
    const p = path ? `${path}.${tag}` : tag;
    const name = (path ? SUB_TAGS[tag] : ROOT_TAGS[tag]) || '';
    out.push(`${indent}[${p}] len=${len}${name ? `  ${name}` : ''}`);
    out.push(`${indent}    value: "${val}"`);
    if (tag !== '63' && isNestedTemplate(val)) {
      out.push(...parseTlv(val, `${indent}    `, p));
    }
    i += 4 + len;
  }
  if (i !== s.length) out.push(`${indent}!! trailing garbage: "${s.slice(i)}"`);
  return out;
}

function validateCrc(raw) {
  const m = raw.match(/^(.*6304)([0-9A-Fa-f]{4})$/);
  if (!m) return { present: false };
  const computed = crc16(m[1]);
  return { present: true, stored: m[2].toUpperCase(), computed, ok: computed === m[2].toUpperCase() };
}

function summarize(raw) {
  const flags = [];
  const get = (tag) => {
    let i = 0;
    while (i + 4 <= raw.length) {
      const t = raw.slice(i, i + 2);
      const l = parseInt(raw.slice(i + 2, i + 4), 10);
      if (t === tag) return raw.slice(i + 4, i + 4 + l);
      if (Number.isNaN(l)) return undefined;
      i += 4 + l;
    }
    return undefined;
  };
  const pim = get('01');
  flags.push(
    `Type: ${pim === '12' ? 'DYNAMIC (single-use)' : pim === '11' ? 'STATIC (reusable, no expiry)' : 'unspecified (default static)'}`,
  );
  const cur = get('53');
  flags.push(`Currency: ${cur === '840' ? 'USD' : cur === '116' ? 'KHR' : cur || 'not set (payer chooses)'}`);
  const amt = get('54');
  flags.push(`Amount: ${amt ? `FIXED (${amt})` : 'OPEN (payer enters)'}`);
  flags.push(`Merchant: ${get('59') || '?'} / ${get('60') || '?'}`);
  flags.push(
    `PayWay routing tags (62.68/99): ${raw.includes('PAYWAY@ABA') || /99\d{2}00\d{2}/.test(raw) ? 'present → portal/customer-module or online QR' : 'absent → plain offline KHQR'}`,
  );
  return flags;
}

async function decodeImage(file) {
  let Jimp, jsQR;
  try {
    Jimp = require('jimp');
    jsQR = require('jsqr');
  } catch {
    console.error(
      'Image mode needs jimp + jsqr. Install them OUTSIDE this skill folder (it ships via `skills add`):\n' +
        '  mkdir ~/.payway-qr-deps && cd ~/.payway-qr-deps && npm init -y && npm i jimp@0.22.12 jsqr\n' +
        'Then run with NODE_PATH (PowerShell: $env:NODE_PATH="~/.payway-qr-deps/node_modules"):\n' +
        '  NODE_PATH=~/.payway-qr-deps/node_modules node decode-khqr.cjs image.jpg\n' +
        'Or pass the raw QR string instead.',
    );
    process.exit(2);
  }
  const image = await Jimp.read(file);
  const { data, width, height } = image.bitmap;
  const res = jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: 'attemptBoth' });
  if (!res) {
    console.error('No QR detected in image.');
    process.exit(1);
  }
  return res.data;
}

module.exports = { crc16, crcValid, validateCrc, parseTlv, summarize, isNestedTemplate };

if (require.main === module) {
  (async () => {
    const arg = process.argv[2];
    if (!arg) {
      console.error('Usage: node decode-khqr.cjs "<khqr-string>" | <image-path>');
      process.exit(2);
    }
    let raw = arg;
    if (fs.existsSync(arg)) raw = await decodeImage(arg);

    console.log(`=== RAW PAYLOAD (${raw.length} chars) ===`);
    console.log(raw);
    console.log('\n=== TLV TREE ===');
    console.log(parseTlv(raw, '', '').join('\n'));
    console.log('\n=== SUMMARY ===');
    for (const f of summarize(raw)) console.log(`- ${f}`);
    const crc = validateCrc(raw);
    console.log('\n=== CRC-16 (CCITT-FALSE) ===');
    if (!crc.present) console.log('No CRC tag found — INVALID KHQR');
    else
      console.log(
        `stored=${crc.stored} computed=${crc.computed} → ${crc.ok ? 'VALID ✓' : 'INVALID ✗ (payload corrupted or hand-edited)'}`,
      );
  })();
}
