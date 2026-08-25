import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillsDirectory = path.join(testDirectory, '..', '..', 'skills');

describe('packaged AI skills', () => {
  it('provides 24 discoverable skill guides with quick-start content', async () => {
    const skillDirectories = (await readdir(skillsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
      .map((entry) => entry.name);

    expect(skillDirectories).toHaveLength(24);
    expect(skillDirectories).toContain('aba-payway-transaction-by-merchant-ref');
    expect(skillDirectories).toContain('aba-payway-agent');
    expect(skillDirectories).toContain('aba-payway-first-payment');
    expect(skillDirectories).toContain('aba-payway-customer-qr');

    for (const skillDirectory of skillDirectories) {
      const content = await readFile(path.join(skillsDirectory, skillDirectory, 'SKILL.md'), 'utf8');
      expect(content).toMatch(/^---\r?\nname: aba-payway-[\w-]+\r?\ndescription: .+\r?\nversion: 1\.1\.0\r?\n---/);
      expect(content).toContain('## Quick Start');
      expect(content).toContain('```ts');
      expect(content).toContain('## Error Handling');
    }
  });
});
