import type { DetectedFramework } from '../frameworkDetector.js';

export interface TemplateFile {
  readonly path: string;
  readonly content: string;
}

export interface TemplateBundle {
  readonly framework: DetectedFramework;
  readonly files: ReadonlyArray<TemplateFile>;
}

export type TemplateModule = 'checkout' | 'callback';
