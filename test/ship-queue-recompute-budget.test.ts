/**
 * The ship queue's depth recompute stays inside a fixed time budget across a
 * five-PR train (TODOS.md P1, review-depth follow-ups). READY and train build
 * call bindShippedReceipt once per PR, and each call rereads the diff and its
 * scope from git, so a recompute that grows with the diff stalls every train.
 * The train spans the observed PR sizes of the last 300 upstream merges
 * (median 14 files / 444 lines, p90 52 / 3,002, max 490 / 33,352) and puts its
 * last PR above the observed maximum.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXIT } from '../lib/headless-artifacts';
import { bindShippedReceipt } from '../lib/ship-receipt-depth';
import { cleanup, commit, makeFixtureRepo, runBin, type FixtureRepo } from './helpers/pregate-fixture';

const repos: FixtureRepo[] = [];
afterEach(() => { while (repos.length) cleanup(repos.pop()!); });

const TRAIN = [
  { pr: '101', dir: 'lib/small', files: 3, lines: 10, ext: '.js', depth: 'light' },
  { pr: '102', dir: 'docs/guide', files: 5, lines: 40, ext: '.md', depth: 'light' },
  { pr: '103', dir: 'lib/median', files: 14, lines: 32, ext: '.js', depth: 'standard' },
  { pr: '104', dir: 'lib/p90', files: 52, lines: 58, ext: '.js', depth: 'standard' },
  { pr: '105', dir: 'lib/large', files: 500, lines: 80, ext: '.js', depth: 'standard' },
];
const RECOMPUTE_BUDGET_MS = 5_000;

const fileText = (ext: string, tag: string, n: number) => Array.from({ length: n }, (_, i) =>
  ext === '.md' ? `line ${i}` : `exports.${tag}_${i} = () => ${i};`).join('\n') + '\n';

describe('the queue recomputes a five-PR train within a fixed budget', () => {
  // Value: protects=READY and train build recompute every receipt's needed depth without stalling the train on a large diff;
  //   fails_when=the recompute adds per-file or per-line subprocesses, a quadratic pass or a scan that runs to its 60 s timeout;
  //   why_new=ship-receipt-depth.test.ts checks the verdicts, never their cost; seam=bindShippedReceipt
  test('one pass over PRs of 3 to 500 files binds every receipt at its required depth inside the budget', () => {
    const repo = makeFixtureRepo({ prefix: 'gstack-recompute-budget-' }); repos.push(repo);
    const train = TRAIN.map(p => {
      repo.git('checkout', '-q', '-B', `pr-${p.pr}`, 'origin/main');
      const files: Record<string, string> = {};
      for (let f = 0; f < p.files; f++) files[`${p.dir}/m${f}${p.ext}`] = fileText(p.ext, `m${f}`, p.lines);
      const head = commit(repo, files, `pr ${p.pr}`);
      const body = path.join(repo.root, `body-${p.pr}.md`);
      const w = runBin(repo, 'gstack-ship-receipt', ['write', '--pr', p.pr, '--base', 'main', '--version', '1.0.0', '--session-kind', 'unattended', '--body', body]);
      expect(w.status).toBe(EXIT.ok);
      return { ...p, head, text: fs.readFileSync(body, 'utf8') };
    });

    const perPr: Record<string, number> = {};
    const start = performance.now();
    const bound = train.map(p => {
      const t = performance.now();
      const b = bindShippedReceipt(repo.work, 'origin/main', p.text, p.pr, [p.head]);
      perPr[p.pr] = Math.round(performance.now() - t);
      return { p, b };
    });
    const totalMs = Math.round(performance.now() - start);
    console.error(`recompute: ${totalMs} ms for ${train.length} PRs, per PR ${JSON.stringify(perPr)}, budget ${RECOMPUTE_BUDGET_MS} ms`);

    for (const { p, b } of bound) {
      expect(b.ok).toBe(true);
      expect(b.depthLine).toContain(`receipt=${p.depth} required=${p.depth}`);
    }
    expect(bound[4]!.b.depthLine).toContain('runtime_lines=40000');
    // gstack-timing-ok: measured 194-198 ms idle (10 cold runs), 615-773 ms with 32 busy loops on 16 cores; 5,000 ms is 6.5x the stressed max
    expect(totalMs).toBeLessThan(RECOMPUTE_BUDGET_MS);
  }, 120_000);
});
