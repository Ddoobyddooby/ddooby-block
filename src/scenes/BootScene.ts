import Phaser from 'phaser';
import { parseSeedParam } from './seed';

/** 첫 씬. `?seed=N`이 있으면 바로 게임, 없으면 메뉴 (저장소 연결은 뒤 태스크에서 넣는다) */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start(parseSeedParam(window.location.search) === null ? 'Menu' : 'Game');
  }
}
