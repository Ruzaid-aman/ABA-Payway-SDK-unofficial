import path from 'node:path';

export function markdownAnchors(content) {
  const anchors = new Set();
  const counts = new Map();
  const prose = content.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '');
  for (const match of prose.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = match[1].trim().toLowerCase().replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    anchors.add(count ? `${slug}-${count}` : slug);
  }
  for (const match of content.matchAll(/(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1]);
  return anchors;
}

// Validates package-relative files AND fragments, including llms.txt. Shell
// commands are never Markdown destinations; display them as inline code.
export function navigationFailures(entry, content, fileSet, readFile) {
  const failures = [];
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const destination = match[1].trim().replace(/^<|>$/g, '');
    if (!destination || /^[a-z]+:/i.test(destination)) continue;
    if (destination.startsWith('payway-sdk ')) {
      failures.push(`${entry} -> command used as link: ${destination}`);
      continue;
    }
    const [local, fragment] = destination.split('#');
    const resolved = local
      ? path.posix.normalize(path.posix.join(path.posix.dirname(entry), decodeURIComponent(local.split('?')[0])))
      : entry;
    if (!fileSet.has(resolved)) failures.push(`${entry} -> missing file: ${destination}`);
    else if (fragment && resolved.endsWith('.md') && !markdownAnchors(readFile(resolved)).has(decodeURIComponent(fragment))) {
      failures.push(`${entry} -> missing anchor: ${destination}`);
    }
  }
  return failures;
}
