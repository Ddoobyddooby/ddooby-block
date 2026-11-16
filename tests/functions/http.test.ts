import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGINS as NICKNAME_ORIGINS } from '../../supabase/functions/set-nickname/handler';
import {
  ALLOWED_ORIGINS,
  bearerToken,
  corsHeaders,
  readBodyText,
} from '../../supabase/functions/_lib/http';

describe('_lib/http', () => {
  it('허용 출처가 set-nickname과 같다 (한쪽만 바뀌면 실패)', () => {
    expect([...ALLOWED_ORIGINS]).toEqual([...NICKNAME_ORIGINS]);
  });

  it('CORS는 정확히 같은 출처만: 접두·부분 일치·포트 다름은 허용하지 않는다', () => {
    for (const origin of ALLOWED_ORIGINS) {
      expect(corsHeaders('h', origin)['Access-Control-Allow-Origin']).toBe(origin);
    }
    for (const origin of [
      'https://ddoobyddooby.github.io.evil.example',
      'https://ddoobyddooby.github.io/',
      'http://localhost:5173',
      'http://localhost:51800',
      'null',
      '',
      null,
    ]) {
      expect(corsHeaders('h', origin)).toEqual({ Vary: 'Origin' });
    }
  });

  it('Bearer 토큰 추출', () => {
    const req = (h?: string) =>
      new Request('https://x', { headers: h ? { Authorization: h } : {} });
    expect(bearerToken(req('Bearer abc'))).toBe('abc');
    expect(bearerToken(req('bearer abc'))).toBe('abc');
    for (const h of [undefined, 'abc', 'Bearer', 'Bearer a b', 'Basic abc']) {
      expect(bearerToken(req(h)), String(h)).toBeNull();
    }
  });

  it('readBodyText: 바이트 상한까지 읽고 넘으면 too-large', async () => {
    const r = (body: string) => new Request('https://x', { method: 'POST', body });
    expect(await readBodyText(r('abc'), 3)).toBe('abc');
    expect(await readBodyText(r('abcd'), 3)).toBe('too-large');
    expect(await readBodyText(r('가'), 3)).toBe('가'); // 3바이트
    expect(await readBodyText(r('가나'), 3)).toBe('too-large');
    expect(await readBodyText(new Request('https://x', { method: 'POST' }), 3)).toBe('');
  });
});
