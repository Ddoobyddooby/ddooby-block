import Phaser from 'phaser';

/** 첫 씬. 지금은 비어 있다 (저장소 연결·씬 전환은 뒤 태스크에서 넣는다) */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
}
