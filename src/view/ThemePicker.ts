// 테마 고르기 창 (W4-05): 메뉴 위에 어두운 막 + 패널 + 테마 카드 3개(이름 + 블록 미리보기) + 닫기 버튼.
// 카드를 누르면 onPick(id), 막이나 닫기를 누르면 onClose. 카드는 그 테마의 배경·글꼴·블록으로 그려 고르기 전에 모습을 볼 수 있다.
// ddooby-pang의 ThemePicker 구조를 참고했다. 값이 여기 있는 건 이 창에만 쓰는 모양 수치라서다.

import Phaser from 'phaser';
import { VIEW } from '../config';
import { blockTextureKey, createBlockTextures } from './blockTexture';
import { Sfx } from './Sfx';
import { addButton } from './ui/Button';
import { drawPanel } from './ui/Panel';
import { textStyle } from './theme/textStyle';
import { themeOf } from './theme/themeSetting';
import { THEME_LIST, type ThemeId } from './theme/themes';

const PICKER = {
  depth: 100,
  dimAlpha: 0.72,
  panel: { width: 640, pad: 44, radius: 40 },
  title: { text: '테마', size: 56, height: 80 },
  card: {
    width: 552,
    height: 190,
    gap: 26,
    radius: 34,
    border: 3,
    selectedBorder: 10,
    nameSize: 38,
  },
  /** 카드 안 블록 미리보기: 색 그룹, 칸 크기, 간격. 카드 오른쪽에 둔다 */
  preview: { colors: [1, 0, 2] as const, size: 64, gap: 72, right: 40 },
  close: { text: '닫기', width: 400, height: 100, fontSize: 40, gap: 34 },
} as const;

/** 창을 연다. 닫을 때(고르든 닫든) 만든 것을 모두 지운다. 돌려주는 함수로 바깥에서 닫을 수도 있다 */
export function openThemePicker(
  scene: Phaser.Scene,
  onPick: (id: ThemeId) => void,
  onClose: () => void,
): () => void {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const cy = height / 2;
  const current = themeOf(scene);
  const root = scene.add.container(0, 0).setDepth(PICKER.depth);
  const sfx = new Sfx(scene);
  /** 먼저 일어난 고르기·닫기 하나만 받는다 (카드 누름 연출 중에 막을 눌러도 둘 다 실행되지 않게) */
  let done = false;
  const cards: Phaser.GameObjects.Container[] = [];
  const dispose = (): void => {
    scene.tweens.killTweensOf(cards);
    root.destroy();
  };
  const finish = (after: () => void): void => {
    if (done) return;
    done = true;
    dispose();
    after();
  };

  // 막: 누르면 닫힘. 뒤에 있는 버튼이 눌리지 않게 화면 전체를 덮는다
  const dim = scene.add
    .rectangle(0, 0, width, height, current.colors.overlay, PICKER.dimAlpha)
    .setOrigin(0)
    .setInteractive();
  dim.on('pointerup', () => finish(onClose));
  root.add(dim);

  const { card, panel, title, close } = PICKER;
  const gridH = THEME_LIST.length * card.height + (THEME_LIST.length - 1) * card.gap;
  const bodyH = title.height + gridH + close.gap + close.height;
  const top = cy - (bodyH + panel.pad * 2) / 2;
  const bottom = top + bodyH + panel.pad * 2;
  // 패널은 새 Graphics이므로 root로 옮긴다. 판 위를 눌러도 막이 닫히지 않게 판 크기의 입력 영역을 둔다
  const panelBg = drawPanel(scene, cx, top, bottom, { width: panel.width, radius: panel.radius });
  const blocker = scene.add
    .rectangle(cx, (top + bottom) / 2, panel.width, bottom - top, 0, 0)
    .setInteractive();
  root.add([panelBg, blocker]);

  const bodyTop = top + panel.pad;
  root.add(
    scene.add
      .text(
        cx,
        bodyTop + title.height / 2,
        title.text,
        textStyle(current, 'heading', title.size, current.colors.ink),
      )
      .setOrigin(0.5),
  );

  THEME_LIST.forEach((theme, i) => {
    createBlockTextures(scene, theme.id); // 고르기 전 테마도 미리보기에 쓴다
    const y = bodyTop + title.height + i * (card.height + card.gap) + card.height / 2;
    const picked = theme.id === current.id;
    const bg = scene.add.graphics();
    bg.fillStyle(theme.colors.shadow, 0.5).fillRoundedRect(
      -card.width / 2,
      -card.height / 2 + 8,
      card.width,
      card.height,
      card.radius,
    );
    bg.fillStyle(theme.colors.background, 1).fillRoundedRect(
      -card.width / 2,
      -card.height / 2,
      card.width,
      card.height,
      card.radius,
    );
    // 고른 테마는 굵은 강조색 테두리
    bg.lineStyle(
      picked ? card.selectedBorder : card.border,
      picked ? theme.colors.accent : theme.colors.edge,
      1,
    ).strokeRoundedRect(-card.width / 2, -card.height / 2, card.width, card.height, card.radius);
    const name = scene.add
      .text(
        -card.width / 2 + 44,
        0,
        theme.name,
        textStyle(theme, 'heading', card.nameSize, theme.colors.ink),
      )
      .setOrigin(0, 0.5);
    const p = PICKER.preview;
    const blocks = p.colors.map((color, k) =>
      scene.add
        .image(
          card.width / 2 - p.right - (p.colors.length - 1 - k) * p.gap,
          0,
          blockTextureKey(theme.id, color),
        )
        .setDisplaySize(p.size, p.size),
    );
    const container = scene.add
      .container(cx, y, [bg, name, ...blocks])
      .setSize(card.width, card.height)
      .setInteractive({ useHandCursor: true });
    container.on('pointerup', () => {
      if (done) return;
      sfx.play('button');
      scene.tweens.add({
        targets: container,
        scale: VIEW.button.pressScale,
        duration: VIEW.button.pressMs,
        yoyo: true,
        onComplete: () => finish(() => (theme.id === current.id ? onClose() : onPick(theme.id))),
      });
    });
    cards.push(container);
    root.add(container);
  });

  const closeBtn = addButton(
    scene,
    cx,
    bodyTop + title.height + gridH + close.gap + close.height / 2,
    {
      label: close.text,
      width: close.width,
      height: close.height,
      fontSize: close.fontSize,
      primary: true,
    },
    () => finish(onClose),
  );
  root.add(closeBtn);

  return () => finish(onClose);
}
