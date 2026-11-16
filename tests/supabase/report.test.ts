import { describe, expect, it } from 'vitest';
import {
  type Row,
  denied,
  emptyRead,
  exitCodeOf,
  failed,
  formatTable,
  parseCheckEnv,
  readable,
  setupGuide,
} from '../../scripts/supabase-check/report';

const pass = (id = '①'): Row => ({
  id,
  label: '항목',
  expect: '실패',
  outcome: { pass: true, detail: 'ok' },
});
const fail = (id = '①'): Row => ({
  id,
  label: '항목',
  expect: '실패',
  outcome: { pass: false, detail: 'no' },
});

describe('권한 시험 판정', () => {
  it('denied: 오류가 나면 통과, 오류 없이 0행이어도 통과, 행이 반영되면 실패', () => {
    expect(denied({ data: null, error: { code: '42501', message: 'denied' } }).pass).toBe(true);
    expect(denied({ data: [], error: null }).pass).toBe(true);
    expect(denied({ data: null, error: null }).pass).toBe(true);
    const wrote = denied({ data: [{ id: 1 }], error: null });
    expect(wrote.pass).toBe(false);
    expect(wrote.detail).toBe('반영 1행');
  });

  it('readable: 오류가 없어야 통과 (0행도 통과)', () => {
    expect(readable({ data: [], error: null })).toEqual({ pass: true, detail: '0행' });
    expect(readable({ data: [1, 2], error: null }).detail).toBe('2행');
    expect(readable({ data: null, error: { code: '42501', message: 'x' } }).pass).toBe(false);
  });

  it('emptyRead: 오류 없이 0행이어야 통과 (남의 행이 보이면 실패)', () => {
    expect(emptyRead({ data: [], error: null }).pass).toBe(true);
    expect(emptyRead({ data: [{ a: 1 }], error: null }).pass).toBe(false);
    expect(emptyRead({ data: null, error: { message: 'x' } }).pass).toBe(false);
  });

  it('failed: 예외를 FAIL로 바꾼다', () => {
    expect(failed(new Error('boom'))).toEqual({ pass: false, detail: '예외: boom' });
    expect(failed('문자열').detail).toBe('예외: 문자열');
  });
});

describe('결과 표·종료 코드', () => {
  it('모두 PASS면 exit 0', () => {
    expect(exitCodeOf([pass(), pass()])).toBe(0);
  });

  it('FAIL이 하나라도 있으면 exit 1', () => {
    expect(exitCodeOf([pass(), fail()])).toBe(1);
  });

  it('항목이 없으면 확인한 것이 없으므로 exit 1', () => {
    expect(exitCodeOf([])).toBe(1);
  });

  it('표: 머리글 + 구분선 + 행 + 요약. PASS·FAIL 개수가 맞다', () => {
    const lines = formatTable([pass('①'), fail('②')]);
    expect(lines[0]).toBe('| # | 항목 | 기대 | 결과 | 상세 |');
    expect(lines[1]).toBe('|---|---|---|---|---|');
    expect(lines[2]).toBe('| ① | 항목 | 실패 | PASS | ok |');
    expect(lines[3]).toBe('| ② | 항목 | 실패 | FAIL | no |');
    expect(lines.at(-1)).toBe('2개 중 PASS 1, FAIL 1');
  });

  it('표: 상세의 `|`와 줄바꿈이 열을 깨지 않는다', () => {
    const row: Row = {
      id: 'x',
      label: 'a|b',
      expect: '실패',
      outcome: { pass: false, detail: '1\n2 | 3' },
    };
    expect(formatTable([row])[2]).toBe('| x | a\\|b | 실패 | FAIL | 1 2 \\| 3 |');
  });
});

describe('환경 설정', () => {
  it('두 변수가 있으면 값을 돌려준다 (앞뒤 공백 제거)', () => {
    expect(
      parseCheckEnv({
        VITE_SUPABASE_URL: ' https://x.example ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toEqual({
      ok: true,
      env: { url: 'https://x.example', key: 'k' },
    });
  });

  it('없거나 비어 있으면 빠진 이름을 알려 준다', () => {
    expect(parseCheckEnv({})).toEqual({
      ok: false,
      missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    });
    expect(parseCheckEnv({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_PUBLISHABLE_KEY: '  ' })).toEqual({
      ok: false,
      missing: ['VITE_SUPABASE_PUBLISHABLE_KEY'],
    });
  });

  it('안내 문구에 경로·다음 행동이 들어 있다', () => {
    const none = setupGuide('.env.local', 'no-file', []);
    expect(none).toContain('.env.local');
    expect(none).toContain('.env.example');
    expect(none).toContain('Anonymous Sign-ins');
    const some = setupGuide('x.env', 'missing', ['VITE_SUPABASE_URL']);
    expect(some).toContain('x.env에 VITE_SUPABASE_URL 값이 없다');
  });
});
