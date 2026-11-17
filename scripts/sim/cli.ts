// `npm run sim` 진입점 (W4-02). Node가 직접 읽을 수 있게 확장자를 쓴 이 파일만 core를 모른다:
// main.ts를 rolldown으로 묶어(server:shared와 같은 도구) node_modules/.cache/에 쓰고 불러 쓴다.
// 실행 순서와 정리는 runCli.ts (시험 가능하게 나눴다).
//
//   npm run sim -- [--seeds 1-1000] [--bot greedy|random|smart|survivor|all|a,b] [--json 경로] [--logs 경로] [--max-placements N]
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { runCli } from './runCli.ts';

const root = resolve(import.meta.dirname, '../..');
const cache = resolve(root, 'node_modules/.cache/ddooby-sim');

process.exitCode = await runCli(process.argv.slice(2), {
  // 실행마다 따로 둔다: 여러 번 동시에 돌려도 서로의 번들을 덮지 않는다
  makeOutDir() {
    mkdirSync(cache, { recursive: true });
    return mkdtempSync(resolve(cache, 'run-'));
  },
  removeOutDir: (dir) => rmSync(dir, { recursive: true, force: true }),
  async bundle(out) {
    await build({
      input: resolve(root, 'scripts/sim/main.ts'),
      platform: 'node',
      output: { format: 'esm', dir: out, entryFileNames: 'main.mjs' },
      logLevel: 'warn',
    });
  },
  async load(out) {
    const mod = (await import(pathToFileURL(resolve(out, 'main.mjs')).href)) as {
      main: (argv: readonly string[]) => void;
    };
    return mod.main;
  },
  error: (message) => console.error(message),
});
