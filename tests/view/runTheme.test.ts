import { describe, expect, it } from 'vitest';
import { applyLoaded } from '../../src/scenes/bootLoad';
import { createBlockTextures } from '../../src/view/blockTexture';
import { screenLayout } from '../../src/view/layout';
import { TrayView } from '../../src/view/TrayView';
import {
  adoptPreferredTheme,
  clearRunTheme,
  hasPendingTheme,
  lockTheme,
  pinRunTheme,
  themeOf,
  writeTheme,
} from '../../src/view/theme/themeSetting';

// 지적 1 회귀: 느린 부팅 읽기 → 기본 메뉴 → Game → 읽기 완료 → 새 트레이.
// 한 판의 보드·HUD·트레이는 시작할 때 테마를 고정하고, 늦게 읽힌 저장 테마는 다음 메뉴 진입 때 반영된다. Phaser 없이 가짜 씬으로 본다.

function fakeScene() {
  const map = new Map<string, unknown>();
  const registry = {
    get: (k: string) => map.get(k),
    set: (k: string, v: unknown) => map.set(k, v),
  };
  const textures = new Set<string>();
  const requested: { key: string; exists: boolean }[] = [];
  const chain: unknown = new Proxy(() => chain, {
    get: (_, key) => (key === 'generateTexture' ? generate : chain),
    apply: () => chain,
  });
  function generate(key: string): unknown {
    textures.add(key);
    return chain;
  }
  const scene = {
    registry,
    textures: { exists: (k: string) => textures.has(k) },
    make: {
      graphics: () => chain,
      image: ({ key }: { key: string }) => {
        requested.push({ key, exists: textures.has(key) });
        return { setScale: () => ({}) };
      },
    },
    add: { graphics: () => chain, container: () => chain },
    tweens: { getTweensOf: () => [], killTweensOf: () => undefined },
  };
  return { scene, registry, requested };
}

const ORBIT_LOADED = {
  bestScore: 0,
  settings: { muted: false, music: true, theme: 'orbit' as const },
};

describe('한 판의 테마 고정 (늦은 부팅 읽기)', () => {
  it('판이 시작된 뒤 저장 테마가 도착해도 보드·트레이 테마와 텍스처 키가 그대로고, 다음 메뉴에서 반영된다', () => {
    const { scene, registry, requested } = fakeScene();
    // 1) 읽기가 늦어 기본 테마(soda)로 첫 화면이 뜬다 (Boot start)
    writeTheme(registry, 'soda');
    // 2) 메뉴 → Game 시작: 테마 고정 + 텍스처 생성 + 트레이
    const theme = pinRunTheme(registry);
    expect(theme.id).toBe('soda');
    createBlockTextures(scene as never, theme.id);
    const tray = new TrayView(scene as never, screenLayout(1280, 720));
    tray.render(['i3h']);
    expect(requested).toHaveLength(3);
    // 3) 저장 테마(orbit)가 뒤늦게 도착
    applyLoaded(registry, { mute: false }, ORBIT_LOADED);
    expect(themeOf({ registry }).id).toBe('soda'); // 진행 중인 판(Pause·GameOver 포함)은 그대로
    // 4) 새 트레이: 같은 테마의 키, 모두 만들어져 있다
    tray.render(['i3h', 'dot', 'o3']);
    expect(requested.length).toBeGreaterThan(3);
    for (const { key, exists } of requested) {
      expect(key.startsWith('block-soda-'), key).toBe(true);
      expect(exists, key).toBe(true);
    }
    // 5) 다음 메뉴 진입: 고정을 풀고 저장 테마를 반영
    expect(hasPendingTheme(registry)).toBe(true);
    clearRunTheme(registry);
    expect(adoptPreferredTheme(registry)).toBe(true);
    expect(themeOf({ registry }).id).toBe('orbit');
  });

  it('읽기가 시작 전에 끝나면 저장 테마로 바로 시작한다 (반영할 것이 남지 않는다)', () => {
    const { registry } = fakeScene();
    applyLoaded(registry, { mute: false }, ORBIT_LOADED);
    expect(themeOf({ registry }).id).toBe('orbit');
    expect(hasPendingTheme(registry)).toBe(false);
  });

  it('사용자가 이번 실행에서 고른 테마·DEV ?theme은 늦은 저장 테마보다 우선한다', () => {
    const { registry } = fakeScene();
    writeTheme(registry, 'soda');
    lockTheme(registry, 'butter'); // 메뉴 카드 / DEV ?theme=butter
    applyLoaded(registry, { mute: false }, ORBIT_LOADED);
    expect(hasPendingTheme(registry)).toBe(false);
    expect(adoptPreferredTheme(registry)).toBe(false);
    expect(themeOf({ registry }).id).toBe('butter');
  });

  it('다음 판도 같은 메뉴 규칙을 따른다: 고정은 메뉴가 뜰 때만 풀린다', () => {
    const { registry } = fakeScene();
    writeTheme(registry, 'soda');
    pinRunTheme(registry);
    applyLoaded(registry, { mute: false }, ORBIT_LOADED);
    // [다시 하기]로 새 판: 메뉴를 거치지 않으므로 같은 테마로 다시 고정된다
    expect(pinRunTheme(registry).id).toBe('soda');
  });
});
