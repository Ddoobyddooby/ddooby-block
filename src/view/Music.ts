// 배경 음악 (W4-01, PLAN 6.4). 게임 하나에 하나(Music.of(game))라 씬이 바뀌어도 곡이 이어진다.
// 씬은 이름만 부른다: music.play('menu'). 같은 곡이면 다시 시작하지 않고, 다른 곡이면 페이드로 서로 넘어간다.
// 페이드는 씬 트윈 대신 게임 step에서 직접 계산한다 (곡을 바꾸는 도중 씬이 끝나도 끊기지 않게).
// 효과음(Sfx)·음소거(muted)와 따로 켜고 끈다. 파일이 없거나 로드에 실패했거나 브라우저가 아직 소리를 막고 있어도 조용히 넘어간다:
// 브라우저가 막고 있으면 Phaser가 첫 터치 때까지 재생을 미뤘다가 시작한다.
// 일시정지·앱 숨김 때는 곡을 멈추고 돌아오면 이어서 낸다 (musicRules.ts의 MusicHold).
// ddooby-pang의 Music.ts에서 복사해 맞췄다. 바뀐 점: 볼륨 낮추기(duck) 대신 멈춤(hold), 곡 이름·크기는 SOUND.music.

import type Phaser from 'phaser';
import { SOUND } from '../config';
import {
  isHeld,
  musicTransition,
  startFade,
  stepFade,
  withHold,
  type Fade,
  type MusicHold,
  type MusicHolds,
  type TrackName,
} from '../scenes/musicRules';

export const musicKey = (name: TrackName): string => `music-${name}`;
/** [ogg, m4a] 순서. 브라우저가 재생할 수 있는 첫 형식을 고른다 (SOUND.formats) */
export const musicUrls = (name: TrackName): string[] =>
  SOUND.formats.map((ext) => `audio/music/${name}.${ext}`);

/** volume을 바꿀 수 있는 소리 (WebAudio / HTML5 Audio) */
type LoopSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

interface Entry {
  sound: LoopSound;
  fade: Fade | null;
  /** 다 줄이면 멈추고 버린다 */
  stopAtEnd: boolean;
}

export class Music {
  private static readonly byGame = new WeakMap<Phaser.Game, Music>();

  static of(game: Phaser.Game): Music {
    let music = Music.byGame.get(game);
    if (!music) {
      music = new Music(game);
      Music.byGame.set(game, music);
    }
    return music;
  }

  private enabled = true;
  private holds: MusicHolds = new Set();
  /** 씬이 원하는 곡 (꺼져 있거나 아직 안 읽혔어도 기억한다) */
  private desired: TrackName | null = null;
  private current: { name: TrackName; entry: Entry } | null = null;
  /** 줄어들며 끝나는 중인 곡들 */
  private readonly leaving = new Set<Entry>();
  /** 뒤에서 읽는 중인 곡 */
  private readonly loading = new Set<TrackName>();

  private constructor(private readonly game: Phaser.Game) {
    game.events.on('step', (_time: number, delta: number) => this.step(delta));
    // 탭이 숨겨지면(visibilitychange) 멈추고 돌아오면 이어서 (Phaser가 이 이벤트를 Core.Events의 HIDDEN·VISIBLE, 곧 'hidden'·'visible'로 알린다)
    game.events.on('hidden', () => this.hold('hidden', true));
    game.events.on('visible', () => this.hold('hidden', false));
    if (typeof document !== 'undefined' && document.hidden)
      this.holds = withHold(this.holds, 'hidden', true);
    // DEV: 브라우저 콘솔에서 window.__music.state()로 지금 곡·볼륨 확인
    if (import.meta.env.DEV && typeof window !== 'undefined')
      (window as unknown as { __music?: unknown }).__music = this;
  }

  /** DEV 확인용 */
  state(): {
    desired: TrackName | null;
    current: TrackName | null;
    volume: number;
    enabled: boolean;
    held: MusicHold[];
    playing: boolean;
  } {
    const sound = this.current?.entry.sound;
    return {
      desired: this.desired,
      current: this.current?.name ?? null,
      volume: Math.round((sound?.volume ?? 0) * 100) / 100,
      enabled: this.enabled,
      held: [...this.holds],
      playing: sound?.isPlaying ?? false,
    };
  }

  /**
   * 씬이 원하는 곡. 새 화면이 곡을 정하는 것이므로 일시정지로 멈춘 상태는 풀린다 (메뉴·다시 하기가 이어서 나온다).
   * 앱 숨김으로 멈춘 상태는 그대로다.
   */
  play(name: TrackName | null, fadeMs: number = SOUND.music.fadeMs): void {
    this.desired = name;
    this.holds = withHold(this.holds, 'pause', false);
    this.apply(fadeMs);
  }

