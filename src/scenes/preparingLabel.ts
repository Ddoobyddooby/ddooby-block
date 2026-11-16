// "준비 중…" 문구 (W3-03). 서버 run을 기다리는 동안 화면 아래쪽에 보이고, 기다림이 짧으면(키 없음·오프라인 등) 나타나지도 않는다.
import Phaser from 'phaser';
import { VIEW } from '../config';
import { cssColor } from './text';

/** 문구를 예약하고, 표시를 지우는 함수를 돌려준다 (지운 뒤에는 나타나지 않는다. 화면이 이미 끝났어도 안전하다) */
export function showPreparing(scene: Phaser.Scene): () => void {
  const { colors, fontFamily, preparing } = VIEW;
  let text: Phaser.GameObjects.Text | null = null;
  const timer = scene.time.delayedCall(preparing.showAfterMs, () => {
    const { width, height } = scene.scale;
    text = scene.add
      .text(width / 2, height * preparing.y, '준비 중…', {
        fontFamily,
        fontSize: preparing.size,
        color: cssColor(colors.textDim),
      })
      .setOrigin(0.5)
      .setDepth(1000);
  });
  return () => {
    timer.remove(false);
    text?.destroy();
    text = null;
  };
}
