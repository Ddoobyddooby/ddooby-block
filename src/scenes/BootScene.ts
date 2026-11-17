import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import Phaser from 'phaser';
import { SAVE, SOUND } from '../config';
import { ensureAccount } from '../online';
import {
  CapacitorPreferencesStorage,
  LocalStorageAdapter,
  type KeyValueStore,
} from '../storage/adapters';
import { Persistence } from '../storage/persistence';
import { sfxKey, type SfxName } from '../view/Sfx';
import { applyLoaded } from './bootLoad';
import { parseFillParam } from './devFill';
import { parseOverParam } from './gameOverRules';
import { hasResumeParam, type GameStartData } from './gameStart';
import { putPersistence } from './persistenceRegistry';
import { loadFonts, refreshTexts } from '../view/theme/fonts';
import { devTheme } from '../view/theme/themes';
import { hasTheme, lockTheme, writeTheme } from '../view/theme/themeSetting';
import { DEFAULT_THEME } from '../themeIds';
import { parseSeedParam } from './seed';

/** 앱(Android)은 Capacitor Preferences, 웹은 localStorage (PLAN 6.2) */
function createStore(): KeyValueStore {
  if (Capacitor.isNativePlatform()) return new CapacitorPreferencesStorage(Preferences);
  // localStorage는 접근만 해도 예외가 날 수 있어 꺼내는 함수로 넘긴다 (읽기·쓰기가 실패로 바뀌고 게임은 계속된다)
  return new LocalStorageAdapter(() => window.localStorage);
}

/** 저장소가 지워지지 않게 요청한다. 없거나 거부돼도 진행한다 */
function requestPersist(): void {
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // 지원하지 않는 환경
  }
}

/**
 * 첫 씬. 효과음을 미리 읽고, 저장소(최고 점수·음소거·테마·진행 중인 판)와 글꼴을 읽은 뒤 `?seed=N`이나 DEV `?fill=`이 있으면
 * 바로 게임, 없으면 메뉴로 간다. 소리 파일을 못 읽어도, 저장소 읽기가 실패하거나 늦어도 게임은 진행된다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const [name, { file }] of Object.entries(SOUND.effects)) {
      this.load.audio(
        sfxKey(name as SfxName),
        SOUND.formats.map((ext) => `audio/${file}.${ext}`),
      );
    }
  }

  create(): void {
    const persistence = new Persistence(createStore());
    putPersistence(this.registry, persistence);
    requestPersist();
    // 익명 계정 (W3-02). 기다리지 않는다: 키가 없거나 오프라인·실패면 온라인 기능만 꺼지고 게임은 그대로다
    void ensureAccount();

    // DEV `?theme=<id>`: 저장하지 않고 이 실행에만 적용한다. 저장값 반영(applyLoaded)은 이미 정해진 테마를 덮지 않는다 (프로덕션 빌드에서는 이 분기가 지워진다)
    if (import.meta.env.DEV) {
      const dev = devTheme(window.location.search, true);
      if (dev !== null) lockTheme(this.registry, dev);
    }

    const direct =
      parseSeedParam(window.location.search) !== null ||
      parseFillParam(window.location.search, import.meta.env.DEV) !== null;
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      // 첫 화면이 뜨는 순간의 테마를 정한다: 읽기가 늦으면 기본 테마로 시작하고, 늦게 읽힌 저장 테마는 다음 메뉴 진입 때 반영된다
      if (!hasTheme(this.registry)) writeTheme(this.registry, DEFAULT_THEME);
      // DEV 전용 `?over`: 게임 없이 게임 오버 화면만 본다 (예시 값, 저장소는 건드리지 않는다). 프로덕션 빌드에서는 이 분기가 지워진다
      if (import.meta.env.DEV) {
        const over = parseOverParam(window.location.search, true);
        if (over !== null) {
          this.scene.start('GameOver', over);
          return;
        }
      }
      const data: GameStartData = {};
      // DEV 전용 `?resume`: 메뉴의 이어하기 버튼과 같은 길로 바로 이어한다 (자동 확인용). 프로덕션 빌드에서는 이 분기가 지워진다
      if (import.meta.env.DEV && hasResumeParam(window.location.search, true)) {
        const resume = persistence.resumable();
        if (resume === null) console.warn('[boot] ?resume: 이어할 수 있는 판이 없음');
        else data.resume = resume;
      }
      this.scene.start(direct || data.resume !== undefined ? 'Game' : 'Menu', data);
    };

    // 저장소를 읽는다 (load는 실패해도 거부되지 않는다). 늦으면 기다리지 않고 넘어가고, 읽기가 끝나면 그때 반영한다.
    // 그 사이의 쓰기는 읽기 뒤로 줄을 서므로 기존 기록을 기본값으로 덮지 않는다
    // 글꼴 읽기도 같이 기다린다 (글꼴이 있어야 첫 화면의 글자가 처음부터 맞게 그려진다). 늦거나 실패해도 같은 제한 시간 뒤에 시스템 글꼴로 시작하고,
    // 글꼴이 늦게 도착하면 이미 그린 글자를 다시 그린다 (refreshTexts)
    const fontsReady = loadFonts().then(() => {
      if (started) refreshTexts(this.game);
    });
    const loaded = persistence.load().then((result) => {
      applyLoaded(this.registry, this.sound, result);
    });
    void Promise.all([loaded, fontsReady]).then(start);
    this.time.delayedCall(SAVE.bootTimeoutMs, start);
  }
}
