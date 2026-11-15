import { describe, expect, it } from 'vitest';
import {
  buildGameOverData,
  gameOverButtons,
  gameOverTexts,
  parseOverParam,
} from '../../src/scenes/gameOverRules';

describe('gameOverButtons', () => {
  it('[다시 하기] [메뉴] 순서', () => {
    expect(gameOverButtons()).toEqual(['retry', 'menu']);
  });
});

describe('buildGameOverData (최고 기록 갱신 판정)', () => {
  it('새 판: 시작 전 최고 점수보다 크면 갱신. 화면용 최고 점수는 판 도중 이미 올라 이번 점수와 같다', () => {
    expect(
      buildGameOverData({ score: 900, startBest: 500, currentBest: 900, replayable: true }),
    ).toEqual({ score: 900, best: 900, newBest: true });
  });

  it('새 판: 못 넘으면 갱신 아님, 최고 점수는 그대로', () => {
    expect(
      buildGameOverData({ score: 300, startBest: 500, currentBest: 500, replayable: true }),
    ).toEqual({ score: 300, best: 500, newBest: false });
  });

  it('같은 점수는 갱신이 아니다', () => {
    expect(
      buildGameOverData({ score: 500, startBest: 500, currentBest: 500, replayable: true }),
    ).toEqual({ score: 500, best: 500, newBest: false });
  });

  it('처음 하는 판(최고 점수 0): 점수가 있으면 갱신, 0점이면 아님', () => {
    expect(
      buildGameOverData({ score: 10, startBest: 0, currentBest: 10, replayable: true }).newBest,
    ).toBe(true);
    expect(
      buildGameOverData({ score: 0, startBest: 0, currentBest: 0, replayable: true }).newBest,
    ).toBe(false);
  });

  it('이어한 판: 기준은 저장돼 있던 최고 점수. 이어하기 전 점수(800)가 그보다 높았어도 최종 900이 500을 넘으면 갱신', () => {
    expect(
      buildGameOverData({ score: 900, startBest: 500, currentBest: 900, replayable: true }),
    ).toEqual({ score: 900, best: 900, newBest: true });
  });

  it('currentBest가 이번 점수보다 작아도 화면 최고 점수는 이번 점수 이상', () => {
    expect(
      buildGameOverData({ score: 900, startBest: 500, currentBest: 700, replayable: true }).best,
    ).toBe(900);
  });

  it('?fill= 판: 갱신 없음, 최고 점수는 저장된 값 그대로 (점수가 더 커도)', () => {
    expect(
      buildGameOverData({ score: 5000, startBest: 100, currentBest: 100, replayable: false }),
    ).toEqual({ score: 5000, best: 100, newBest: false });
  });
});

describe('gameOverTexts', () => {
  it('점수는 세 자리마다 쉼표, 최고 기록 문구는 갱신일 때만', () => {
    expect(gameOverTexts({ score: 12840, best: 12840, newBest: true })).toEqual({
      title: '게임 오버',
      scoreLabel: '이번 점수',
      score: '12,840',
      best: '최고 12,840점',
      newBest: '최고 기록 갱신!',
    });
    expect(gameOverTexts({ score: 0, best: 1000000, newBest: false })).toMatchObject({
      score: '0',
      best: '최고 1,000,000점',
      newBest: null,
    });
  });
});

describe('parseOverParam', () => {
  it('DEV에서 ?over·?over=new는 최고 기록을 넘은 예시', () => {
    const expected = { score: 12840, best: 12840, newBest: true };
    expect(parseOverParam('?over', true)).toEqual(expected);
    expect(parseOverParam('?over=new', true)).toEqual(expected);
    expect(parseOverParam('?seed=3&over', true)).toEqual(expected);
  });

  it('DEV에서 ?over=low는 못 넘은 예시', () => {
    expect(parseOverParam('?over=low', true)).toEqual({ score: 4200, best: 12840, newBest: false });
  });

  it('그 밖의 값·옵션 없음은 null', () => {
    for (const search of ['', '?over=1', '?over=LOW', '?overs', '?seed=1']) {
      expect(parseOverParam(search, true), search).toBeNull();
    }
  });

  it('프로덕션(dev=false)에서는 무시한다', () => {
    for (const search of ['?over', '?over=new', '?over=low']) {
      expect(parseOverParam(search, false), search).toBeNull();
    }
  });
});
