// 화면 → 배경 음악, 곡 전환, 페이드, 멈춤 이유 (W4-01, PLAN 6.4). Phaser 없는 순수 함수. ddooby-pang의 musicRules·Music에서 가져와 맞췄다.

import { SOUND } from '../config';
import { parseThemeId, type ThemeId } from '../themeIds';

export type TrackName = (typeof SOUND.music.tracks)[number];

export type MusicScene = 'Menu' | 'Ranking' | 'Game';

/** 테마의 게임 곡. 모르는 테마 값은 기본 테마의 곡 */
export function gameTrack(theme: ThemeId | string | undefined): TrackName {
  return SOUND.music.gameTracks[parseThemeId(theme)];
}

/** 메뉴·랭킹은 테마와 상관없이 같은 곡(이어서), 게임은 그 판의 테마 곡 */
export function musicFor(scene: MusicScene, theme?: ThemeId | string): TrackName {
  return scene === 'Game' ? gameTrack(theme) : SOUND.music.menuTrack;
}

export type MusicTransition = 'keep' | 'switch' | 'stop' | 'none';

/** 지금 곡 → 틀 곡. 같은 곡이면 이어서(keep), 없음 → 없음이면 아무것도 안 한다 */
export function musicTransition(
  current: TrackName | null,
  next: TrackName | null,
): MusicTransition {
  if (current === next) return current === null ? 'none' : 'keep';
  return next === null ? 'stop' : 'switch';
}

/** 볼륨이 from에서 to로 ms에 걸쳐 가는 중 */
export interface Fade {
  from: number;
  to: number;
  elapsed: number;
  ms: number;
}

export function startFade(from: number, to: number, ms: number): Fade {
  return { from, to, elapsed: 0, ms: Math.max(1, ms) };
}

/** delta(ms)만큼 진행한다. 새 상태와 지금 볼륨, 끝났는지를 돌려준다 (입력은 바꾸지 않는다) */
export function stepFade(fade: Fade, delta: number): { fade: Fade; volume: number; done: boolean } {
  const elapsed = fade.elapsed + Math.max(0, delta);
  const t = Math.min(1, elapsed / fade.ms);
  return {
    fade: { ...fade, elapsed },
    volume: fade.from + (fade.to - fade.from) * t,
    done: t >= 1,
  };
}

/** 곡을 멈추는 이유. 하나라도 있으면 곡은 멈춰 있고, 모두 사라지면 이어서 나온다 */
export type MusicHold = 'pause' | 'hidden';

/** 멈춤 이유의 집합. 불변 */
export type MusicHolds = ReadonlySet<MusicHold>;

export function withHold(holds: MusicHolds, hold: MusicHold, on: boolean): MusicHolds {
  if (holds.has(hold) === on) return holds;
  const next = new Set(holds);
  if (on) next.add(hold);
  else next.delete(hold);
  return next;
}

/** 멈춰 있어야 하나 */
export function isHeld(holds: MusicHolds): boolean {
  return holds.size > 0;
}

/**
 * 음악 설정 값. 기록이 없거나 불리언이 아니면 켠 것(true)으로 본다 (muteSetting.ts의 readMuted와 반대 기본값).
 */
const KEY = 'music';

export interface MusicStore {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

export function readMusic(store: MusicStore): boolean {
  return store.get(KEY) !== false;
}

/** Music에서 쓰는 부분 */
export interface MusicOutput {
  setEnabled(on: boolean): void;
}

/**
 * 음악을 켜고 끈다: registry 값과 실제 재생을 같이 바꾸고, persist가 있으면 영구 저장도 요청한다. 음악 버튼은 이것만 부른다.
 * 효과음 음소거(muted)와는 서로 영향이 없다.
 */
export function setMusicOn(
  store: MusicStore,
  output: MusicOutput,
  on: boolean,
  persist?: (on: boolean) => void,
): void {
  store.set(KEY, on);
  output.setEnabled(on);
  persist?.(on);
}

/**
 * Boot가 저장소에서 읽은 값을 반영한다. 사용자가 이미 바꿨으면(registry에 값이 있음) 덮지 않는다 (읽기가 늦어도 바꾼 값을 되돌리지 않게).
 */
export function applyLoadedMusic(store: MusicStore, output: MusicOutput, saved: boolean): void {
  if (store.get(KEY) === undefined) store.set(KEY, saved);
  output.setEnabled(readMusic(store));
}
