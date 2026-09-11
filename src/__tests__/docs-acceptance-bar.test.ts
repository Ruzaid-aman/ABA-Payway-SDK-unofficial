/**
 * Docs acceptance bar (competitive portal-parity wave, 2026-09-12).
 *
 * Every public payment-FLOW chapter carries an inline Mermaid sequence diagram
 * at the point of use, every numbered guide chapter keeps at least one runnable
 * example code block, and the diagram-library pages in docs/diagrams/ are
 * linked from their canonical chapters (they used to be orphans). The bar is
 * extensible: grow FLOW_CHAPTERS when a new flow chapter lands.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(repoRoot, 'docs', p), 'utf8');
const mermaidBlocks = (md: string) => [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);

/** Chapters documenting a payment flow end-to-end — each must diagram it. */
const FLOW_CHAPTERS = [
  '03-web-implementation.md',
  '04-native-app-implementation.md',
  '05-webview-implementation.md',
  '06-telegram-mini-app.md',
  '07-qr-code-handling.md',
  '08-deep-linking.md',
  '11-callbacks-and-webhooks.md',
  '17-payment-link.md',
];

describe('docs acceptance bar', () => {
  it.each(FLOW_CHAPTERS)('%s carries an inline payment-flow sequence diagram', (chapter) => {
    const blocks = mermaidBlocks(read(chapter));
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks.join('\n')).toContain('sequenceDiagram');
  });

  it('every numbered guide chapter carries at least one example code block', () => {
    const chapters = readdirSync(join(repoRoot, 'docs'))
      .filter((f) => /^\d{2}-.*\.md$/.test(f))
      .sort();
    expect(chapters.length).toBeGreaterThanOrEqual(18);
    const withoutCode = chapters.filter((f) => !/```/.test(read(f)));
    expect(withoutCode).toEqual([]);
  });

  it('diagram-library files are linked from their canonical chapters and docs/README.md', () => {
    expect(read('03-web-implementation.md')).toContain('diagrams/payment-lifecycle.md');
    expect(read('11-callbacks-and-webhooks.md')).toContain('diagrams/callback-flow.md');
    expect(read('01-overview-and-concepts.md')).toContain('diagrams/platform-decision-tree.md');
    expect(read('09-link-unlink-renew-lifecycle.md')).toContain('diagrams/link-unlink-state-machine.md');
    expect(read('README.md')).toContain('Diagram Library');
  });

  it('every diagram-library file referenced by the docs exists', () => {
    const referenced = [...read('README.md').matchAll(/\((\.\/diagrams\/[^)]+)\)/g)].map((m) => m[1]);
    for (const ref of referenced) {
      expect(existsSync(join(repoRoot, 'docs', ref))).toBe(true);
    }
    expect(referenced.length).toBeGreaterThanOrEqual(4);
  });

  it('QR template gallery documents all sandbox-verified templates with images', () => {
    const md = read('07-qr-code-handling.md');
    for (const template of [
      'template1',
      'template1_color',
      'template2',
      'template2_color',
      'template3_color',
      'template4',
      'template4_color',
    ]) {
      expect(md).toContain(template);
    }
    expect(md).toContain('## QR Image Template Gallery');
    expect(md).toContain('images/qr-templates/template2.png');
    const pngs = readdirSync(join(repoRoot, 'docs', 'images', 'qr-templates'))
      .filter((f) => f.endsWith('.png'))
      .sort();
    expect(pngs).toEqual([
      'template1.png',
      'template1_color.png',
      'template2.png',
      'template2_color.png',
      'template3_color.png',
      'template4.png',
      'template4_color.png',
    ]);
    // docs/10 routes template pickers to the gallery
    expect(read('10-ui-customization.md')).toContain('07-qr-code-handling.md#qr-image-template-gallery');
  });
});
