/**
 * Agentic PayWay CLI — safe artifact store.
 *
 * Provides a sandboxed, atomic artifact writer plus a path resolver that
 * refuses to let artifact names escape the agreed root directory unless an
 * explicit, confirmed override is supplied. This is the local half of the
 * `save_artifact` agent tool; the executor wires API success/failure onto it.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as QRCode from 'qrcode';
import type { ArtifactKind, ArtifactMetadataV1, Currency } from './contracts.js';
import { atomicWriteJson } from './storage.js';

/**
 * The default artifact root: `<cwd>/payway-output`. Resolved lazily so that
 * callers controlling `process.cwd()` (e.g. tests) get a stable, current root.
 */
export function defaultArtifactRoot(): string {
  return path.resolve(process.cwd(), 'payway-output');
}

export interface ArtifactBundle {
  metadata: ArtifactMetadataV1;
  imagePath?: string;
  dataUrl?: string;
}

export interface SaveQrArtifactInput {
  qrString?: string;
  content?: string;
  /** Caller-controlled root; a non-default root needs explicit human confirmation. */
  root?: string;
  overrideApproval?: boolean;
  name?: string;
  sessionId: string;
  route?: string;
  amount?: number;
  currency?: Currency;
  transactionId?: string;
  executionId?: string;
  correlationId?: string;
}

/**
 * Collapses an arbitrary requested name into a safe single-segment filename.
 *
 * Strips path separators and disallowed characters, lowercases, and clamps the
 * length so the result can never itself carry a traversal segment.
 */
function normalizeName(requested: string | undefined, fallback: string): string {
  const base = requested ? path.basename(requested) : fallback;
  const sanitized = base
    .split('')
    .map((ch) => (ch < ' ' || /[<>:"/\\|?*]/.test(ch) ? '_' : ch))
    .join('')
    .replace(/\.+/g, '.')
    .toLowerCase();
  const trimmed = sanitized.replace(/^\.+|\.+$/g, '').slice(0, 120);
  return trimmed.length > 0 ? trimmed : fallback.toLowerCase();
}

/**
 * Resolves a requested artifact name against `root`.
 *
 * Returns the absolute, normalized path. Rejects any name that would escape
 * `root` (path traversal or an absolute override that resolves elsewhere)
 * unless `overrideApproval` is explicitly `true` — that flag represents a
 * human-confirmed override and is the ONLY way to leave the sandbox.
 */
export function resolveArtifactPath(root: string, requestedName: string, overrideApproval: boolean): string {
  const normalizedRoot = path.resolve(root);
  const candidate = path.resolve(normalizedRoot, requestedName);
  const insideRoot = candidate === normalizedRoot || candidate.startsWith(normalizedRoot + path.sep);

  if (!insideRoot && !overrideApproval) {
    throw new Error(
      `artifact path "${requestedName}" escapes the artifact root "${normalizedRoot}"; ` +
        'refusing without an explicit confirmed override',
    );
  }
  return candidate;
}

function atomicWriteBuffer(targetPath: string, buffer: Buffer): void {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp`;
  writeFileSync(temporaryPath, buffer, { mode: 0o600 });
  renameSync(temporaryPath, targetPath);
}

/**
 * Saves a QR artifact (PNG image + JSON metadata) under `root`.
 *
 * - Renders a PNG from `qrString` via `qrcode` when provided.
 * - Writes the PNG and the metadata JSON atomically (temp file + rename).
 * - The metadata never carries credentials; only non-secret context is stored.
 * - Throws a clear error on any write/render failure. This is a local
 *   filesystem operation: it performs no network calls and must NOT retry a
 *   payment — the executor handles API success vs. artifact failure separately.
 */
export async function saveQrArtifact(input: SaveQrArtifactInput): Promise<ArtifactBundle> {
  const {
    qrString,
    content,
    root,
    overrideApproval = false,
    name,
    sessionId,
    route,
    amount,
    currency,
    transactionId,
    executionId,
    correlationId,
  } = input;

  if (!sessionId) {
    throw new Error('saveQrArtifact requires a sessionId');
  }
  if (!qrString && !content) {
    throw new Error('saveQrArtifact requires either qrString or content');
  }

  const normalizedName = normalizeName(name, `artifact-${randomUUID().slice(0, 8)}`);
  const defaultRoot = defaultArtifactRoot();
  const resolvedRoot = path.resolve(root ?? defaultRoot);
  if (resolvedRoot !== defaultRoot && !overrideApproval) {
    throw new Error('saveQrArtifact requires an explicit confirmed root override outside payway-output');
  }
  const imagePath = path.join(resolvedRoot, `${normalizedName}.png`);
  const metadataPath = path.join(resolvedRoot, `${normalizedName}.json`);

  const kind: ArtifactKind = qrString ? 'qr' : 'text';

  let imageBuffer: Buffer | undefined;
  let dataUrl: string | undefined;
  if (qrString) {
    try {
      imageBuffer = await QRCode.toBuffer(qrString, { width: 512, margin: 2 });
    } catch (error) {
      throw new Error(`failed to render QR image locally: ${error instanceof Error ? error.message : String(error)}`);
    }
    dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  }

  const metadata: ArtifactMetadataV1 = {
    version: 'agent-artifact/v1',
    artifactId: randomUUID(),
    sessionId,
    kind,
    path: imagePath,
    generatedAt: new Date().toISOString(),
    route,
    amount,
    currency,
    transactionId,
    executionId,
    correlationId,
  };

  // Atomic writes: a failure leaves the previous file (if any) untouched and
  // never produces a half-written target.
  try {
    if (imageBuffer) {
      atomicWriteBuffer(imagePath, imageBuffer);
    }
    atomicWriteJson(metadataPath, metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`artifact save failed (payment not affected): ${message}`);
  }

  const bundle: ArtifactBundle = { metadata, imagePath, dataUrl };
  // `content`-only artifacts have no image; keep imagePath undefined.
  if (!imageBuffer) {
    delete bundle.imagePath;
  }
  return bundle;
}
