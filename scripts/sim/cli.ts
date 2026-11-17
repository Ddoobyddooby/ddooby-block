// `npm run sim` 진입점 (W4-02). Node가 직접 읽을 수 있게 확장자를 쓴 이 파일만 core를 모른다:
// main.ts를 rolldown으로 묶어(server:shared와 같은 도구) node_modules/.cache/에 쓰고 불러 쓴다.
//
//   npm run sim -- [--seeds 1-1000] [--bot greedy|random|smart|all|a,b] [--json 경로] [--logs 경로] [--max-placements N]
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const root = resolve(import.meta.dirname, '../..');
const cache = resolve(root, 'node_modules/.cache/ddooby-sim');
mkdirSync(cache, { recursive: true });
// 실행마다 따로 둔다: 여러 번 동시에 돌려도 서로의 번들을 덮지 않는다
const out = mkdtempSync(resolve(cache, 'run-'));

await build({
  input: resolve(root, 'scripts/sim/main.ts'),
  platform: 'node',
  output: { format: 'esm', dir: out, entryFileNames: 'main.mjs' },
  logLevel: 'warn',
});

const mod = (await import(pathToFileURL(resolve(out, 'main.mjs')).href)) as {
  main: (argv: readonly string[]) => void;
};
try {
  mod.main(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
