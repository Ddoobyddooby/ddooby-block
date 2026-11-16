import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bundleAll, findStale, TARGETS } from '../../scripts/server-shared/bundle';
import * as generated from '../../supabase/functions/_shared/nicknameRules.js';
import * as source from '../../src/online/nicknameRules';
import { PASS_NAMES, REJECT_NAMES, TRIM_NAMES } from '../online/corpus';

// src/online/nicknameRules.ts가 유일한 원본이고 supabase/functions/_shared/nicknameRules.js는 `npm run server:shared`가 묶은 생성본이다.
// 생성본이 낡으면(원본·금칙어만 바뀌고 다시 묶지 않음) 클라이언트와 서버의 판정이 갈라진다.

const read = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

describe('server:shared (닉네임 규칙 번들)', () => {
  it('지금 원본을 다시 묶은 결과가 커밋된 생성본과 같다 (낡은 생성본 검출)', async () => {
    const files = await bundleAll();
    expect([...files.keys()].sort()).toEqual([
      'supabase/functions/_shared/nicknameRules.d.ts',
      'supabase/functions/_shared/nicknameRules.js',
    ]);
    expect(findStale(files, read)).toEqual([]);
  });

  it('생성본 머리: 직접 고치지 않는다는 표시, Deno용 @ts-self-types', async () => {
    const js = (await bundleAll()).get(TARGETS[0]?.out ?? '') ?? '';
    expect(js.startsWith('// 자동 생성: npm run server:shared (src/online/nicknameRules.ts)')).toBe(
      true,
    );
    expect(js).toContain('// @ts-self-types="./nicknameRules.d.ts"');
    // 화면·게임 설정을 끌어오지 않는다
    expect(js).not.toMatch(/phaser|config|window|document/i);
  });

  it('원본이 바뀌었는데 생성본이 그대로면 stale로 잡고, 파일이 없어도 잡는다', async () => {
    const files = await bundleAll();
    const [js, dts] = [...files.keys()] as [string, string];
    const stale = findStale(files, (path) =>
      path === js ? `${files.get(js)}\n// 옛 내용` : read(path),
    );
    expect(stale).toEqual([js]);
    expect(findStale(files, () => null).sort()).toEqual([dts, js].sort());
    expect(findStale(files, (path) => files.get(path) ?? null)).toEqual([]);
  });

  it('같은 코퍼스에 원본과 생성본이 같은 판정·같은 저장 이름을 낸다', () => {
    const names = [...PASS_NAMES, ...REJECT_NAMES.map(([n]) => n), ...TRIM_NAMES.map(([n]) => n)];
    for (const name of names) {
      expect(generated.checkNickname(name)).toEqual(source.checkNickname(name));
      expect(generated.normalizeNickname(name)).toBe(source.normalizeNickname(name));
      expect(generated.isBannedNickname(name)).toBe(source.isBannedNickname(name));
    }
  });

  it('무작위 문자열(한글·영문·숫자·공백·보이지 않는 글자·이모지·조합형)에서도 판정이 같다', () => {
    // 간단한 선형 합동 난수 (시험 재현용)
    let s = 12345;
    const next = (n: number): number => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s % n;
    };
    const alphabet = [...'가나다라마바사아자차뚜비시발새끼보지섹스ABCabcSussexadmin0123 \t'];
    alphabet.push('​', '‍', '😀', 'ㅋ', 'ＡＢ', '아', '﻿', ' ', '.', '!');
    for (let i = 0; i < 3000; i++) {
      const len = next(14);
      let text = '';
      for (let j = 0; j < len; j++) text += alphabet[next(alphabet.length)];
      expect(generated.checkNickname(text)).toEqual(source.checkNickname(text));
    }
  });

  it('상수·태그 검사·표시도 같다', () => {
    expect([generated.NICKNAME_MIN_LENGTH, generated.NICKNAME_MAX_LENGTH]).toEqual([2, 10]);
    expect([generated.TAG_MIN, generated.TAG_MAX, generated.TAG_MAX_ATTEMPTS]).toEqual([
      0, 9999, 20,
    ]);
    for (const tag of [0, 1, 427, 9999, -1, 10000, 1.5, NaN, '0', null]) {
      expect(generated.isValidTag(tag)).toBe(source.isValidTag(tag));
    }
    expect(generated.formatTag(427)).toBe(source.formatTag(427));
  });
});
