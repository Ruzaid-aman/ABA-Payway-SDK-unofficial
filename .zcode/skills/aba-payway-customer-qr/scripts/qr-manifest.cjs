#!/usr/bin/env node
/**
 * qr-manifest.cjs — Batch-decode a folder of Customer Module QR images
 * (portal-downloaded JPGs) into an audit manifest: bakong ID, account,
 * merchant name/city, outlet code, PayWay merchant ID, profile ID, CRC status.
 *
 * Image decoding needs optional deps installed OUTSIDE this skill folder
 * (the folder ships via `skills add`):
 *   mkdir ~/.payway-qr-deps && cd ~/.payway-qr-deps && npm init -y && npm i jimp@0.22.12 jsqr
 *   NODE_PATH=~/.payway-qr-deps/node_modules node qr-manifest.cjs ./qr-downloads --csv manifest.csv
 *
 * Usage:
 *   node qr-manifest.cjs ./qr-downloads --csv manifest.csv
 *   node qr-manifest.cjs ./qr-downloads --json manifest.json
 *
 * Output columns: file, bakong_id, account_number, bank, merchant_name,
 * merchant_city, currency, type (STATIC/DYNAMIC), outlet_code, merchant_id,
 * profile_id, mmp, crc_valid.
 */
const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png']);

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
  const m = raw.match(/^(.*6304)([0-9A-Fa-f]{4})$/);
  return m ? crc16(m[1]) === m[2].toUpperCase() : false;
}

function flattenTlv(s, prefix, out) {
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) break;
    const val = s.slice(i + 4, i + 4 + len);
    if (val.length !== len) break;
    const key = prefix ? `${prefix}.${tag}` : tag;
    out[key] = val;
    if (tag !== '63' && len >= 8) {
      let j = 0,
        nested = true;
      while (j + 4 <= val.length) {
        const l2 = parseInt(val.slice(j + 2, j + 4), 10);
        if (Number.isNaN(l2) || j + 4 + l2 > val.length) {
          nested = false;
          break;
        }
        j += 4 + l2;
      }
      if (nested && j === val.length) flattenTlv(val, key, out);
    }
    i += 4 + len;
  }
  return out;
}

function extractManifest(raw, file) {
  const t = flattenTlv(raw, '', {});
  return {
    file: path.basename(file),
    bakong_id: t['30.00'] || t['29.00'] || '',
    account_number: t['30.01'] || t['29.01'] || '',
    bank: t['30.02'] || t['29.02'] || '',
    merchant_name: t['59'] || '',
    merchant_city: t['60'] || '',
    currency: t['53'] === '840' ? 'USD' : t['53'] === '116' ? 'KHR' : t['53'] || '',
    type: t['01'] === '12' ? 'DYNAMIC' : 'STATIC',
    outlet_code: t['62.68.01'] || '',
    merchant_id: t['62.68.02'] || '',
    profile_id: t['99.00'] || '',
    mmp: t['99.68'] || '',
    crc_valid: crcValid(raw),
  };
}

async function decodeImageFile(file) {
  let Jimp, jsQR;
  try {
    Jimp = require('jimp');
    jsQR = require('jsqr');
  } catch {
    throw new Error(
      'image decoding needs deps — install in a scratch folder and use NODE_PATH:\n  mkdir ~/.payway-qr-deps && cd ~/.payway-qr-deps && npm init -y && npm i jimp@0.22.12 jsqr\n  NODE_PATH=~/.payway-qr-deps/node_modules node qr-manifest.cjs ./qr-downloads',
    );
  }
  const image = await Jimp.read(file);
  const { data, width, height } = image.bitmap;
  const res = jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: 'attemptBoth' });
  return res ? res.data : null;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(argv[i]);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = args._[0] || args.dir;
  if (!folder || !fs.existsSync(folder)) {
    console.error('Usage: node qr-manifest.cjs <folder-of-qr-images> [--csv manifest.csv] [--json manifest.json]');
    process.exit(2);
  }

  const files = fs.readdirSync(folder).filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
  if (files.length === 0) {
    console.error(`No JPG/PNG files found in ${folder}`);
    process.exit(2);
  }

  const rows = [];
  for (const f of files) {
    const full = path.join(folder, f);
    try {
      const raw = await decodeImageFile(full);
      if (!raw) {
        rows.push({ file: f, crc_valid: false, error: 'no QR detected' });
        continue;
      }
      rows.push(extractManifest(raw, full));
    } catch (e) {
      rows.push({ file: f, crc_valid: false, error: e.message });
      if (e.message.includes('deps')) process.exit(2);
    }
  }

  const cols = [
    'file',
    'bakong_id',
    'account_number',
    'bank',
    'merchant_name',
    'merchant_city',
    'currency',
    'type',
    'outlet_code',
    'merchant_id',
    'profile_id',
    'mmp',
    'crc_valid',
  ];
  const esc = (v) =>
    v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

  console.log(rows.map((r) => cols.map((c) => esc(r[c])).join(' | ')).join('\n'));
  console.log(
    `\n${rows.length} QR(s) processed, ${rows.filter((r) => r.crc_valid).length} CRC-valid, ${rows.filter((r) => r.error).length} failed.`,
  );

  if (typeof args.csv === 'string') {
    fs.writeFileSync(
      args.csv,
      `${cols.join(',')}\n${rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n')}\n`,
    );
    console.log(`CSV written: ${args.csv}`);
  }
  if (typeof args.json === 'string') {
    fs.writeFileSync(args.json, JSON.stringify(rows, null, 2));
    console.log(`JSON written: ${args.json}`);
  }
}

module.exports = { crc16, crcValid, flattenTlv, extractManifest };

if (require.main === module) main();
