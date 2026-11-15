import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import Phaser from 'phaser';
import { SAVE, SOUND } from '../config';
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
 * 첫 씬. 효과음을 미리 읽고, 저장소(최고 점수·음소거·진행 중인 판)를 읽은 뒤 `?seed=N`이나 DEV `?fill=`이 있으면
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

    const direct =
      parseSeedParam(window.location.search) !== null ||
      parseFillParam(window.location.search, import.meta.env.DEV) !== null;
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
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
    void persistence.load().then((result) => {
      applyLoaded(this.registry, this.sound, result);
      start();
    });
    this.time.delayedCall(SAVE.bootTimeoutMs, start);
  }
}
