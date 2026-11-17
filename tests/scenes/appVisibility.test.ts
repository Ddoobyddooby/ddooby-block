import { beforeEach, describe, expect, it } from 'vitest';
import { PlayClock } from '../../src/scenes/playClock';
import {
  nativeBlocksResume,
  nativeChange,
  resetNativeVisibility,
} from '../../src/scenes/appVisibility';

/** GameScene과 같은 연결: 웹 HIDDEN/VISIBLE과 bridge가 알리는 HIDDEN/VISIBLE이 같은 시계를 만진다 */
function harness() {
  let t = 0;
  const clock = new PlayClock(() => t);
  let webHidden = false;
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
