import { describe, expect, it } from 'vitest';
import { readBest, type BestStore } from '../../src/scenes/bestScore';
import { applyLoaded } from '../../src/scenes/bootLoad';
import { readMuted, type MuteStore } from '../../src/scenes/muteSetting';
import { readThemeId, type ThemeStore } from '../../src/view/theme/themeSetting';
import { hasResumeParam } from '../../src/scenes/gameStart';

function fakeRegistry(initial: Record<string, unknown> = {}): BestStore & MuteStore & ThemeStore {
  const map = new Map<string, unknown>(Object.entries(initial));
  return { get: (k) => map.get(k), set: (k, v) => map.set(k, v) };
}

describe('applyLoaded (Boot가 읽은 값을 화면·소리에 반영)', () => {
  it('저장된 최고 점수·음소거를 registry와 사운드 출력에 반영한다', () => {
    const registry = fakeRegistry();
    const output = { mute: false };
    applyLoaded(registry, output, {
      bestScore: 700,
      settings: { muted: true, music: true, theme: 'soda' as const },
    });
    expect(readBest(registry)).toBe(700);
    expect(readMuted(registry)).toBe(true);
    expect(output.mute).toBe(true);
  });

  it('저장값이 음소거 꺼짐이면 출력도 켠다', () => {
    const output = { mute: true };
    applyLoaded(fakeRegistry(), output, {
      bestScore: 0,
      settings: { muted: false, music: true, theme: 'soda' as const },
    });
    expect(output.mute).toBe(false);
  });

  it('읽기가 늦어 사용자가 먼저 음소거를 바꿨다면 그 값을 덮지 않는다', () => {
    const registry = fakeRegistry({ muted: true });
    const output = { mute: true };
    applyLoaded(registry, output, {
      bestScore: 5,
      settings: { muted: false, music: true, theme: 'soda' as const },
    });
    expect(readMuted(registry)).toBe(true);
    expect(output.mute).toBe(true);
  });

  it('이미 더 큰 최고 점수가 있으면 낮추지 않는다 (늦게 도착한 읽기)', () => {
    const registry = fakeRegistry({ bestScore: 900 });
    applyLoaded(
      registry,
      { mute: false },
      { bestScore: 300, settings: { muted: false, music: true, theme: 'soda' as const } },
    );
    expect(readBest(registry)).toBe(900);
  });
});

describe('hasResumeParam (DEV 전용 ?resume)', () => {
  it('dev일 때만 ?resume을 인식한다', () => {
    expect(hasResumeParam('?resume', true)).toBe(true);
    expect(hasResumeParam('?seed=1&resume=1', true)).toBe(true);
    expect(hasResumeParam('', true)).toBe(false);
    expect(hasResumeParam('?resume', false)).toBe(false);
  });
});

describe('applyLoaded: 테마 (W4-05)', () => {
  it('저장된 테마를 registry에 반영한다', () => {
    const registry = fakeRegistry();
    applyLoaded(
      registry,
      { mute: false },
      {
        bestScore: 0,
        settings: { muted: false, music: true, theme: 'orbit' },
      },
    );
    expect(readThemeId(registry)).toBe('orbit');
  });

  it('이미 정해진 테마(DEV ?theme=, 메뉴에서 먼저 고름)는 늦게 도착한 저장값이 덮지 않는다', () => {
    const registry = fakeRegistry({ theme: 'butter' });
    applyLoaded(
      registry,
      { mute: false },
      {
        bestScore: 0,
        settings: { muted: false, music: true, theme: 'orbit' },
      },
    );
    expect(readThemeId(registry)).toBe('butter');
  });
});
