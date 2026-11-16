// 고정 로그 fixture (W2-02). replay 테스트와 서버 판정 테스트(W3-03)가 같이 쓴다.
// ── 고정 로그 fixture ─────────────────────────────────────────────────────────────
// 이 테스트가 실패하면 규칙(조각·가중치·점수·추첨 순서)이 바뀐 것이다.
// 의도한 변경이면 RULES_VERSION을 올릴지 검토하고 기대값을 갱신한다.
// seed와 배치 로그, 기대 상태는 전부 리터럴이다. 엔진을 거치지 않고 손으로 적은 값이라
// (점수는 아래 주석처럼 손으로 다시 계산했다) 엔진과 replay가 같이 틀려도 잡힌다.
// 로그는 [trayIndex, row, col]이고 무작위 봇이 찾은 것을 고정한 것이다.
// 보드는 색 그룹 숫자(. = 빈 칸)로 적는다.

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
    //  0: i3v 3칸, 줄 없음                                   → 3        (3)
    //  1: i5v 5칸, 7번 열 완성, combo 1(배율 1), 보드가 빔     → 5 + 100 + 3000 = 3105 (3108)
    //  2: tu 4칸, 못 지움 1번째(유예), 트레이 3개 다 놓아 재생성 → 4        (3112)
    //  3: r3x2 6칸, 못 지움 2번째(유예, combo 1 유지)          → 6        (3118)
    //  4: r3x2 6칸, 3번 열 완성, combo 2(배율 1.5)             → 6 + floor(100 × 1.5) = 156 (3274)
    //  5: i2v 2칸, 못 지움 1번째, 두 번째 재생성               → 2        (3276)
    //  6: tr 4칸, 못 지움 2번째                               → 4        (3280)
    //  7: i2h 2칸, 못 지움 3번째 > 유예 2 → combo 0으로 끊김    → 2        (3282)
    name: '보드 비움 + 콤보 2(배율) + 유예 + 끊김 + 트레이 재생성 2회 (seed 579, 8배치)',
    seed: 579,
    log: [
      [0, 0, 7],
      [1, 3, 7],
      [2, 3, 2],
      [0, 5, 2],
      [1, 0, 3],
      [2, 3, 0],
      [0, 1, 5],
      [2, 6, 6],
    ],
    deltas: [3, 3105, 4, 6, 156, 2, 4, 2],
    lines: [0, 1, 0, 0, 1, 0, 0, 0],
    combos: [0, 1, 1, 1, 2, 2, 2, 0],
    trayAt: [2, 5],
    boardClearAt: [1],
    gameOverAt: [],
    final: {
      score: 3282,
      combo: 0,
      missStreak: 0,
      over: false,
      rngState: -695776288,
      tray: [null, 'sh', null],
      board: [
        '....2...',
        '....25..',
        '....255.',
        '1....5..',
        '1.5.5...',
        '..2.....',
        '..2...11',
        '..2.....',
      ].join('\n'),
    },
  },
  {
    // 점수 손 계산:
    //  0: i2h 2칸, 못 지움 1번째                              → 2        (2)
    //  1: r2x3 6칸, 못 지움 2번째                             → 6        (8)
    //  2: o3 9칸, 못 지움 3번째 → combo는 원래 0이라 그대로, 재생성 → 9   (17)
    //  3: l3a 3칸, 5번 줄 완성, combo 1(배율 1)                → 3 + 100 = 103 (120)
    //  4: i3h 3칸, 못 지움 1번째                              → 3        (123)
    //  5: o3 9칸, 못 지움 2번째(유예), 두 번째 재생성           → 9        (132)
    //  6: l5a 5칸, 1번 열 완성, combo 2(배율 1.5)              → 5 + floor(100 × 1.5) = 155 (287)
    //  7: r3x2 6칸, 못 지움 1번째, 남은 조각 l5d가 놓일 곳이 없어 게임 오버 → 6 (293)
    name: '콤보 2(배율) + 유예 + 트레이 재생성 2회 + 게임 오버 (seed 1601, 8배치)',
    seed: 1601,
    log: [
      [1, 2, 6],
      [0, 4, 3],
      [2, 3, 0],
      [1, 4, 6],
      [2, 5, 5],
      [0, 5, 1],
      [2, 0, 1],
      [1, 0, 4],
    ],
    deltas: [2, 6, 9, 103, 3, 9, 155, 6],
    lines: [0, 0, 0, 1, 0, 0, 1, 0],
    combos: [0, 0, 0, 1, 1, 1, 2, 2],
    trayAt: [2, 5],
    boardClearAt: [],
    gameOverAt: [7],
    final: {
      score: 293,
      combo: 2,
      missStreak: 1,
      over: true,
      rngState: -695775266,
      tray: ['l5d', null, null],
      board: [
        '....22..',
        '....22..',
        '..442211',
        '2.2.....',
        '2.22223.',
        '..22.111',
        '..22....',
        '..22....',
      ].join('\n'),
    },
  },
];
