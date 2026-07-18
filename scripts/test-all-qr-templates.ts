#!/usr/bin/env npx tsx
/**
 * Quick test: Generate QR codes for ALL PayWay templates at $5.00 each.
 *
 * Usage:  npx tsx scripts/test-all-qr-templates.ts
 *
 * Requires PAYWAY_MERCHANT_ID + PAYWAY_API_KEY in env (sandbox).
 */

import { PayWay } from '../src/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = join(import.meta.dirname ?? '.', '..', 'test-logs', 'qr-images');

const TEMPLATES = [
  'template1',
  'template1_color',
  'template2',
  'template2_color',
  'template3_color',
  'template4',
  'template4_color',
  'template5',
  'template5_color',
  'template6_color',
] as const;

const CALLBACK_URL =
  process.env.PAYWAY_CALLBACK_URL ?? 'https://webhook.site/51bc2004-9fcf-428b-97d4-6ed54e0ba40e';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  QR Template Test — $5.00 USD × 10 templates          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`  📁 Saving QR images to: ${OUTPUT_DIR}\n`);

  const payway = new PayWay();

  const results: Array<{
    template: string;
    ok: boolean;
    duration: number;
    qrString: string;
    hasImage: boolean;
    error?: string;
  }> = [];

  for (const template of TEMPLATES) {
    const start = Date.now();
    process.stdout.write(`  ${template.padEnd(20)} … `);

    try {
      const txId = `QR-${template.replace(/_/g, '')}-${Date.now().toString(36)}`.slice(0, 20);
      const qr = await payway.qr.generateQr({
        transactionId: txId,
        amount: 5.0,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        callbackUrl: CALLBACK_URL,
        qrImageTemplate: template,
      });

      const duration = Date.now() - start;
      const hasQrString = Boolean(qr.qrString);
      const hasImage = Boolean(qr.qrImage);

      console.log(`✓  ${duration}ms  qr_string=${hasQrString ? 'yes' : 'no'}  image=${hasImage ? 'yes' : 'no'}`);

      // Save QR image and string to files
      if (qr.qrImage) {
        const base64Data = qr.qrImage.replace(/^data:image\/png;base64,/, '');
        const imgPath = join(OUTPUT_DIR, `${template}.png`);
        writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
        console.log(`    📷 Saved: ${imgPath}`);
      }
      if (qr.qrString) {
        const strPath = join(OUTPUT_DIR, `${template}-qr-string.txt`);
        writeFileSync(strPath, qr.qrString, 'utf8');
        console.log(`    📝 Saved: ${strPath}`);
      }

      results.push({
        template,
        ok: true,
        duration,
        qrString: qr.qrString ?? '',
        hasImage,
      });
    } catch (err: any) {
      const duration = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      const rawBody = err.rawBody ? JSON.stringify(err.rawBody).slice(0, 300) : '';
      const paywayCode = err.paywayCode ?? '';
      console.log(`✗  ${duration}ms  ${msg}`);
      if (rawBody) console.log(`    rawBody: ${rawBody}`);
      if (paywayCode) console.log(`    paywayCode: ${paywayCode}`);

      results.push({
        template,
        ok: false,
        duration,
        qrString: '',
        hasImage: false,
        error: msg,
      });
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log('\n─── Summary ─────────────────────────────────────');
  console.log(`  Passed: ${passed}/${TEMPLATES.length}  Failed: ${failed}`);
  console.log(`  Avg response: ${Math.round(results.reduce((s, r) => s + r.duration, 0) / results.length)}ms`);
  console.log(`  Callback URL: ${CALLBACK_URL}`);

  if (failed > 0) {
    console.log('\n  Failed templates:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`    ${r.template}: ${r.error}`);
    }
  }

  console.log('\n─── QR String Preview (first 50 chars) ──────────');
  for (const r of results.filter((r) => r.ok)) {
    console.log(`  ${r.template.padEnd(20)} ${r.qrString.slice(0, 50)}…`);
  }

  // Save summary manifest
  const manifest = {
    generated: new Date().toISOString(),
    amount: 5.0,
    currency: 'USD',
    callbackUrl: CALLBACK_URL,
    templates: results.map((r) => ({
      template: r.template,
      ok: r.ok,
      duration: r.duration,
      transactionId: r.qrString ? extractTxId(r.qrString) : undefined,
      imageFile: r.ok ? `${r.template}.png` : undefined,
      qrStringFile: r.ok ? `${r.template}-qr-string.txt` : undefined,
      error: r.error,
    })),
  };
  const manifestPath = join(OUTPUT_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n  📋 Manifest saved: ${manifestPath}`);
}

function extractTxId(qrString: string): string | undefined {
  // Parse TLV to find tag 01 (transaction ID / merchantRef)
  let i = 0;
  while (i + 4 <= qrString.length) {
    const tag = qrString.slice(i, i + 2);
    const len = parseInt(qrString.slice(i + 2, i + 4), 10);
    if (isNaN(len) || i + 4 + len > qrString.length) break;
    const value = qrString.slice(i + 4, i + 4 + len);
    if (tag === '01') return value;
    i += 4 + len;
  }
  return undefined;
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
