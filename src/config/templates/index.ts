import type { DetectedFramework } from '../frameworkDetector.js';
import { EXPRESS_TEMPLATE } from './express.js';
import { NEXT_APP_TEMPLATE } from './nextApp.js';
import type { TemplateBundle, TemplateFile, TemplateModule } from './types.js';

const REGISTRY: Partial<Record<Exclude<DetectedFramework, 'unknown'>, TemplateBundle>> = {
  'next-app': NEXT_APP_TEMPLATE,
  express: EXPRESS_TEMPLATE,
};

export function getTemplate(framework: DetectedFramework): TemplateBundle | undefined {
  if (framework === 'unknown') return undefined;
  return REGISTRY[framework];
}

export function selectTemplateFiles(
  framework: DetectedFramework,
  modules: ReadonlyArray<TemplateModule>,
): ReadonlyArray<TemplateFile> {
  const bundle = getTemplate(framework);
  if (!bundle) return [];
  return bundle.files.filter((file) => {
    if (modules.includes('checkout') && /checkout/i.test(file.path)) return true;
    if (modules.includes('callback') && /callback/i.test(file.path)) return true;
    return false;
  });
}

export type { TemplateBundle, TemplateFile, TemplateModule };
export { EXPRESS_TEMPLATE, NEXT_APP_TEMPLATE };
