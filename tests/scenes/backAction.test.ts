import { describe, expect, it } from 'vitest';
import { backAction } from '../../src/scenes/backAction';

describe('backAction (Android 뒤로 가기)', () => {
  it('게임 중 → 일시정지', () => {
    expect(backAction(['Game'])).toBe('pause');
  });

  it('일시정지 화면 → [계속] (Game은 멈춰 있어 키에 없다)', () => {
    expect(backAction(['Pause'])).toBe('resume');
  });

  it('게임 오버 화면 → 메뉴 (Game도 같이 돈다)', () => {
    expect(backAction(['Game', 'GameOver'])).toBe('menu');
    expect(backAction(['GameOver'])).toBe('menu');
  });

  it('랭킹 → 메뉴, 메뉴 → 앱 종료', () => {
    expect(backAction(['Ranking'])).toBe('menu');
    expect(backAction(['Menu'])).toBe('exit');
  });

  it('불러오는 중(Boot)이나 아무 씬도 없으면 아무 일도 없다', () => {
    expect(backAction(['Boot'])).toBe('none');
    expect(backAction([])).toBe('none');
  });

  it('창(테마 카드·닉네임)이 떠 있으면 창만 닫는다', () => {
    expect(backAction(['Menu'], { overlayOpen: true })).toBe('close-overlay');
    expect(backAction(['Ranking'], { overlayOpen: true })).toBe('close-overlay');
    expect(backAction(['Game', 'GameOver'], { overlayOpen: true })).toBe('close-overlay');
  });

  it('창 표시가 있어도 창을 가질 수 없는 화면(게임·일시정지)에서는 무시한다', () => {
    expect(backAction(['Game'], { overlayOpen: true })).toBe('pause');
    expect(backAction(['Pause'], { overlayOpen: true })).toBe('resume');
  });

  it('새 판을 준비하는 중에는 아무 화면에서도 아무 일도 없다 (버튼 잠금과 같다)', () => {
    for (const keys of [['Menu'], ['Pause'], ['Game', 'GameOver'], ['Ranking']]) {
      expect(backAction(keys, { preparing: true })).toBe('none');
    }
  });

  it('준비 중이어도 떠 있는 창은 닫을 수 있다', () => {
    expect(backAction(['Game', 'GameOver'], { overlayOpen: true, preparing: true })).toBe(
      'close-overlay',
    );
  });
});
