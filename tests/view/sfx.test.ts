import { describe, expect, it } from 'vitest';
import { SOUND } from '../../src/config';
import { sfxKey, sfxRate } from '../../src/view/Sfx';

/** public/audio에 실제로 있는 파일 (vite가 키만 만들고 읽지는 않는다) */
const audioFiles = new Set(
  Object.keys(import.meta.glob('../../public/audio/*.{ogg,m4a}')).map((path) =>
    path.slice(path.lastIndexOf('/') + 1),
  ),
);

describe('sfxRate (줄 제거 소리 음 높이)', () => {
  it('콤보 1은 원래 높이', () => {
    expect(sfxRate(1)).toBe(1);
  });

  it('콤보가 오를수록 재생 속도가 빨라져 음이 높아진다', () => {
    const rates = [1, 2, 3, 4, 5].map(sfxRate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]!);
  });

  it('상한에서 멈춘다', () => {
    const last = SOUND.clearRateByCombo[SOUND.clearRateByCombo.length - 1];
    expect(sfxRate(5)).toBe(last);
    expect(sfxRate(9)).toBe(last);
    expect(sfxRate(100)).toBe(last);
  });

  it('0 이하·유한하지 않은 값은 콤보 1로 본다', () => {
    expect(sfxRate(0)).toBe(1);
    expect(sfxRate(-3)).toBe(1);
    expect(sfxRate(NaN)).toBe(1);
  });
});

describe('SOUND', () => {
  it('볼륨은 0 초과 1 이하, 파일은 확장자 없는 이름, 키는 이름마다 다르다', () => {
    const entries = Object.entries(SOUND.effects);
    for (const [, { file, volume }] of entries) {
      expect(volume).toBeGreaterThan(0);
      expect(volume).toBeLessThanOrEqual(1);
      expect(file).toMatch(/^[a-zA-Z0-9]+$/);
    }
    const keys = entries.map(([name]) => sfxKey(name as keyof typeof SOUND.effects));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('효과음은 놓기·놓기 실패·줄 제거·전체 비우기·게임 오버·버튼·최고 기록·게임 오버 화면 여덟 개', () => {
    expect(Object.keys(SOUND.effects).sort()).toEqual(
      [
        'boardClear',
        'button',
        'clear',
        'gameOver',
        'gameOverShow',
        'newBest',
        'place',
        'return',
      ].sort(),
    );
  });

  it('형식은 ogg 먼저, iOS용 m4a 다음', () => {
    expect(SOUND.formats).toEqual(['ogg', 'm4a']);
  });

  it('효과음 파일이 형식마다 public/audio에 있다', () => {
    for (const { file } of Object.values(SOUND.effects)) {
      for (const ext of SOUND.formats) {
        expect(audioFiles.has(`${file}.${ext}`), `${file}.${ext}`).toBe(true);
      }
    }
  });

  it('음악 파일이 곡마다 형식마다 public/audio/music에 있고, 쓰지 않는 음악 파일은 없다', () => {
    const files = new Set(
      Object.keys(import.meta.glob('../../public/audio/music/*.{ogg,m4a}')).map((path) =>
        path.slice(path.lastIndexOf('/') + 1),
      ),
    );
    const expected = SOUND.music.tracks.flatMap((name) =>
      SOUND.formats.map((ext) => `${name}.${ext}`),
    );
    for (const file of expected) expect(files.has(file), file).toBe(true);
    expect([...files].sort()).toEqual([...expected].sort());
  });
});
