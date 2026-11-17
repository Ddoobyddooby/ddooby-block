import { describe, expect, it, vi } from 'vitest';
import { ALLOWED_ORIGINS as NICKNAME_ORIGINS } from '../../supabase/functions/set-nickname/handler';
import {
  ALLOWED_ORIGINS,
  bearerToken,
  corsHeaders,
  readBodyText,
  drainUnread,
  DRAIN_LIMIT_BYTES,
  DRAIN_TIMEOUT_MS,
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

  // 원격 실험: 큰 본문을 읽지 않은 채 응답하면 Edge가 응답을 내보내지 않는다 → 응답 전에 남은 본문을 상한까지 읽어 버린다
  const counting = (
    chunkBytes: number,
    chunks: number,
    declared?: number,
  ): { req: Request; read: () => number; cancelled: () => boolean } => {
    let sent = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= chunks) controller.close();
        else {
          sent += 1;
          controller.enqueue(new Uint8Array(chunkBytes));
        }
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const req = new Request('https://x', {
      method: 'POST',
      headers: declared === undefined ? {} : { 'Content-Length': String(declared) },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    return { req, read: () => sent * chunkBytes, cancelled: () => cancelled };
  };

  it('상한을 넘은 본문도 too-large를 돌려주기 전에 끝까지 읽어 버린다 (상한 이내인 양)', async () => {
    const c = counting(1000, 50); // 50,000바이트
    expect(await within(readBodyText(c.req, 10), 1000)).toBe('too-large');
    expect(c.read()).toBe(50_000);
    expect(c.cancelled()).toBe(false); // 끝까지 읽었으므로 취소할 것이 없다
  });

  it('선언이 상한을 넘어도 남은 본문을 읽어 버린 뒤 too-large', async () => {
    const c = counting(1000, 50, 50_000);
    expect(await within(readBodyText(c.req, 10), 1000)).toBe('too-large');
    expect(c.read()).toBe(50_000);
  });

  it('버리는 읽기에도 상한이 있다: DRAIN_LIMIT_BYTES를 넘으면 멈추고 취소를 기다리지 않는다', async () => {
    const chunk = 1024 * 1024;
    const c = counting(chunk, 1000); // 끝없이 큰 본문
    expect(await within(readBodyText(c.req, 10), 2000)).toBe('too-large');
    expect(c.read()).toBeLessThanOrEqual(DRAIN_LIMIT_BYTES + 2 * chunk);
    expect(c.read()).toBeGreaterThan(DRAIN_LIMIT_BYTES);
    expect(c.cancelled()).toBe(true);
  });

  it('drainUnread: 읽지 않은 본문을 읽어 버린다. 본문 없음·이미 읽음·잠김에서는 아무 일도 안 한다', async () => {
    const c = counting(100, 20);
    await drainUnread(c.req);
    expect(c.read()).toBe(2000);
    await drainUnread(new Request('https://x', { method: 'POST' }));
    const used = new Request('https://x', { method: 'POST', body: 'abc' });
    await used.text();
    await drainUnread(used);
    const locked = new Request('https://x', { method: 'POST', body: 'abc' });
    locked.body?.getReader();
    await drainUnread(locked);
  });

  it('drainUnread: 오래 걸리면 시간 제한 뒤 돌아온다 (조금씩 끝없이 보내는 본문)', async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({
        pull: () => new Promise<void>(() => undefined), // 다음 조각이 영원히 오지 않는다
      });
      const req = new Request('https://x', {
        method: 'POST',
        body: stream,
        duplex: 'half',
      } as RequestInit);
      let done = false;
      void drainUnread(req).then(() => (done = true));
      await vi.advanceTimersByTimeAsync(DRAIN_TIMEOUT_MS - 100);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
