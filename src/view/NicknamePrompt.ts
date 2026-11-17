// 닉네임 입력 창 (W3-02, PLAN 7절). Phaser에는 글자 입력이 없어 HTML <input>을 게임 캔버스 위에 띄운다 (pang src/view/NicknamePrompt.ts에서 복사, block 색·문구로 맞췄다).
// 캔버스가 화면에 그려진 크기·위치를 따라가며 배치하고(폭 720 기준 배율), 창이 닫히면 DOM을 모두 지운다.
// 판정(길이·글자·금칙어)과 서버 호출은 주입받는 submit이 한다. 이 파일은 Phaser·src/online을 모른다.

import { cssColor } from './theme/textStyle';
import type { Theme } from './theme/themes';
import {
  applyResult,
  chooseLater,
  initialPromptState,
  isLocked,
  PROMPT_TIMINGS,
  shouldLaterOnEscape,
  shouldSubmitOnEnter,
  startSubmit,
  submitWithTimeout,
  type NicknameResult,
  type PromptOutcome,
  type PromptState,
  type PromptTimings,
} from './nicknamePromptState';
import { NICKNAME_TEXT, type NicknamePromptText } from './nicknameText';

export interface NicknamePromptOptions {
  /** 게임 캔버스 (scene.game.canvas). 이 위에 겹쳐 배치한다 */
  canvas: HTMLElement;
  /** 색·글꼴을 따올 테마 (화면과 같은 것) */
  theme: Theme;
  submit: (name: string) => Promise<NicknameResult>;
  /** 안내까지 보여 준 뒤 닫힐 때 한 번만 부른다 (destroy()로 없앨 때는 부르지 않는다) */
  onClose: (result: PromptOutcome) => void;
  text?: NicknamePromptText;
  timings?: PromptTimings;
}

/** 값은 게임 좌표(폭 720) 기준 px. 화면에는 캔버스 폭/720 배율로 그린다 */
const STYLE = {
  designWidth: 720,
  zIndex: 1000,
  /** 가상 키보드가 칸을 가리지 않게 창을 캔버스 위쪽에 둔다 (캔버스 높이 대비) */
  top: 0.1,
  panel: { width: 640, pad: 36, radius: 36, border: 6, gap: 22 },
  title: { fontSize: 44 },
  input: { fontSize: 44, height: 96, radius: 48, border: 5 },
  notice: { fontSize: 26 },
  message: { fontSize: 32, height: 48 },
  button: { fontSize: 44, height: 92, gap: 20 },
  /** iOS Safari는 16px 미만 입력칸에 초점을 주면 화면을 확대한다 */
  minInputPx: 16,
  /**
   * 입력 글자 수 상한. 규칙(2~10자)보다 넉넉하다: 붙여넣은 조합형(NFD) 한글은 한 글자가 최대 3 코드 유닛이라
   * 10자가 30으로 세어지고, 규칙 판정은 NFC 정규화 뒤에 하기 때문이다
   */
  maxLength: 40,
} as const;

/** 창 위의 입력이 뒤 화면(GameOver 버튼·Phaser 입력)에 닿지 않게 끊는 이벤트. Phaser는 window에서도 듣는다 */
const BLOCKED_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'click',
  'keydown',
  'keyup',
] as const;

export class NicknamePrompt {
  private readonly text: NicknamePromptText;
  private readonly timings: PromptTimings;
  private state: PromptState = initialPromptState();
  private root: HTMLDivElement | null = null;
  private panel!: HTMLDivElement;
  private titleEl!: HTMLDivElement;
  private input!: HTMLInputElement;
  private messageEl!: HTMLDivElement;
  private noticeEl!: HTMLDivElement;
  private confirmBtn!: HTMLButtonElement;
  private laterBtn!: HTMLButtonElement;
  private closeTimer: number | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private done = false;

