import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSubmit } from '../../src/scenes/nicknameDev';

describe('DEV 가짜 제출 (?ranking=fake)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('규칙은 실제 checkNickname을 쓰고 즉시 거부한다', async () => {
    expect(await fakeSubmit('뚜')).toEqual({ ok: false, code: 'too-short' });
    expect(await fakeSubmit('시발')).toEqual({ ok: false, code: 'banned' });
  });

  it('정해 둔 이름은 해당 오류, 그 밖은 0.4초 뒤 #0427로 성공', async () => {
    const run = async (name: string) => {
      const p = fakeSubmit(name);
      await vi.advanceTimersByTimeAsync(400);
      return p;
    };
    expect(await run('서버오류')).toEqual({ ok: false, code: 'server' });
    expect(await run('연결끊김')).toEqual({ ok: false, code: 'network' });
    expect(await run('권한없음')).toEqual({ ok: false, code: 'unauthorized' });
    expect(await run('이미있음')).toEqual({ ok: false, code: 'already-set' });
    expect(await run('뚜비')).toEqual({ ok: true, nickname: '뚜비', tag: '#0427' });
  });

  it('무응답은 끝나지 않는다 (창의 10초 제한을 보기 위해)', async () => {
    let settled = false;
    void fakeSubmit('무응답').then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
  });
});
