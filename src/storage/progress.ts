// 진행 데이터: 최고 점수와 설정 (PLAN 6.2). 순수 규칙만 있다. pang `parseSave`처럼 깨진 필드는 그 부분만 기본값으로 채운다.

import { DEFAULT_THEME, parseThemeId, type ThemeId } from '../themeIds';

export interface Settings {
  /** 효과음 끔 */
  muted: boolean;
  /** 배경 음악 켬 (음악은 W4-01, 값만 저장해 둔다) */
  music: boolean;
  /** 고른 테마 (W4-05). 없거나 모르는 값이면 기본 테마 */
  theme: ThemeId;
}

export interface SaveData {
  version: 1;
  /** 0 이상 정수 */
  bestScore: number;
  settings: Settings;
}

/** 호출할 때마다 새 객체 */
export function defaultSave(): SaveData {
  return {
    version: 1,
    bestScore: 0,
    settings: { muted: false, music: true, theme: DEFAULT_THEME },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 없음·깨진 JSON·객체가 아님·`version`이 1이 아님 → 기본값 (예외 없음).
 * 최고 점수는 0 이상의 안전한 정수만 받고(소수·문자열·Infinity는 0), 설정은 진짜 불리언만 받는다(테마는 알려진 ID만, 아니면 기본 테마).
 */
export function parseSave(json: string | null): SaveData {
  const save = defaultSave();
  if (typeof json !== 'string') return save;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return save;
  }
  if (!isRecord(raw) || raw.version !== 1) return save;
  const { bestScore, settings } = raw;
  if (typeof bestScore === 'number' && Number.isSafeInteger(bestScore) && bestScore >= 0) {
    save.bestScore = bestScore;
  }
  if (isRecord(settings)) {
    if (typeof settings.muted === 'boolean') save.settings.muted = settings.muted;
    if (typeof settings.music === 'boolean') save.settings.music = settings.music;
    save.settings.theme = parseThemeId(settings.theme);
  }
  return save;
}
