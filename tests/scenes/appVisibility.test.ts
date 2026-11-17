import { beforeEach, describe, expect, it } from 'vitest';
import { PlayClock } from '../../src/scenes/playClock';
import {
  isAppHidden,
  nativeBlocksResume,
  nativeChange,
  resetNativeVisibility,
} from '../../src/scenes/appVisibility';

/** GameScene과 같은 연결: 웹 HIDDEN/VISIBLE과 bridge가 알리는 HIDDEN/VISIBLE이 같은 시계를 만진다 */
function harness(startWebHidden = false) {
  let t = 0;
  const clock = new PlayClock(() => t);
  let webHidden = startWebHidden;
  // GameScene과 같다: 시작할 때 이미 숨겨져 있으면 멈춰 둔다
  if (isAppHidden(webHidden)) clock.block('hidden');
  const onHidden = () => clock.block('hidden');
  const onVisible = () => {
    if (!nativeBlocksResume()) clock.unblock('hidden');
  };
  return {
    clock,
    tick: (ms: number) => (t += ms),
    web(hidden: boolean) {
      webHidden = hidden;
      (hidden ? onHidden : onVisible)();
    },
    native(active: boolean) {
      const change = nativeChange(active, webHidden);
      if (change === 'hidden') onHidden();
      else if (change === 'visible') onVisible();
    },
  };
}

describe('웹 숨김 + native 비활성 (둘 다 활성일 때만 흐른다)', () => {
  beforeEach(resetNativeVisibility);

  it('웹 hidden → native 비활성 → 웹 visible: native가 아직 비활성이면 멈춘 채', () => {
    const h = harness();
    h.web(true);
    h.native(false);
    h.web(false);
    expect(h.clock.running).toBe(false);
    h.tick(1000);
    expect(h.clock.elapsed()).toBe(0);
    h.native(true); // 웹은 이미 보임 → 이제 모두 활성
    expect(h.clock.running).toBe(true);
    h.tick(500);
    expect(h.clock.elapsed()).toBe(500);
  });

  it('native 비활성 → 웹 hidden → native 복귀: 웹이 아직 숨겨져 있으면 멈춘 채, 웹 visible에서 이어진다', () => {
    const h = harness();
    h.native(false);
    h.web(true);
    h.native(true);
    expect(h.clock.running).toBe(false);
    h.web(false);
    expect(h.clock.running).toBe(true);
  });

  it('한쪽만 복귀하면 이어지지 않는다', () => {
    const h = harness();
    h.web(true);
    h.native(false);
    h.native(true);
    expect(h.clock.running).toBe(false);
    h.web(false);
    expect(h.clock.running).toBe(true);
  });

  it('같은 통지가 반복돼도 한 번으로 친다', () => {
    const h = harness();
    h.native(false);
    h.native(false);
    h.web(true);
    h.web(true);
    h.native(true);
    h.native(true);
    expect(h.clock.running).toBe(false);
    h.web(false);
    expect(h.clock.running).toBe(true);
  });

  it('일시정지와 겹쳐도 paused는 따로 남는다', () => {
    const h = harness();
    h.clock.block('paused');
    h.native(false);
    h.native(true);
    expect(h.clock.isBlocked('paused')).toBe(true);
    expect(h.clock.running).toBe(false);
    h.clock.unblock('paused');
    expect(h.clock.running).toBe(true);
  });

  it('nativeChange: 복귀 이벤트는 웹이 보일 때만 알린다', () => {
    expect(nativeChange(false, false)).toBe('hidden');
    expect(nativeChange(false, false)).toBeNull();
    expect(nativeChange(true, true)).toBeNull();
    expect(nativeBlocksResume()).toBe(false);
    expect(nativeChange(false, false)).toBe('hidden');
    expect(nativeChange(true, false)).toBe('visible');
  });
});

describe('시작할 때 이미 숨겨져 있는 경우 (새 판)', () => {
  beforeEach(resetNativeVisibility);

  it('native 비활성 먼저 → 새 시계는 멈춘 채 시작', () => {
    nativeChange(false, false);
    const h = harness();
    expect(h.clock.running).toBe(false);
    h.tick(1000);
    expect(h.clock.elapsed()).toBe(0);
  });

  it('한쪽만 복귀하면 멈춘 채, 양쪽 복귀하면 재개 (웹 hidden으로 시작)', () => {
    nativeChange(false, true);
    const h = harness(true);
    h.native(true); // 웹은 아직 숨김
    expect(h.clock.running).toBe(false);
    h.web(false);
    expect(h.clock.running).toBe(true);
  });

  it('native 먼저 복귀, 웹 hidden로 시작한 기존 경로', () => {
    const h = harness(true);
    expect(h.clock.running).toBe(false);
    h.web(false);
    expect(h.clock.running).toBe(true);
  });

  it('native만 비활성으로 시작: 웹 VISIBLE이 와도 멈춘 채, native 복귀에서 재개', () => {
    nativeChange(false, false);
    const h = harness();
    h.web(false);
    expect(h.clock.running).toBe(false);
    h.native(true);
    expect(h.clock.running).toBe(true);
  });

  it('이벤트가 생성 전에 와도 후에 와도 같다', () => {
    const h = harness();
    h.native(false); // 생성 후
    expect(h.clock.running).toBe(false);
    h.native(true);
    expect(h.clock.running).toBe(true);
    nativeChange(false, false); // 다음 판: 생성 전
    expect(harness().clock.running).toBe(false);
  });
});
