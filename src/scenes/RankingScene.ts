// 주간 랭킹 화면 (W3-04, PLAN 6.3): 제목 · 주 기간 · 드래그 스크롤 목록 · 하단 내 줄 고정 · [새로고침/다시 시도] [돌아가기].
// 무엇을 보일지(줄·상태·문구)는 view/rankingRows가, 조회 수명(요청 번호·0.3초 로딩·제출 뒤 갱신)은 rankingController가 정하고 이 씬은 그리기만 한다.
// 닉네임이 없으면 [이름 정하기]로 게임 오버 화면과 같은 NicknamePrompt를 띄우고, 저장되면 다시 조회한다.
// 화면 크기가 바뀌면 씬을 다시 시작하지 않고 지금 상태로 다시 그린다 (입력 중인 닉네임 창·조회 진행이 그대로 이어진다).
// ddooby-pang의 RankingScene에서 주간 점수 부분만 복사해 맞췄다 (탭·스토리 별·음악 제외, 다시 그리기·첫 손가락 하나만 따르는 스크롤·DEV 확인용 추가).

import Phaser from 'phaser';
import { RANKING, VIEW } from '../config';
import { fetchRanking } from '../online';
import {
  footerText,
  messageFor,
  refreshLabel,
  weekRangeText,
  type RankingFooter,
  type RankingItem,
  type RankingLine,
} from '../view/rankingRows';
import { RANKING_TEXT } from '../view/rankingText';
import { NicknamePrompt } from '../view/NicknamePrompt';
import { clampScroll, maxScroll, ScrollGesture } from '../view/scrollGesture';
import { addButton, type PressLock } from '../view/ui/Button';
import { submitNickname } from './nicknameFlow';
import { whenSubmissionsSettle } from './pendingSubmission';
import { fakeRankingResult, parseFakeRankingList } from './rankingDev';
import { RankingController, type RankingScreen } from './rankingController';
import { cssColor } from './text';

export class RankingScene extends Phaser.Scene {
  private controller: RankingController | null = null;
  private closed = false;
  private screen: RankingScreen = { phase: 'loading', visible: false };
  /** 서버가 말한 마지막 주 (오류가 나도 기간 줄은 유지한다) */
  private weekText = '';
  /** 지금 그려진 것들. 다시 그릴 때 전부 지운다 */
  private parts: Phaser.GameObjects.GameObject[] = [];
  private maskShape: Phaser.GameObjects.Graphics | null = null;
  private listBox: Phaser.GameObjects.Container | null = null;
  private listTop = 0;
  private listHeight = 0;
  private contentHeight = 0;
  private scroll = 0;
  private readonly gesture = new ScrollGesture(RANKING.dragThreshold);
  private prompt: NicknamePrompt | null = null;
  private refreshLock: PressLock = { pressed: false };
  private backLock: PressLock = { pressed: false };
  private nameLock: PressLock = { pressed: false };

  constructor() {
    super('Ranking');
  }

