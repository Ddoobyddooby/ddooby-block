import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { callFunction } from '../../scripts/supabase-check/callFunction';

// 원격 시험 도구의 요청 전체 deadline: 응답이 없거나, 조금씩 끝없이 오거나, 헤더만 오거나, 연결이 늦어도 status 0으로 돌아온다
let server: Server | undefined;
const sockets = new Set<{ destroy(): void }>();

async function serve(handler: (req: unknown, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

afterEach(async () => {
  for (const s of sockets) s.destroy();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

const init = { method: 'POST', origin: null, token: null, body: {} };
const timed = async <T>(p: Promise<T>): Promise<[T, number]> => {
  const t0 = Date.now();
  const v = await p;
  return [v, Date.now() - t0];
};

describe('callFunction (원격 시험 호출)', () => {
  it('정상 응답: status·JSON 본문·헤더', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(413, { 'Content-Type': 'application/json', 'X-A': 'b' });
      res.end('{"code":"too-large"}');
    });
    const r = await callFunction({ url, key: 'k' }, init, 'start-run');
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ code: 'too-large' });
    expect(r.header('x-a')).toBe('b');
  });

  it('조금씩 끝없이 보내는 응답은 소켓이 유휴가 아니어도 deadline에 끊긴다', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200);
      const t = setInterval(() => res.write('x'), 20); // 유휴 제한(1초)에는 안 걸린다
      res.on('close', () => clearInterval(t));
    });
    const [r, ms] = await timed(
      callFunction({ url, key: 'k' }, init, 'start-run', { deadlineMs: 300, idleMs: 1000 }),
    );
    expect(r.status).toBe(0);
    expect(ms).toBeGreaterThanOrEqual(250);
    expect(ms).toBeLessThan(900);
  });

  it('헤더만 오고 본문이 끝나지 않는 응답은 deadline에 끊긴다', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Length': '100' });
      res.flushHeaders();
    });
    const [r, ms] = await timed(
      callFunction({ url, key: 'k' }, init, 'start-run', { deadlineMs: 300, idleMs: 1000 }),
    );
    expect(r.status).toBe(0);
    expect(ms).toBeLessThan(900);
  });

  it('응답이 전혀 없으면 deadline(또는 유휴 제한)에 status 0', async () => {
    const url = await serve(() => undefined);
    const [r, ms] = await timed(
      callFunction({ url, key: 'k' }, init, 'start-run', { deadlineMs: 300, idleMs: 1000 }),
    );
    expect(r.status).toBe(0);
    expect(ms).toBeLessThan(900);
  });

  it('연결이 늦어도(연결을 받지 않는 서버) deadline에 status 0', async () => {
    // listen 큐를 채워 새 연결이 대기하게 하는 대신, 주소가 닿지 않는 곳(TEST-NET-1)을 쓴다. 닿지 못해도 오류든 시간 초과든 status 0이다
    const [r, ms] = await timed(
      callFunction({ url: 'http://192.0.2.1:81', key: 'k' }, init, 'start-run', {
        deadlineMs: 300,
        idleMs: 1000,
      }),
    );
    expect(r.status).toBe(0);
    expect(ms).toBeLessThan(1500);
  });

  it('연결이 거부되면 status 0', async () => {
    const r = await callFunction({ url: 'http://127.0.0.1:1', key: 'k' }, init, 'start-run', {
      deadlineMs: 500,
    });
    expect(r.status).toBe(0);
  });
});
