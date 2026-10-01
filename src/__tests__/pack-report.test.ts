/**
 * npm pack --json output-shape contract (audit R02): npm ≤11 emits an array
 * of pack reports, npm 12 emits an object keyed by package name. The packed
 * smoke and package-boundary gates must accept both — these tests pin the
 * shared normalizer so a future npm shape change fails here first, with a
 * readable message, instead of as `undefined .filename` inside a gate.
 */
import { describe, expect, it } from 'vitest';
import { normalizePackReport } from '../../scripts/lib/pack-report.mjs';

const aReport = (filename = 'aba-payway-ts-1.0.0.tgz') => ({
  id: 'aba-payway-ts',
  name: 'aba-payway-ts',
  version: '1.0.0',
  filename,
  size: 944942,
  unpackedSize: 4000000,
  files: [{ path: 'package.json', size: 1000, mode: 644 }],
});

describe('normalizePackReport (npm pack --json shapes)', () => {
  it('accepts the npm ≤11 array shape', () => {
    const report = normalizePackReport([aReport(), aReport('other.tgz')]);
    expect(report.filename).toBe('aba-payway-ts-1.0.0.tgz');
  });

  it('accepts the npm 12 object-keyed-by-package-name shape', () => {
    const report = normalizePackReport({ 'aba-payway-ts': aReport() });
    expect(report.filename).toBe('aba-payway-ts-1.0.0.tgz');
  });

  it('accepts a bare single-report object shape', () => {
    const report = normalizePackReport(aReport());
    expect(report.filename).toBe('aba-payway-ts-1.0.0.tgz');
  });

  it('rejects an empty array', () => {
    expect(() => normalizePackReport([])).toThrow(/unrecognized shape/);
  });

  it('rejects an empty object', () => {
    expect(() => normalizePackReport({})).toThrow(/unrecognized shape/);
  });

  it('rejects non-object garbage with a readable message', () => {
    expect(() => normalizePackReport('boom')).toThrow(/unrecognized shape/);
    expect(() => normalizePackReport(null)).toThrow(/unrecognized shape/);
    expect(() => normalizePackReport(undefined)).toThrow(/unrecognized shape/);
  });

  it('rejects a report without a filename', () => {
    const broken = aReport() as { filename?: string };
    delete broken.filename;
    expect(() => normalizePackReport([broken])).toThrow(/unrecognized shape/);
    expect(() => normalizePackReport({ 'aba-payway-ts': broken })).toThrow(/unrecognized shape/);
  });
});