  create(): void {
    this.closed = false;
    this.cameras.main.setBackgroundColor(VIEW.colors.background);
    this.screen = { phase: 'loading', visible: false };
    this.weekText = '';
    this.parts = [];
    this.maskShape = null;
    this.listBox = null;
    this.contentHeight = 0;
    this.scroll = 0;
    this.gesture.cancel();
    this.prompt = null;
    this.refreshLock = { pressed: false };
    this.backLock = { pressed: false };
    this.nameLock = { pressed: false };

    // DEV 전용: ?rankingFake=<이름>이면 서버 대신 가짜 응답 (프로덕션 빌드에서는 이 분기가 지워진다)
    const fake = import.meta.env.DEV ? parseFakeRankingList(window.location.search, true) : null;
    const controller = new RankingController({
      fetchRanking:
        fake !== null ? () => Promise.resolve(fakeRankingResult(fake)) : () => fetchRanking(),
      waitSubmission: whenSubmissionsSettle,
      after: (ms, fn) => {
        const timer = this.time.delayedCall(ms, fn);
        return () => timer.remove(false);
      },
      loadingMs: RANKING.loadingMs,
      onScreen: (screen) => this.onScreen(screen),
    });
    this.controller = controller;

    this.draw();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.draw, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.cancelGesture, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.cancelGesture, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.cancelGesture, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closed = true;
      controller.close(); // 기다리던 응답·타이머를 버린다
      this.closePrompt();
      this.cancelGesture();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.draw, this);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.GAME_OUT, this.cancelGesture, this);
      this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
      this.game.events.off(Phaser.Core.Events.BLUR, this.cancelGesture, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.cancelGesture, this);
      this.destroyParts();
      if (import.meta.env.DEV) {
        (window as unknown as { __ranking?: unknown }).__ranking = undefined;
      }
    });
    if (import.meta.env.DEV) {
      // 확인용: 지금 상태와 스크롤
      (window as unknown as { __ranking?: unknown }).__ranking = {
        state: () => (this.screen.phase === 'view' ? this.screen.view.state : 'loading'),
        scroll: () => this.scroll,
        maxScroll: () => maxScroll(this.contentHeight, this.listHeight),
        scrollTo: (v: number) => this.setScroll(v),
      };
    }
    controller.open();
  }

  // ── 상태 ──

  private onScreen(screen: RankingScreen): void {
    if (this.closed) return;
    this.screen = screen;
    if (screen.phase === 'view' && screen.weekKey !== null) {
      this.weekText = weekRangeText(screen.weekKey);
    }
    this.scroll = 0;
    this.draw();
  }

  // ── 그리기 ──

  private destroyParts(): void {
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.maskShape?.destroy();
    this.maskShape = null;
    this.listBox = null;
  }

  /** 지금 상태를 화면 크기에 맞춰 처음부터 다시 그린다 (resize·상태 변화) */
  private draw(): void {
    if (this.closed) return;
    this.destroyParts();
    const { colors, fontFamily } = VIEW;
    const R = RANKING;
    const width = this.scale.width;
    const height = Math.max(this.scale.height, 1);
    const cx = width / 2;
    const x0 = cx - R.list.width / 2;
    this.listTop = R.list.top;
    this.listHeight = Math.max(0, height - R.list.bottomReserve - R.list.top);

    const text = (y: number, value: string, size: number, color: number, bold: boolean) =>
      this.add
        .text(cx, y, value, {
          fontFamily,
          fontSize: size,
          fontStyle: bold ? 'bold' : 'normal',
          color: cssColor(color),
        })
        .setOrigin(0.5);
    this.parts.push(text(R.titleY, RANKING_TEXT.title, R.titleSize, colors.text, true));
    this.parts.push(text(R.weekY, this.weekText, R.weekSize, colors.textDim, false));

    const listBox = this.add.container(0, this.listTop);
    this.listBox = listBox;
    this.parts.push(listBox);
    const maskShape = this.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRect(0, this.listTop, width, this.listHeight);
    listBox.setMask(maskShape.createGeometryMask());
    this.maskShape = maskShape;
    const fixedBox = this.add.container(0, 0);
    this.parts.push(fixedBox);

    this.contentHeight = 0;
    const screen = this.screen;
    if (screen.phase === 'loading') {
      if (screen.visible) this.showMessage(fixedBox, RANKING_TEXT.loading, cx);
    } else {
      const message = messageFor(screen.view);
      if (message) this.showMessage(fixedBox, message, cx);
      if (screen.view.state === 'list') this.drawList(listBox, screen.view.items, x0, cx);
      if (
        (screen.view.state === 'list' || screen.view.state === 'empty') &&
        screen.view.footer !== null
      ) {
        this.drawFooter(fixedBox, screen.view.footer, x0, height);
      }
    }
    this.scroll = clampScroll(this.scroll, this.contentHeight, this.listHeight);
    listBox.y = this.listTop - this.scroll;

    // 아래 버튼 두 개. 같은 잠금을 쓰는 건 돌아가기뿐이고, 새로고침은 여러 번 누를 수 있다
    const b = R.button;
    const by = height - b.bottomY;
    const view = screen.phase === 'view' ? screen.view : null;
    const spec = (label: string, fill: number, textColor: number) => ({
      label,
      width: b.width,
      height: b.height,
      radius: b.radius,
      fontSize: b.fontSize,
      fill,
      textColor,
    });
    this.parts.push(
      addButton(
        this,
        cx - b.dx,
        by,
        spec(refreshLabel(view), colors.button, colors.buttonText),
        () => {
          this.refreshLock.pressed = false; // 여러 번 누를 수 있는 버튼
          this.controller?.reload();
        },
        this.refreshLock,
      ),
      addButton(
        this,
        cx + b.dx,
        by,
        spec(RANKING_TEXT.back, colors.uiFill, colors.text),
        () => this.scene.start('Menu'),
        this.backLock,
      ),
    );
  }

  private showMessage(box: Phaser.GameObjects.Container, value: string, cx: number): void {
    const { colors, fontFamily } = VIEW;
    const R = RANKING;
    box.add(
      this.add
        .text(cx, this.listTop + this.listHeight / 2, value, {
          fontFamily,
          fontSize: R.message.size,
          color: cssColor(colors.textDim),
          align: 'center',
          wordWrap: { width: R.message.wrapWidth, useAdvancedWrap: true },
        })
        .setOrigin(0.5),
    );
  }

  private drawList(
    box: Phaser.GameObjects.Container,
    items: readonly RankingItem[],
    x0: number,
    cx: number,
  ): void {
    const L = RANKING.list;
    let y = L.pad;
    for (const item of items) {
      if (item.kind === 'gap') {
        this.drawGap(box, cx, y + L.gapH / 2);
        y += L.gapH + L.rowGap;
      } else {
        this.drawRow(box, item, x0, y);
        y += L.rowH + L.rowGap;
      }
    }
    this.contentHeight = y + L.pad;
  }

  /** 순번이 이어지지 않는 곳: 가운데 점 세 개 (글자 ⋯ 대신 그려서 글꼴과 상관없이 같게 보인다) */
  private drawGap(box: Phaser.GameObjects.Container, cx: number, cy: number): void {
    const d = RANKING.gapDot;
    const g = this.add.graphics().fillStyle(VIEW.colors.textDim, 1);
    for (let k = -1; k <= 1; k++) g.fillCircle(cx + k * d.spacing, cy, d.r);
    box.add(g);
  }

  /** 줄 하나: 바탕 + 순위(오른쪽 정렬) + 닉네임 + 태그(작게) + 점수(오른쪽 정렬). 닉네임·태그가 점수에 닿으면 함께 줄인다 */
  private drawRow(
    box: Phaser.GameObjects.Container,
    line: RankingLine,
    x0: number,
    top: number,
  ): void {
    const { colors, fontFamily } = VIEW;
    const R = RANKING;
    const L = R.list;
    const W = R.row;
    const cy = top + L.rowH / 2;
    const bg = this.add.graphics();
    if (line.isMe) bg.fillStyle(R.colors.meFill, 1).lineStyle(W.meStroke, colors.button, 1);
    else bg.fillStyle(colors.uiFill, R.colors.rowAlpha);
    bg.fillRoundedRect(x0, top, L.width, L.rowH, W.radius);
    if (line.isMe) bg.strokeRoundedRect(x0, top, L.width, L.rowH, W.radius);
    box.add(bg);

    const make = (x: number, size: number, color: number, value: string, originX: number) =>
      this.add
        .text(x, cy, value, {
          fontFamily,
          fontSize: size,
          fontStyle: line.isMe ? 'bold' : 'normal',
          color: cssColor(color),
        })
        .setOrigin(originX, 0.5);
    const medalColor = line.medal === null ? colors.textDim : R.colors.medal[line.medal - 1];
    const rank = make(x0 + W.rankRight, W.fontSize, medalColor ?? colors.textDim, line.rank, 1);
    const name = make(x0 + W.nameLeft, W.fontSize, colors.text, line.nickname, 0);
    const tag = make(0, W.tagFontSize, colors.textDim, line.tag, 0);
    const score = make(x0 + W.scoreRight, W.fontSize, colors.text, line.score, 1);
    const available = score.x - score.width - W.minGap - name.x;
    const needed = name.width + W.tagGap + tag.width;
    const k = needed > available ? Math.max(0.5, available / needed) : 1;
    name.setScale(k);
    tag.setScale(k);
    tag.setX(name.x + name.width * k + W.tagGap * k);
    box.add([rank, name, tag, score]);
  }

  /** 하단 고정 줄 (내 순위 / 기록 없음 / 이름 없음 + [이름 정하기]) */
  private drawFooter(
    box: Phaser.GameObjects.Container,
    footer: RankingFooter,
    x0: number,
    height: number,
  ): void {
    const { colors, fontFamily } = VIEW;
    const R = RANKING;
    const L = R.list;
    const F = R.footer;
    const W = R.row;
    const cy = height - F.bottomY;
    const bg = this.add.graphics();
    const me = footer.kind === 'me';
    if (me) bg.fillStyle(R.colors.meFill, 1).lineStyle(W.meStroke, colors.button, 1);
    else bg.fillStyle(colors.uiFill, R.colors.rowAlpha);
    bg.fillRoundedRect(x0, cy - F.height / 2, L.width, F.height, W.radius);
    if (me) bg.strokeRoundedRect(x0, cy - F.height / 2, L.width, F.height, W.radius);
    box.add(bg);

    const t = footerText(footer);
    box.add(
      this.add
        .text(x0 + 24, cy, t.left, {
          fontFamily,
          fontStyle: me ? 'bold' : 'normal',
          fontSize: footer.kind === 'noNickname' ? F.subFontSize : F.fontSize,
          color: cssColor(colors.text),
          wordWrap: { width: F.textWrap, useAdvancedWrap: true },
        })
        .setOrigin(0, 0.5),
    );
    if (t.right) {
      box.add(
        this.add
          .text(x0 + W.scoreRight, cy, t.right, {
            fontFamily,
            fontStyle: 'bold',
            fontSize: F.fontSize,
            color: cssColor(colors.text),
          })
          .setOrigin(1, 0.5),
      );
    }
    if (footer.kind === 'noNickname') {
      const b = F.button;
      box.add(
        addButton(
          this,
          x0 + W.scoreRight - b.width / 2 - 4,
          cy,
          {
            label: RANKING_TEXT.setName,
            width: b.width,
            height: b.height,
            radius: b.radius,
            fontSize: b.fontSize,
            fill: colors.button,
            textColor: colors.buttonText,
          },
          () => {
            this.nameLock.pressed = false;
            this.openPrompt();
          },
          this.nameLock,
        ),
      );
    }
  }

  // ── 닉네임 ──

  private openPrompt(): void {
    if (this.closed || this.prompt) return;
    this.prompt = new NicknamePrompt({
      canvas: this.game.canvas,
      submit: submitNickname,
      onClose: (outcome) => {
        this.prompt = null;
        // 이름이 생겼으니(이미 정해져 있던 경우 포함) 다시 조회해 내 줄을 보인다. 그 사이 화면을 떠났으면 컨트롤러가 무시한다
        if (outcome === 'saved' && !this.closed) this.controller?.reload();
      },
    });
  }

  private closePrompt(): void {
    this.prompt?.destroy();
    this.prompt = null;
  }

  // ── 스크롤 (첫 손가락 하나만 따른다) ──

  private setScroll(value: number): void {
    this.scroll = clampScroll(value, this.contentHeight, this.listHeight);
    if (this.listBox) this.listBox.y = this.listTop - this.scroll;
  }

  private inList(pointer: Phaser.Input.Pointer): boolean {
    return pointer.y >= this.listTop && pointer.y <= this.listTop + this.listHeight;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.gesture.down(pointer.id, pointer.x, pointer.y, this.scroll, this.inList(pointer));
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return;
    const next = this.gesture.move(pointer.id, pointer.x, pointer.y);
    if (next !== null) this.setScroll(next);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.gesture.up(pointer.id);
  }

  private cancelGesture(): void {
    this.gesture.cancel();
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (this.inList(pointer)) this.setScroll(this.scroll + dy);
  }
}
