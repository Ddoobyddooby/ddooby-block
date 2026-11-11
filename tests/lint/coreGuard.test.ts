import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// 저장소의 eslint.config.js를 그대로 써서 core 차단 규칙이 유지되는지 본다 (PLAN 1절).
// 파일을 만들지 않고 코드 문자열에 경로만 붙여 검사한다
const eslint = new ESLint();

async function errorsOf(code: string, filePath: string): Promise<string[]> {
  const results = await eslint.lintText(`${code}\n`, { filePath });
  return results.flatMap((r) =>
    r.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}: ${m.message}`),
  );
}

describe('core 린트 차단', () => {
  it.each([
    ['Math.random()을 부른다', 'export const a = Math.random();'],
    ['globalThis를 거쳐 Math.random()을 부른다', 'export const a = globalThis.Math.random();'],
    ['phaser를 import한다', "import Phaser from 'phaser';\nexport const a = Phaser;"],
    ['phaser를 동적 import한다', "export const a = import('phaser');"],
    ['view를 import한다', "import '../view/x';"],
    ['scenes를 import한다', "import '../scenes/x';"],
    ['storage를 import한다', "import '../storage/x';"],
    ['online을 import한다', "import '../online/x';"],
    ['Capacitor를 import한다', "import '@capacitor/core';"],
    ['document를 쓴다', 'export const a = document;'],
    ['window를 쓴다', 'export const a = window;'],
    ['navigator.userAgent를 읽는다', 'export const a = navigator.userAgent;'],
    ['location.href를 읽는다', 'export const a = location.href;'],
    ['DOMParser를 만든다', 'export const a = new DOMParser();'],
    ['localStorage를 쓴다', 'export const a = localStorage;'],
    ['fetch를 쓴다', 'export const a = fetch;'],
    ['setTimeout을 쓴다', 'export const a = setTimeout;'],
    ['performance.now()를 부른다', 'export const a = performance.now();'],
    ['Date.now()를 부른다', 'export const a = Date.now();'],
    ['process.env를 읽는다', 'export const a = process.env;'],
  ])('core에서 %s → lint 에러가 난다', async (_name, code) => {
    expect((await errorsOf(code, 'src/core/probe.ts')).length).toBeGreaterThan(0);
  });

  it.each([
    ['config를 import한다', "import { BOARD } from '../config';\nexport const n = BOARD.size;"],
    [
      'ES 내장(Math.floor, Math.imul, Array, Map, Object, Number, JSON)을 쓴다',
      [
        'export const a = Math.floor(1.5) + Math.imul(2, 3);',
        'export const b = Array.from({ length: 3 }, (_, i) => i);',
        'export const c = new Map<string, number>([["x", 1]]);',
        'export const d = Object.keys({ x: 1 });',
        'export const e = Number.isInteger(1);',
        'export const f = JSON.stringify(b);',
      ].join('\n'),
    ],
    [
      '타입에 Record와 ReadonlyArray를 쓴다',
      [
        'export const weights: Record<string, number> = { a: 1 };',
        'export function sum(xs: ReadonlyArray<number>, ys: readonly number[]): number {',
        '  return xs.length + ys.length;',
        '}',
      ].join('\n'),
    ],
  ])('core에서 %s → lint 에러가 없다', async (_name, code) => {
    expect(await errorsOf(code, 'src/core/probe.ts')).toEqual([]);
  });

  it('실제 파일 src/core/rng.ts → lint 에러가 없다', async () => {
    const results = await eslint.lintFiles(['src/core/rng.ts']);
    expect(results).toHaveLength(1);
    expect(results.flatMap((r) => r.messages)).toEqual([]);
  });

  it('core 밖(scenes)에서는 phaser와 window를 써도 lint 에러가 없다', async () => {
    const code =
      "import Phaser from 'phaser';\nexport const p = Phaser;\nexport const w = window.innerWidth;";
    expect(await errorsOf(code, 'src/scenes/probe.ts')).toEqual([]);
  });
});
