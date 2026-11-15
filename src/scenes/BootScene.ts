import Phaser from 'phaser';
import { SOUND } from '../config';
import { sfxKey, type SfxName } from '../view/Sfx';
import { parseFillParam } from './devFill';
import { applyMuted } from './muteSetting';
import { parseSeedParam } from './seed';

/**
 * 첫 씬. 효과음을 미리 읽고, `?seed=N`이나 DEV `?fill=`이 있으면 바로 게임, 없으면 메뉴로 간다
 * (저장소 연결은 뒤 태스크에서 넣는다). 소리 파일을 못 읽어도 게임은 진행된다 (Phaser가 경고만 남기고 넘어간다).
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
    // 저장값(음소거)을 실제 출력에 맞춘다
    applyMuted(this.registry, this.sound);
    const direct =
      parseSeedParam(window.location.search) !== null ||
      parseFillParam(window.location.search, import.meta.env.DEV) !== null;
    this.scene.start(direct ? 'Game' : 'Menu');
  }
}
