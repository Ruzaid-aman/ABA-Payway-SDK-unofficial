import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillsDirectory = path.join(testDirectory, '..', '..', 'skills');

describe('packaged AI skills', () => {
  it('provides 31 discoverable skill guides with quick-start content', async () => {
    const skillDirectories = (await readdir(skillsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'))
      .map((entry) => entry.name);

    expect(skillDirectories).toHaveLength(31);
    expect(skillDirectories).toContain('aba-payway-transaction-by-merchant-ref');
    expect(skillDirectories).toContain('aba-payway-agent');
    expect(skillDirectories).toContain('aba-payway-first-payment');
    expect(skillDirectories).toContain('aba-payway-customer-qr');
    // Audit S2 additions (sync-audit §6 S2.3): the four capability-gap skills.
    expect(skillDirectories).toContain('aba-payway-cof');
    expect(skillDirectories).toContain('aba-payway-token-lifecycle');
    expect(skillDirectories).toContain('aba-payway-beneficiary');
    expect(skillDirectories).toContain('aba-payway-subscription');
    // Transaction Journal (Phases 1-3 of the transaction-data roadmap).
    expect(skillDirectories).toContain('aba-payway-journal');

    for (const skillDirectory of skillDirectories) {
      const content = await readFile(path.join(skillsDirectory, skillDirectory, 'SKILL.md'), 'utf8');
      expect(content).toMatch(/^---\r?\nname: aba-payway-[\w-]+\r?\ndescription: .+\r?\nversion: \d+\.\d+\.\d+\r?\n---/);
      expect(content).toContain('## Quick Start');
      expect(content).toContain('```ts');
      expect(content).toContain('## Error Handling');
    }
  });
});
