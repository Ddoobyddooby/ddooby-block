// 규칙 지문 (W3-03): 게임 규칙이 바뀌었는데 RULES_VERSION이 그대로인 실수를 잡는다.
// 입력은 두 가지다: (1) 규칙에 영향을 주는 config 값(BOARD·TRAY·GENERATOR·PIECE_WEIGHTS·SCORE·COMBO·REPLAY)과 조각 정의,
// (2) 정해진 seed의 봇 판을 처음부터 끝까지 돌린 최종 상태 (엔진·점수·콤보·RNG 추첨 순서·생성 보정이 모두 반영된다).
// 화면 수치(VIEW·FX·ANIM·SOUND·SAVE 등)는 넣지 않는다: 바꿔도 RULES_VERSION과 무관하다 (config.ts 머리말).
import { createHash } from 'node:crypto';
import { BOARD, COMBO, GENERATOR, PIECE_WEIGHTS, REPLAY, SCORE, TRAY } from '../../src/config';
import { PIECES } from '../../src/core/pieces';
import { playBot } from './randomBot';
import { playGreedy } from './bot';

export function rulesFingerprint(): string {
  const config = { BOARD, TRAY, GENERATOR, PIECE_WEIGHTS, SCORE, COMBO, REPLAY };
  const bots = Array.from({ length: 40 }, (_, i) => {
    const g = playBot(i + 1);
    return { seed: g.seed, log: g.log, state: g.state };
  });
  const greedy = Array.from({ length: 12 }, (_, i) => {
    const g = playGreedy(i + 1, 60);
    return {
      seed: g.seed,
      log: g.placements.map(({ trayIndex, row, col }) => [trayIndex, row, col]),
      state: g.state,
    };
  });
  const text = JSON.stringify({ config, pieces: PIECES, bots, greedy });
  return createHash('sha256').update(text).digest('hex');
}
