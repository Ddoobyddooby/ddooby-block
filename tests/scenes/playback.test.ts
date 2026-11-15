import { describe, expect, it } from 'vitest';
import { playEvents, type PlaybackHost } from '../../src/scenes/playback';

/** 손으로 풀어 주는 await */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function fakeHost() {
  const waiters: (() => void)[] = [];
  const flush = () => waiters.splice(0).forEach((w) => w());
  const state = { current: true, paused: false };
  const host: PlaybackHost = {
    isCurrent: () => state.current,
    isPaused: () => state.paused,
    waitResume: () => new Promise<void>((r) => waiters.push(r)),
  };
  return {
    host,
    pause: () => (state.paused = true),
    resume: () => {
      state.paused = false;
      flush();
    },
    end: () => {
      state.current = false;
      flush();
    },
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('playEvents', () => {
  it('일시정지 없이: 모든 이벤트를 순서대로 재생하고 true', async () => {
    const f = fakeHost();
    const seen: string[] = [];
    const ok = await playEvents(['a', 'b', 'c'], (e) => void seen.push(e), f.host);
    expect(ok).toBe(true);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('재생 중 씬이 끝나면 남은 이벤트를 버리고 false', async () => {
    const f = fakeHost();
    const gate = deferred();
    const seen: string[] = [];
    const run = playEvents(
      ['a', 'b'],
      (e) => {
        seen.push(e);
        return gate.promise;
      },
      f.host,
    );
    f.end();
    gate.resolve();
    expect(await run).toBe(false);
    expect(seen).toEqual(['a']);
  });

  it('일시정지 중 await가 풀려도 다음 이벤트로 넘어가지 않고, [계속] 뒤에 이어서 재생한다', async () => {
    const f = fakeHost();
    const gate = deferred();
    const seen: string[] = [];
    let done: boolean | null = null;
    const run = playEvents(
      ['a', 'b', 'c'],
      (e) => {
        seen.push(e);
        return e === 'a' ? gate.promise : undefined;
      },
      f.host,
    ).then((v) => (done = v));
    f.pause();
    gate.resolve(); // 화면 크기 변경으로 트윈이 멈춘 것
    await tick();
    expect(seen).toEqual(['a']);
    expect(done).toBeNull();
    f.resume();
    await run;
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(done).toBe(true);
  });

  it('일시정지 중 씬이 끝나면(다시 하기·메뉴) 재생을 버리고 이어가지 않는다', async () => {
    const f = fakeHost();
    const gate = deferred();
    const seen: string[] = [];
    const run = playEvents(
      ['a', 'b'],
      (e) => {
        seen.push(e);
        return gate.promise;
      },
      f.host,
    );
    f.pause();
    gate.resolve();
    await tick();
    f.end();
    expect(await run).toBe(false);
    expect(seen).toEqual(['a']);
  });
});
