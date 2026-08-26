/**
 * Pillar D evidence probe — CLI startup latency (D.1.1).
 *
 * Spawns `npx tsx src/cli.ts --help` N times via child_process (no shell
 * quoting games), records wall-clock duration per run, prints P50/P95/max.
 *
 * Run: npx tsx audit-results/four-pillars/evidence/startup-probe.ts
 */
import { spawnSync } from 'node:child_process';

const RUNS = 5;
const argv = ['npx', 'tsx', 'src/cli.ts', '--help'];

function timeOnce(): number {
  const startedAt = Date.now();
  const result = spawnSync(argv[0], argv.slice(1), {
    shell: true,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  });
  if (result.status !== 0 && !String(result.stdout).includes('Usage')) {
    throw new Error(`cli --help exited ${result.status}: ${String(result.stderr).slice(0, 300)}`);
  }
  return Date.now() - startedAt;
}

const durationsMs: number[] = [];
for (let i = 0; i < RUNS; i++) {
  durationsMs.push(timeOnce());
}
durationsMs.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      runs: RUNS,
      command: argv.join(' '),
      p50ms: durationsMs[Math.floor(RUNS / 2)],
      p95ms: durationsMs[RUNS - 1],
      minMs: durationsMs[0],
      maxMs: durationsMs[RUNS - 1],
      thresholdMs: 500,
    },
    null,
    2,
  ),
);
