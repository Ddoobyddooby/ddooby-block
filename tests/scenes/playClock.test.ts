import { describe, expect, it } from 'vitest';
import { PlayClock } from '../../src/scenes/playClock';

/** 가짜 시간 원천 (벽시계가 아니다) */
function fakeTime(start = 5000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    set: (value: number) => {
      now = value;
    },
  };
}

describe('PlayClock', () => {
  it('시작은 0이고 흐르는 동안 시간이 쌓인다 (시간 원천의 절대값은 상관없다)', () => {
    const time = fakeTime(123456);
    const clock = new PlayClock(time.now);
    expect(clock.elapsed()).toBe(0);
    time.advance(1000);
    expect(clock.elapsed()).toBe(1000);
  });

  it('이어한 판은 저장된 elapsedMs에서 시작한다', () => {
    const time = fakeTime();
    const clock = new PlayClock(time.now, 3300);
    expect(clock.elapsed()).toBe(3300);
    time.advance(50);
    expect(clock.elapsed()).toBe(3350);
  });

  it('일시정지 동안은 흐르지 않는다: 1000ms → 정지 5000ms → 재개 250ms = 1250', () => {
    const time = fakeTime();
    const clock = new PlayClock(time.now);
    time.advance(1000);
    clock.block('paused');
    time.advance(5000);
    expect(clock.elapsed()).toBe(1000);
    clock.unblock('paused');
    time.advance(250);
    expect(clock.elapsed()).toBe(1250);
  });

  it('숨김 동안도 흐르지 않는다', () => {
    const time = fakeTime();
    const clock = new PlayClock(time.now);
    time.advance(400);
    clock.block('hidden');
    time.advance(60000);
    clock.unblock('hidden');
    time.advance(100);
    expect(clock.elapsed()).toBe(500);
  });

  it('숨김과 일시정지가 겹치면 둘 다 풀려야 다시 흐른다 (두 순서 모두)', () => {
    for (const order of [
      ['hidden', 'paused'],
      ['paused', 'hidden'],
    ] as const) {
      const time = fakeTime();
      const clock = new PlayClock(time.now);
      time.advance(100);
      clock.block(order[0]);
      time.advance(1000);
      clock.block(order[1]);
      time.advance(1000);
      clock.unblock(order[0]);
      time.advance(1000);
      expect(clock.elapsed()).toBe(100); // 아직 하나가 막고 있다
      expect(clock.running).toBe(false);
      clock.unblock(order[1]);
      time.advance(50);
      expect(clock.elapsed()).toBe(150);
      expect(clock.running).toBe(true);
    }
  });

  it('같은 이유로 여러 번 막아도 한 번 풀면 풀린다 (중복 이벤트가 이중으로 빼거나 더하지 않는다)', () => {
    const time = fakeTime();
    const clock = new PlayClock(time.now);
    time.advance(100);
    clock.block('hidden');
    clock.block('hidden');
    time.advance(1000);
    clock.unblock('hidden');
    clock.unblock('hidden'); // 이미 풀린 것을 또 풀어도 아무 일 없다
    time.advance(100);
    expect(clock.elapsed()).toBe(200);
  });

  it('게임 오버로 막으면 멈춘다. 연출 중에는 막지 않으므로 흐른다', () => {
    const time = fakeTime();
    const clock = new PlayClock(time.now);
    time.advance(90); // 연출 중이라고 생각해도 막는 이유가 없으면 흐른다
    expect(clock.elapsed()).toBe(90);
    clock.block('over');
    time.advance(1000);
    expect(clock.elapsed()).toBe(90);
    expect(clock.isBlocked('over')).toBe(true);
  });

  it('elapsed는 정수로 내리고 줄어들지 않는다', () => {
    const time = fakeTime();
    const clock = new PlayClock(time.now);
    let last = 0;
    for (let i = 0; i < 50; i++) {
      time.advance(16.5);
      const value = clock.elapsed();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
    expect(last).toBe(825); // 16.5 × 50
  });

  it('시간 원천이 거꾸로 가면 그 구간은 세지 않는다 (시계가 역행하지 않는다)', () => {
    const time = fakeTime(10000);
    const clock = new PlayClock(time.now);
    time.advance(100);
    expect(clock.elapsed()).toBe(100);
    time.set(2000); // 거꾸로
    expect(clock.elapsed()).toBe(100);
    time.advance(50);
    expect(clock.elapsed()).toBe(150);
  });

  it('여러 번 읽어도 시간이 더해지지 않는다 (읽기는 부작용이 없다)', () => {
    const time = fakeTime();
    const clock = new PlayClock(time.now);
    time.advance(300);
    expect([clock.elapsed(), clock.elapsed(), clock.elapsed()]).toEqual([300, 300, 300]);
  });
});
