// 고정 로그 fixture (W2-02). replay 테스트와 서버 판정 테스트(W3-03)가 같이 쓴다.
// ── 고정 로그 fixture ─────────────────────────────────────────────────────────────
// 이 테스트가 실패하면 규칙(조각·가중치·점수·추첨 순서)이 바뀐 것이다.
// 의도한 변경이면 RULES_VERSION을 올릴지 검토하고 기대값을 갱신한다.
// seed와 배치 로그, 기대 상태는 전부 리터럴이다. 엔진을 거치지 않고 손으로 적은 값이라
// (점수는 아래 주석처럼 손으로 다시 계산했다) 엔진과 replay가 같이 틀려도 잡힌다.
// 로그는 [trayIndex, row, col]이고 무작위 봇이 찾은 것을 고정한 것이다.
// 보드는 색 그룹 숫자(. = 빈 칸)로 적는다.
// RULES_VERSION 2(L·J 4칸 조각 8종 추가)에서 추첨표가 바뀌어 seed·로그를 다시 찾았다 (같은 경로: 보드 비움·콤보 배율·유예·끊김·재생성 2회·게임 오버).

export type Row = [trayIndex: number, row: number, col: number];

export interface Fixture {
  name: string;
  seed: number;
  log: Row[];
  /** 배치마다 score 이벤트의 delta / lines / 갱신된 combo */
  deltas: number[];
  lines: number[];
  combos: number[];
  /** tray(새 트레이)·boardClear·gameOver 이벤트가 나온 배치 index */
  trayAt: number[];
  boardClearAt: number[];
  gameOverAt: number[];
  final: {
    score: number;
    combo: number;
    missStreak: number;
    over: boolean;
    rngState: number;
    tray: (string | null)[];
    board: string;
  };
}

export const FIXTURES: Fixture[] = [
  {
    // 점수 손 계산 (칸 수 + floor(줄 점수 × 배율) + 보드 비움 3000, 배율 = 1 + 0.5 × (combo - 1)):
    //  0: i3h 3칸, 줄 없음                                   → 3        (3)
    //  1: i5h 5칸, 줄 완성, combo 1(배율 1), 보드가 빔         → 5 + 100 + 3000 = 3105 (3108)
    //  2: r2x3 6칸, 못 지움 1번째(유예), 트레이 3개 다 놓아 재생성 → 6   (3114)
    //  3: i3h 3칸, 못 지움 2번째(유예, combo 1 유지)           → 3        (3117)
    //  4: j4c 4칸, 줄 완성, combo 2(배율 1.5)                  → 4 + floor(100 × 1.5) = 154 (3271)
    //  5: l3d 3칸, 못 지움 1번째, 두 번째 재생성               → 3        (3274)
    //  6: l3a 3칸, 못 지움 2번째                              → 3        (3277)
    //  7: j4d 4칸, 못 지움 3번째 > 유예 2 → combo 0으로 끊김    → 4        (3281)
    name: '보드 비움 + 콤보 2(배율) + 유예 + 끊김 + 트레이 재생성 2회 (seed 68, 8배치)',
    seed: 68,
    log: [
      [2, 7, 5],
      [1, 7, 0],
      [0, 4, 5],
      [1, 5, 0],
      [0, 5, 3],
      [2, 6, 1],
      [0, 2, 3],
      [1, 5, 3],
    ],
    deltas: [3, 3105, 6, 3, 154, 3, 3, 4],
    lines: [0, 1, 0, 0, 1, 0, 0, 0],
    combos: [0, 1, 1, 1, 2, 2, 2, 0],
    trayAt: [2, 5],
    boardClearAt: [1],
    gameOverAt: [],
    final: {
      score: 3281,
      combo: 0,
      missStreak: 0,
      over: false,
      rngState: -695776799,
      tray: [null, null, 'sh'],
      board: [
        '........',
        '........',
        '...3....',
        '...33...',
        '.....222',
        '...333..',
        '.333.3..',
        '..33....',
      ].join('\n'),
    },
  },
  {
    // 점수 손 계산:
    //  0: l3a 3칸, 못 지움 1번째                              → 3        (3)
    //  1: j4d 4칸, 못 지움 2번째                              → 4        (7)
    //  2: l5b 5칸, 못 지움 3번째 → combo는 원래 0이라 그대로, 재생성 → 5   (12)
    //  3: o2 4칸, 못 지움 1번째                               → 4        (16)
    //  4: l3b 3칸, 줄 완성, combo 1(배율 1)                    → 3 + 100 = 103 (119)
    //  5: sv 4칸, 못 지움 1번째(유예), 두 번째 재생성           → 4        (123)
    //  6: tl 4칸, 못 지움 2번째(유예)                          → 4        (127)
    //  7: l3d 3칸, 줄 완성, combo 2(배율 1.5), 남은 조각 o3이 놓일 곳이 없어 게임 오버 → 3 + 150 = 153 (280)
    name: '콤보 2(배율) + 유예 + 트레이 재생성 2회 + 게임 오버 (seed 67, 8배치)',
    seed: 67,
    log: [
      [1, 1, 5],
      [0, 3, 2],
      [2, 0, 1],
      [1, 6, 3],
      [0, 4, 2],
      [2, 3, 0],
      [2, 0, 3],
      [0, 5, 4],
    ],
    deltas: [3, 4, 5, 4, 103, 4, 4, 153],
    lines: [0, 0, 0, 0, 1, 0, 0, 1],
    combos: [0, 0, 0, 0, 1, 1, 1, 2],
    trayAt: [2, 5],
    boardClearAt: [],
    gameOverAt: [7],
    final: {
      score: 280,
      combo: 2,
      missStreak: 0,
      over: true,
      rngState: -695776800,
      tray: [null, 'o3', null],
      board: [
        '........',
        '...5.3..',
        '.44..33.',
        '6.3.....',
        '66......',
        '.63..3..',
        '.....3..',
        '........',
      ].join('\n'),
    },
  },
];
