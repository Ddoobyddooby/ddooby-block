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

  // 원격에서 상한을 넘은 본문의 cancel() Promise가 끝나지 않아 413이 오지 않았다 (W3-03 원격 확인).
  // cancel이 영원히 끝나지 않는 스트림에서도 413이 즉시 돌아와야 한다 (취소를 기다리지 않는다)
  const neverCancels = (chunks: Uint8Array[], contentLength?: number): Request => {
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[i++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel: () => new Promise<void>(() => undefined), // 영원히 끝나지 않는다
    });
    return new Request('https://x', {
      method: 'POST',
      headers: contentLength === undefined ? {} : { 'Content-Length': String(contentLength) },
      body: stream,
      duplex: 'half',
    } as RequestInit);
  };
  const within = async <T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> =>
    Promise.race([promise, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);

  it('Content-Length 선언이 상한을 넘으면 cancel이 끝나지 않아도 즉시 too-large', async () => {
    const req = neverCancels([new Uint8Array(5)], 2000);
    expect(await within(readBodyText(req, 10), 500)).toBe('too-large');
  });

  it('읽는 중 상한을 넘기면 cancel이 끝나지 않아도 즉시 too-large (선언이 없거나 작게 거짓이어도)', async () => {
    for (const declared of [undefined, 3]) {
      const req = neverCancels([new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)], declared);
      expect(await within(readBodyText(req, 10), 500), String(declared)).toBe('too-large');
    }
  });

  it('상한 이내 본문은 그대로 읽는다 (정상 경로 불변)', async () => {
    const bytes = new TextEncoder().encode('{"a":1}');
    expect(await within(readBodyText(neverCancels([bytes], bytes.length), 100), 500)).toBe(
      '{"a":1}',
    );
  });
});
