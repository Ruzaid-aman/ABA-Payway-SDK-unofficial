import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationFailures } from './public-navigation.mjs';

test('package navigation rejects missing files, dead anchors, and command destinations', () => {
  const files = new Set(['llms.txt', 'knowledge/reference.md']);
  const read = () => '# Reference\n\n## MCP server\n';
  assert.deepEqual(navigationFailures('llms.txt', '[MCP](knowledge/reference.md#mcp-server)', files, read), []);
  for (const destination of ['knowledge/missing.md', 'knowledge/reference.md#dead', 'payway-sdk docs reference --search x']) {
    assert.equal(navigationFailures('llms.txt', `[Bad](${destination})`, files, read).length, 1);
  }
});

test('local fragments and duplicate headings resolve; fenced headings do not', () => {
  const content = '# Guide\n## Repeat\n## Repeat\n```sh\n# Fake\n```\n';
  const files = new Set(['knowledge/guide.md']);
  const check = (fragment) => navigationFailures('knowledge/guide.md', `[jump](#${fragment})`, files, () => content);
  assert.deepEqual(check('repeat-1'), []);
  assert.equal(check('fake').length, 1);
});