  /** 일시정지 중에는 멈췄다가 [계속]에서 이어서 낸다. 앱 숨김도 같다 */
  hold(hold: MusicHold, on: boolean): void {
    const next = withHold(this.holds, hold, on);
    if (next === this.holds) return;
    this.holds = next;
    this.syncHeld();
  }

  /**
   * 음악 버튼·저장값. 다시 켜면 지금 화면의 곡부터 나온다.
   * 일시정지 화면에서 사용자가 직접 켠 것이므로 일시정지로 멈춘 상태도 푼다 (눌렀는데 소리가 안 나지 않게)
   */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.holds = withHold(this.holds, 'pause', false);
    this.apply(SOUND.music.quickFadeMs);
  }

  /** 캐시에 없는 곡을 이 씬의 로더로 뒤에서 읽는다. 다 읽은 곡이 지금 원하는 곡이면 바로 튼다 */
  load(scene: Phaser.Scene, names: readonly TrackName[]): void {
    const todo = names.filter(
      (n) => !this.game.cache.audio.exists(musicKey(n)) && !this.loading.has(n),
    );
    if (todo.length === 0) return;
    for (const name of todo) {
      this.loading.add(name);
      scene.load.audio(musicKey(name), musicUrls(name));
      scene.load.once(`filecomplete-audio-${musicKey(name)}`, () => {
        this.loading.delete(name);
        if (this.desired === name) this.apply(SOUND.music.fadeMs);
      });
    }
    // 다 읽기 전에 씬이 끝나면 로더가 멈춘다. 다음 씬이 다시 부를 수 있게 표시를 지운다 (파일이 없어 실패해도 같다)
    const forget = (): void => todo.forEach((n) => this.loading.delete(n));
    scene.load.once('complete', forget);
    scene.events.once('shutdown', forget);
    scene.load.start();
  }

  private apply(fadeMs: number): void {
    const target = this.enabled ? this.desired : null;
    const change = musicTransition(this.current?.name ?? null, target);
    if (change === 'none') return;
    if (change === 'keep') {
      this.syncHeld();
      return;
    }
    if (this.current) {
      this.fadeOut(this.current.entry, fadeMs);
      this.current = null;
    }
    if (change === 'switch' && target && this.game.cache.audio.exists(musicKey(target))) {
      try {
        const sound = this.game.sound.add(musicKey(target), { loop: true, volume: 0 }) as LoopSound;
        const entry: Entry = {
          sound,
          fade: startFade(0, SOUND.music.volume, fadeMs),
          stopAtEnd: false,
        };
        this.current = { name: target, entry };
        // 브라우저가 소리를 막고 있으면 play()가 false를 돌려주고 Phaser가 첫 터치 때 시작한다 (실패가 아니다)
        sound.play();
        if (isHeld(this.holds)) sound.pause();
      } catch (error) {
        // 소리가 안 나도 게임은 계속된다
        this.current = null;
        if (import.meta.env.DEV) console.warn('[music] 재생 실패', target, error);
      }
    }
  }

  /** 멈춤 이유가 생기거나 사라졌을 때 지금 곡을 멈추거나 이어서 낸다 */
  private syncHeld(): void {
    const sound = this.current?.entry.sound;
    if (!sound) return;
    try {
      if (isHeld(this.holds)) {
        if (sound.isPlaying) sound.pause();
      } else if (sound.isPaused) {
        sound.resume();
      }
    } catch {
      // 파괴된 소리: 다음 apply가 새로 만든다
      this.current = null;
    }
  }

  private fadeOut(entry: Entry, ms: number): void {
    entry.fade = startFade(entry.sound.volume, 0, ms);
    entry.stopAtEnd = true;
    this.leaving.add(entry);
  }

  private step(delta: number): void {
    if (this.current) this.advance(this.current.entry, delta);
    for (const entry of [...this.leaving]) this.advance(entry, delta);
  }

  private advance(entry: Entry, delta: number): void {
    if (entry.fade === null) return;
    // 멈춰 있는 동안에는 페이드도 멈춘다 (이어서 낼 때 처음부터 다시 올라가지 않게)
    if (isHeld(this.holds) && !entry.stopAtEnd) return;
    try {
      const next = stepFade(entry.fade, delta);
      entry.sound.setVolume(next.volume);
      entry.fade = next.done ? null : next.fade;
      if (next.done && entry.stopAtEnd) {
        this.leaving.delete(entry);
        entry.sound.stop();
        entry.sound.destroy();
      }
    } catch {
      this.leaving.delete(entry);
      entry.fade = null;
    }
  }
}