  constructor(private readonly opts: NicknamePromptOptions) {
    this.text = opts.text ?? NICKNAME_TEXT;
    this.timings = opts.timings ?? PROMPT_TIMINGS;
    this.build();
    this.layout();
    window.addEventListener('resize', this.layout);
    window.addEventListener('orientationchange', this.layout);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.layout);
      this.resizeObserver.observe(opts.canvas);
    }
    this.input.focus({ preventScroll: true });
  }

  /** 지금 창이 DOM에 떠 있는지 */
  get isOpen(): boolean {
    return this.root !== null;
  }

  /** 뒤로 가기 버튼: Esc와 같이 [나중에]로 닫는다 (안내를 보인 뒤 닫힌다). 이미 닫히는 중이면 아무 일도 없다 */
  dismiss(): void {
    this.later();
  }

  /** 씬이 끝나거나 바뀔 때 부른다. onClose 없이 DOM·타이머·리스너만 지운다 */
  destroy(): void {
    this.done = true;
    this.teardown();
  }

  private build(): void {
    const t = this.text;
    const { colors, fonts } = this.opts.theme;
    const fontFamily = fonts.ui;
    const o = colors.overlay;
    const root = document.createElement('div');
    root.setAttribute('data-nickname-prompt', '');
    root.style.cssText = `position:fixed;inset:0;z-index:${STYLE.zIndex};background:rgba(${(o >> 16) & 0xff},${(o >> 8) & 0xff},${o & 0xff},0.72);touch-action:none;`;
    // 뒤 화면 버튼이 눌리지 않게 막는다. 막을 눌러도 닫히지 않는다 (실수로 이름 입력을 놓치지 않게)
    for (const type of BLOCKED_EVENTS) root.addEventListener(type, (e) => e.stopPropagation());

    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = [
      'position:absolute',
      'box-sizing:border-box',
      `background:${cssColor(colors.panel)}`,
      `border:solid ${cssColor(colors.edge)}`,
      `font-family:${fontFamily}`,
      `color:${cssColor(colors.ink)}`,
      'display:flex',
      'flex-direction:column',
      'align-items:stretch',
      'text-align:center',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = t.title;
    title.style.cssText = 'font-weight:700;word-break:keep-all;text-wrap:balance;';
    this.titleEl = title;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = STYLE.maxLength;
    input.placeholder = t.placeholder;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'done';
    input.setAttribute('aria-label', t.title);
    input.style.cssText = `box-sizing:border-box;width:100%;text-align:center;outline:none;font-family:inherit;color:${cssColor(colors.ink)};background:${cssColor(colors.background)};border:solid ${cssColor(colors.edge)};`;
    input.addEventListener('keydown', (e) => {
      if (shouldSubmitOnEnter(e)) {
        e.preventDefault();
        this.submit();
      } else if (shouldLaterOnEscape(e)) {
        e.preventDefault();
        this.later();
      }
    });

    const notice = document.createElement('div');
    notice.textContent = t.notice;
    notice.style.cssText = `color:${cssColor(colors.muted)};word-break:keep-all;text-wrap:balance;`;
    this.noticeEl = notice;

    const message = document.createElement('div');
    message.setAttribute('role', 'status');
    message.style.cssText =
      'display:flex;align-items:center;justify-content:center;text-wrap:balance;word-break:keep-all;';

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;';
    const confirm = this.makeButton(
      t.confirm,
      cssColor(colors.accent),
      cssColor(colors.accentText),
    );
    const later = this.makeButton(t.later, cssColor(colors.panel), cssColor(colors.ink));
    confirm.addEventListener('click', () => this.submit());
    later.addEventListener('click', () => this.later());
    buttons.append(confirm, later);

    panel.append(title, input, notice, message, buttons);
    root.append(panel);
    document.body.append(root);

    this.root = root;
    this.panel = panel;
    this.input = input;
    this.messageEl = message;
    this.confirmBtn = confirm;
    this.laterBtn = later;
  }

  private makeButton(label: string, bg: string, color: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = `flex:1;font-family:inherit;font-weight:700;color:${color};background:${bg};border:solid ${cssColor(this.opts.theme.colors.edge)};cursor:pointer;-webkit-tap-highlight-color:transparent;`;
    return b;
  }

  /** 캔버스가 화면에 그려진 자리·크기에 맞춰 창을 놓는다 */
  private readonly layout = (): void => {
    if (!this.root) return;
    const rect = this.opts.canvas.getBoundingClientRect();
    const k = rect.width / STYLE.designWidth;
    const px = (v: number): string => `${Math.round(v * k * 10) / 10}px`;
    const { panel: p, title, input, message, button } = STYLE;
    const ps = this.panel.style;
    ps.width = px(p.width);
    ps.left = `${rect.left + (rect.width - p.width * k) / 2}px`;
    ps.top = `${rect.top + rect.height * STYLE.top}px`;
    ps.padding = px(p.pad);
    ps.borderWidth = px(p.border);
    ps.borderRadius = px(p.radius);
    ps.gap = px(p.gap);
    const fit = (v: number): string => `${Math.max(STYLE.minInputPx, Math.round(v * k))}px`;
    this.titleEl.style.fontSize = px(title.fontSize);
    const is = this.input.style;
    is.fontSize = fit(input.fontSize);
    is.height = px(input.height);
    is.borderRadius = px(input.radius);
    is.borderWidth = px(input.border);
    this.noticeEl.style.fontSize = px(STYLE.notice.fontSize);
    this.noticeEl.style.marginTop = px(-p.gap / 2);
    const ms = this.messageEl.style;
    ms.fontSize = px(message.fontSize);
    ms.minHeight = px(message.height);
    for (const b of [this.confirmBtn, this.laterBtn]) {
      b.style.fontSize = px(button.fontSize);
      b.style.height = px(button.height);
      b.style.borderRadius = px(button.height / 2);
      b.style.borderWidth = px(input.border);
    }
    (this.confirmBtn.parentElement as HTMLElement).style.gap = px(button.gap);
  };

  private render(): void {
    const locked = isLocked(this.state);
    this.input.disabled = locked;
    this.confirmBtn.disabled = locked;
    this.laterBtn.disabled = locked;
    const m = this.state.message;
    this.messageEl.textContent = m ? m.text : '';
    this.messageEl.style.color =
      m?.kind === 'error'
        ? cssColor(this.opts.theme.colors.error)
        : cssColor(this.opts.theme.colors.ink);
    this.confirmBtn.style.opacity = locked ? '0.6' : '1';
    this.laterBtn.style.opacity = locked ? '0.6' : '1';
  }

  private submit(): void {
    if (this.done) return;
    const next = startSubmit(this.state);
    if (next === this.state) return;
    this.state = next;
    this.render();
    const name = this.input.value;
    void submitWithTimeout(() => this.opts.submit(name), this.timings.submitMs).then((result) => {
      if (this.done) return;
      this.state = applyResult(this.state, result, this.text, this.timings);
      this.render();
      if (this.state.phase === 'closing') this.scheduleClose();
      else this.input.focus({ preventScroll: true });
    });
  }

  private later(): void {
    if (this.done) return;
    const next = chooseLater(this.state, this.text, this.timings);
    if (next === this.state) return;
    this.state = next;
    this.render();
    this.scheduleClose();
  }

  private scheduleClose(): void {
    const { outcome, closeAfterMs } = this.state;
    if (!outcome) return;
    if (closeAfterMs <= 0) {
      this.finish(outcome);
      return;
    }
    this.closeTimer = window.setTimeout(() => this.finish(outcome), closeAfterMs);
  }

  private finish(outcome: PromptOutcome): void {
    if (this.done) return;
    this.done = true;
    this.teardown();
    this.opts.onClose(outcome);
  }

  private teardown(): void {
    window.clearTimeout(this.closeTimer);
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('orientationchange', this.layout);
    this.resizeObserver?.disconnect();
    this.root?.remove();
    this.root = null;
  }
}
