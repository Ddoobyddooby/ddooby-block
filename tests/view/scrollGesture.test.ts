import { describe, expect, it } from 'vitest';
import { clampScroll, isDrag, maxScroll, ScrollGesture } from '../../src/view/scrollGesture';

describe('maxScroll·clampScroll', () => {
  it('내용이 목록보다 짧거나 같으면 0 (스크롤 없음)', () => {
    expect(maxScroll(300, 500)).toBe(0);
    expect(maxScroll(500, 500)).toBe(0);
    expect(clampScroll(40, 300, 500)).toBe(0);
  });
  it('내용이 길면 0~(내용-목록)으로 자른다: 음수·끝 초과', () => {
    expect(maxScroll(900, 500)).toBe(400);
    expect(clampScroll(-30, 900, 500)).toBe(0);
    expect(clampScroll(250, 900, 500)).toBe(250);
    expect(clampScroll(400, 900, 500)).toBe(400);
    expect(clampScroll(401, 900, 500)).toBe(400);
  });
  it('resize로 목록이 작아져도 안전: 늘어난 최대치 안으로 다시 자른다', () => {
    expect(clampScroll(400, 900, 500)).toBe(400);
    expect(clampScroll(400, 900, 800)).toBe(100);
  });
  it('NaN·Infinity는 0으로 본다', () => {
    expect(clampScroll(Number.NaN, 900, 500)).toBe(0);
    expect(clampScroll(Number.POSITIVE_INFINITY, 900, 500)).toBe(0);
  });
});

describe('isDrag', () => {
  it('문턱을 넘어야 끌기', () => {
    expect(isDrag(0, 12, 12)).toBe(false);
    expect(isDrag(0, 12.01, 12)).toBe(true);
    expect(isDrag(9, 9, 12)).toBe(true);
  });
});

describe('ScrollGesture: 처음 누른 손가락 하나만 따른다', () => {
  it('문턱 전에는 null, 넘으면 시작 스크롤에서 손가락 이동만큼 (올리면 아래 줄이 올라온다)', () => {
    const g = new ScrollGesture(12);
    g.down(1, 100, 500, 80, true);
    expect(g.move(1, 100, 495)).toBeNull();
    expect(g.dragged).toBe(false);
    expect(g.move(1, 100, 400)).toBe(180); // 80 - (400 - 500)
    expect(g.dragged).toBe(true);
    expect(g.move(1, 100, 520)).toBe(60); // 문턱을 한 번 넘으면 계속 따른다
  });

  it('두 번째 손가락은 시작점·잠금을 가로채지 못한다', () => {
    const g = new ScrollGesture(12);
    g.down(1, 0, 500, 0, true);
    g.down(2, 0, 100, 999, true); // 무시
    expect(g.move(2, 0, 0)).toBeNull();
    expect(g.move(1, 0, 450)).toBe(50);
    g.up(2); // 따르지 않는 손가락이 떼어져도 끝나지 않는다
    expect(g.move(1, 0, 400)).toBe(100);
  });

  it('목록 밖에서 시작한 누름은 따르지 않는다', () => {
    const g = new ScrollGesture(12);
    g.down(1, 0, 900, 0, false);
    expect(g.move(1, 0, 700)).toBeNull();
    // 목록 밖 누름이 다음 목록 안 누름을 막지도 않는다
    g.down(2, 0, 300, 10, true);
    expect(g.move(2, 0, 250)).toBe(60);
  });

  it('손가락이 떼어지면 끝나고 다음 끌기가 정상으로 시작된다', () => {
    const g = new ScrollGesture(12);
    g.down(1, 0, 500, 0, true);
    g.move(1, 0, 400);
    g.up(1);
    expect(g.move(1, 0, 300)).toBeNull();
    g.down(3, 0, 500, 70, true);
    expect(g.move(3, 0, 480)).toBe(90);
  });

  it('취소(화면 밖에서 떼어짐·blur·hidden): 추적을 끝내고 다음 끌기는 정상', () => {
    const g = new ScrollGesture(12);
    g.down(1, 0, 500, 0, true);
    g.move(1, 0, 300);
    g.cancel();
    expect(g.dragged).toBe(false);
    expect(g.move(1, 0, 200)).toBeNull();
    g.down(1, 0, 400, 5, true);
    expect(g.move(1, 0, 380)).toBe(25);
  });
});
