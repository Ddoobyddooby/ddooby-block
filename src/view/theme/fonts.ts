// 테마 글꼴 파일 읽기. 파일은 앱에 쓰는 글자만 남긴 서브셋이다 (`npm run fonts:subset`, scripts/fonts/subset.mjs).
// 서브셋에 없는 글자(닉네임 등)는 theme.fonts의 시스템 글꼴 목록으로 보인다.
// 늦거나 실패해도 게임은 시스템 글꼴로 진행하고, 로드가 끝나면 이미 그린 글자를 다시 그린다 (refreshTexts).

import type Phaser from 'phaser';

export interface FontFile {
  family: string;
  /** public/fonts/ 아래 파일 */
  file: string;
  /** 가변 글꼴이면 "min max", 아니면 한 값 */
  weight: string;
}

/** 쓰는 글꼴 5종 (SPEC 아님 · 디자인 시안 README). Fredoka·Space Grotesk·Baloo 2는 영어 제목, SUIT·고운돋움은 한글 UI와 숫자 */
export const FONT_FILES: readonly FontFile[] = [
  { family: 'Fredoka', file: 'Fredoka-subset.ttf', weight: '300 700' },
  { family: 'Space Grotesk', file: 'SpaceGrotesk-subset.ttf', weight: '300 700' },
  { family: 'Baloo 2', file: 'Baloo2-subset.ttf', weight: '400 800' },
  { family: 'SUIT', file: 'SUIT-subset.ttf', weight: '100 900' },
  { family: 'Gowun Dodum', file: 'GowunDodum-subset.ttf', weight: '400' },
];

/** 글꼴을 등록하고 읽는다. 하나라도 못 읽으면 false (읽은 것은 그대로 쓴다). 예외를 던지지 않는다 */
export async function loadFonts(): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return false;
  const results = await Promise.all(
    FONT_FILES.map(async ({ family, file, weight }) => {
      try {
        const face = new FontFace(family, `url(fonts/${file})`, { weight, display: 'swap' });
        document.fonts.add(await face.load());
        return true;
      } catch (error) {
        console.warn(`[fonts] ${family} 읽기 실패, 시스템 글꼴로 보임`, error);
        return false;
      }
    }),
  );
  return results.every(Boolean);
}

function refreshObject(object: Phaser.GameObjects.GameObject): void {
  if (object.type === 'Text') {
    (object as Phaser.GameObjects.Text).style.update(true);
  } else if (object.type === 'Container') {
    for (const child of (object as Phaser.GameObjects.Container).list) refreshObject(child);
  }
}

/** 글꼴이 늦게 도착했을 때: 지금 떠 있는 모든 씬의 글자를 새 글꼴로 다시 그린다 (씬을 다시 시작하지 않으므로 진행 중인 판이 유지된다) */
export function refreshTexts(game: Phaser.Game): void {
  for (const scene of game.scene.getScenes(false)) {
    if (scene.children === undefined) continue;
    for (const object of scene.children.list) refreshObject(object);
  }
}
