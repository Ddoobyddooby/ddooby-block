import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLAY, RULES_VERSION, SAVE } from '../../src/config';
import { createGame, place } from '../../src/core/engine';
import { checkIntervals, replay } from '../../src/core/replay';
import type { GameState, Placement } from '../../src/core/types';
import {
  inspectRun,
  parseRun,
  restoreRun,
  sameState,
  serializeRun,
  type SavedRun,
} from '../../src/storage/run';
import { anyMove, playGreedy } from '../helpers/bot';

// seed 16, 그리디 봇 10수: 줄 제거 3번·새 트레이 3번·콤보 3까지 가는 판 (보드 비움·게임 오버는 없다)
const SEED = 16;
const MOVES = 10;
const ELAPSED = 3300;

function fixture() {
  return playGreedy(SEED, MOVES);
}

function validJson(): string {
  const played = fixture();
  return serializeRun({
    seed: SEED,
    runId: null,
    placements: played.placements,
    elapsedMs: ELAPSED,
    state: played.state,
  });
}

/** 정상 JSON을 객체로 풀어 한 곳만 바꾼 문자열 */
function mutated(change: (raw: Record<string, unknown>) => void): string {
  const raw = JSON.parse(validJson()) as Record<string, unknown>;
  change(raw);
  return JSON.stringify(raw);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

describe('10번 배치 → 저장 → 새로 읽기 → 복원 (SPEC 11절 7번)', () => {
  it('고정 판의 사전 조건: 줄 제거·새 트레이·콤보가 실제로 일어났고 끝나지 않았다', () => {
    const played = fixture();
    expect(played.placements).toHaveLength(10);
    const count = (type: string): number => played.events.filter((e) => e.type === type).length;
    expect(count('clear')).toBe(3);
    expect(count('tray')).toBe(3);
    expect(count('combo')).toBe(3);
    expect(played.state.over).toBe(false);
  });

  it('보드·트레이·점수·콤보·RNG·seed·runId·로그·시계가 같다 (손으로 적은 값과도 비교)', () => {
    const played = fixture();
    const json = validJson();
    // 문자열만 넘어간다: 저장소에서 새로 읽은 것과 같다
    const saved = parseRun(json);
    expect(saved).not.toBeNull();
    const restored = restoreRun(saved as SavedRun);

    expect(restored).toEqual(played.state);
    expect(restored?.score).toBe(483);
    expect(restored?.combo).toBe(3);
    expect(restored?.missStreak).toBe(0);
    expect(restored?.rngState).toBe(503953292);
    expect(restored?.over).toBe(false);
    expect(restored?.tray).toEqual(['j4b', 'l3b', null]);
    // 보드에 남은 칸: [인덱스, 색] 9개
    const filled = restored?.board.cells
      .map((color, index) => [index, color] as const)
      .filter(([, color]) => color !== null);
    expect(filled).toEqual([
      [2, 3],
      [3, 3],
      [5, 1],
      [19, 2],
      [20, 2],
      [21, 1],
      [22, 6],
      [27, 2],
      [28, 2],
    ]);
    expect(saved?.seed).toBe(SEED);
    expect(saved?.runId).toBeNull();
    expect(saved?.elapsedMs).toBe(ELAPSED);
    expect(saved?.placements).toEqual(played.placements);
    expect(saved?.snapshot).toEqual(played.state);
    expect(saved?.version).toBe(1);
    expect(saved?.rulesVersion).toBe(RULES_VERSION);
  });

  it('runId 문자열은 그대로 보존된다', () => {
    const played = fixture();
    const json = serializeRun({
      seed: SEED,
      runId: 'a1b2c3d4-0000-4000-8000-000000000001',
      placements: played.placements,
      elapsedMs: ELAPSED,
      state: played.state,
    });
    expect(parseRun(json)?.runId).toBe('a1b2c3d4-0000-4000-8000-000000000001');
  });

  it('복원 뒤 다음 배치: t가 마지막 t보다 크고, 이어 붙인 로그가 replay·checkIntervals를 통과한다 (SPEC 11절 8번)', () => {
    const played = fixture();
    const saved = parseRun(validJson()) as SavedRun;
    const state = restoreRun(saved) as GameState;
    const lastT = (saved.placements[saved.placements.length - 1] as Placement).t;
    expect(lastT).toBe(3250);

    // 이어한 시계는 저장된 elapsedMs(3300)에서 시작한다. 마지막 t + 200 = 3450 이상에서 둔다
    const nextT = 3450;
    const move = anyMove(state);
    const next: Placement = { ...move, t: nextT };
    const result = place(state, move);
    expect(result.ok).toBe(true);
    expect(nextT).toBeGreaterThan(lastT);

    const joined = [...saved.placements, next];
    expect(checkIntervals(joined, REPLAY.minIntervalMs)).toBe(true);
    const replayed = replay(SEED, joined);
    expect(replayed.ok).toBe(true);
    if (result.ok && replayed.ok) expect(replayed.state).toEqual(result.state);
    // 간격이 모자라면(199) 통과하지 못한다 (기준이 느슨하지 않다)
    expect(checkIntervals([...saved.placements, { ...move, t: lastT + 199 }], 200)).toBe(false);
    expect(played.placements).toHaveLength(10);
  });

  it('빈 로그도 저장·복원된다: createGame(seed) 상태, elapsedMs 0', () => {
    const json = serializeRun({
      seed: 0,
      runId: null,
      placements: [],
      elapsedMs: 0,
      state: createGame(0),
    });
    const saved = parseRun(json) as SavedRun;
    expect(saved.placements).toEqual([]);
    expect(restoreRun(saved)).toEqual(createGame(0));
  });
});

describe('parseRun 경계 (예외 없이 null)', () => {
  it('정상 문자열은 통과한다 (기준)', () => {
    expect(parseRun(validJson())).not.toBeNull();
  });

  it('없음·빈 문자열·잘린 JSON·최상위 타입 오류', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun('')).toBeNull();
    expect(parseRun(validJson().slice(0, 100))).toBeNull();
    expect(parseRun(validJson().slice(0, -1))).toBeNull();
    for (const text of ['null', '[]', '"x"', '7', 'true']) expect(parseRun(text)).toBeNull();
  });

  it('필수 필드가 하나라도 빠지면 null', () => {
    for (const field of ['version', 'rulesVersion', 'seed', 'runId', 'placements', 'elapsedMs']) {
      expect(parseRun(mutated((raw) => delete raw[field])), field).toBeNull();
    }
  });

  it('version·rulesVersion은 정확히 같아야 한다 (문자열·소수·과거·미래 모두 null)', () => {
    for (const value of [0, 2, 1.5, '1', null, true, [1]]) {
      expect(
        parseRun(mutated((raw) => (raw.version = value))),
        `version ${String(value)}`,
      ).toBeNull();
    }
    for (const value of [RULES_VERSION - 1, RULES_VERSION + 1, 0, `${RULES_VERSION}`, 1.5, null]) {
      expect(
        parseRun(mutated((raw) => (raw.rulesVersion = value))),
        `rulesVersion ${String(value)}`,
      ).toBeNull();
    }
  });

  it('seed: 0·4294967295는 유효, 그 밖(-1·2**32·소수·문자열·boolean·null)은 null', () => {
    expect(parseRun(mutated((raw) => (raw.seed = 0)))?.seed).toBe(0);
    expect(parseRun(mutated((raw) => (raw.seed = 4294967295)))?.seed).toBe(4294967295);
    for (const value of [-1, 2 ** 32, 1.5, '4', true, null, [4]]) {
      expect(parseRun(mutated((raw) => (raw.seed = value))), String(value)).toBeNull();
    }
  });

  it('runId: null·문자열은 통과, 숫자·객체·빈 문자열·너무 긴 문자열은 null', () => {
    expect(parseRun(mutated((raw) => (raw.runId = null)))?.runId).toBeNull();
    expect(parseRun(mutated((raw) => (raw.runId = 'x')))?.runId).toBe('x');
    expect(parseRun(mutated((raw) => (raw.runId = 'a'.repeat(128))))).not.toBeNull();
    for (const value of [5, {}, [], '', true, 'a'.repeat(129)]) {
      expect(parseRun(mutated((raw) => (raw.runId = value)))).toBeNull();
    }
  });

  it('placements: 배열이 아니면 null, 항목이 객체가 아니면 null (앞부분만 살리지 않는다)', () => {
    for (const value of [{}, null, 'x', 5, true]) {
      expect(parseRun(mutated((raw) => (raw.placements = value)))).toBeNull();
    }
    for (const item of [null, [], 5, 'x', true]) {
      expect(
        parseRun(mutated((raw) => ((raw.placements as unknown[])[3] = item))),
        String(item),
      ).toBeNull();
    }
  });

  it('t는 0 이상의 정수여야 한다 (음수·소수·문자열·null·누락은 null)', () => {
    const withT = (value: unknown) =>
      parseRun(
        mutated((raw) => {
          const item = (raw.placements as Record<string, unknown>[])[0] as Record<string, unknown>;
          if (value === undefined) delete item.t;
          else item.t = value;
        }),
      );
    expect(withT(0)).not.toBeNull();
    for (const value of [-1, 0.5, '5', null, undefined, true, 2 ** 60]) {
      expect(withT(value), String(value)).toBeNull();
    }
  });

  it('elapsedMs: 유한한 0 이상 수, 마지막 t 이상 (같으면 허용, 작으면 null)', () => {
    expect(parseRun(mutated((raw) => (raw.elapsedMs = 3250)))).not.toBeNull(); // 마지막 t와 같다
    expect(parseRun(mutated((raw) => (raw.elapsedMs = 3249)))).toBeNull();
    expect(parseRun(mutated((raw) => (raw.elapsedMs = 3300.5)))).not.toBeNull();
    for (const value of [-1, '3300', null, true, 2 ** 60]) {
      expect(parseRun(mutated((raw) => (raw.elapsedMs = value))), String(value)).toBeNull();
    }
    // 빈 로그에서는 0이 허용된다
    expect(
      parseRun(
        mutated((raw) => {
          raw.placements = [];
          raw.elapsedMs = 0;
        }),
      ),
    ).not.toBeNull();
  });

  it('JSON 문자열의 1e309(읽으면 Infinity)는 seed·t·elapsedMs 어디서든 null', () => {
    const base = validJson();
    expect(parseRun(base.replace(`"seed":${SEED}`, '"seed":1e309'))).toBeNull();
    expect(parseRun(base.replace('"t":1000', '"t":1e309'))).toBeNull();
    expect(parseRun(base.replace('"elapsedMs":3300', '"elapsedMs":1e309'))).toBeNull();
    expect(parseRun(base)).not.toBeNull();
  });

  it('배치 개수 한도: 한도 N은 통과, N+1은 null (JSON.parse 뒤 replay 전에 거른다)', () => {
    const cell = { trayIndex: 0, row: 0, col: 0, t: 0 };
    const make = (n: number): string =>
      JSON.stringify({
        version: 1,
        rulesVersion: RULES_VERSION,
        seed: 1,
        runId: null,
        placements: Array.from({ length: n }, () => cell),
        elapsedMs: 0,
        snapshot: null,
      });
    expect(parseRun(make(SAVE.maxRunPlacements))).not.toBeNull();
    expect(parseRun(make(SAVE.maxRunPlacements + 1))).toBeNull();
    expect(parseRun(make(SAVE.maxRunPlacements - 1))).not.toBeNull();
  });

  it('문자열 길이 한도: 한도를 넘으면 JSON.parse 전에 null', () => {
    const big = `{"version":1,"pad":"${'x'.repeat(SAVE.maxRunJsonChars)}"}`;
    expect(big.length).toBeGreaterThan(SAVE.maxRunJsonChars);
    const spy = vi.spyOn(JSON, 'parse');
    expect(parseRun(big)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('모르는 필드·__proto__ 키는 버리고 알려진 필드만 복사한다', () => {
    const text = validJson().replace(
      '{"version":1,',
      '{"__proto__":{"seed":9},"extra":1,"version":1,',
    );
    const saved = parseRun(text);
    expect(saved).not.toBeNull();
    expect(Object.keys(saved as object).sort()).toEqual(
      ['elapsedMs', 'placements', 'rulesVersion', 'runId', 'seed', 'snapshot', 'version'].sort(),
    );
    expect(saved?.seed).toBe(SEED);
    expect(({} as Record<string, unknown>).seed).toBeUndefined();
  });

  it('snapshot이 깨져 있어도 그것만으로 null이 되지 않는다 (snapshot은 null로 바뀐다)', () => {
    for (const bad of [null, 5, 'x', [], {}, { board: null }, { board: { size: 8, cells: 3 } }]) {
      const saved = parseRun(mutated((raw) => (raw.snapshot = bad)));
      expect(saved, JSON.stringify(bad)).not.toBeNull();
      expect(saved?.snapshot).toBeNull();
    }
    const missing = parseRun(mutated((raw) => delete raw.snapshot));
    expect(missing).not.toBeNull();
    expect(missing?.snapshot).toBeNull();
  });
});

describe('restoreRun', () => {
  function savedWith(change: (log: Record<string, unknown>[]) => void): SavedRun {
    const saved = parseRun(
      mutated((raw) => change(raw.placements as Record<string, unknown>[])),
    ) as SavedRun;
    expect(saved).not.toBeNull();
    return saved;
  }

  it('로그가 엔진에서 실패하면 이유와 상관없이 null (빈 슬롯·막힌 칸·보드 밖·소수·문자열)', () => {
    const cases: [string, (log: Record<string, unknown>[]) => void][] = [
      ['빈 슬롯', (log) => ((log[1] as Record<string, unknown>).trayIndex = 0)], // 슬롯 0은 첫 수에서 이미 비었다
      ['슬롯 범위 밖', (log) => ((log[3] as Record<string, unknown>).trayIndex = 7)],
      ['보드 밖', (log) => ((log[3] as Record<string, unknown>).row = 99)],
      ['음수', (log) => ((log[3] as Record<string, unknown>).col = -1)],
      ['소수 행', (log) => ((log[3] as Record<string, unknown>).row = 0.5)],
      ['문자열 열', (log) => ((log[3] as Record<string, unknown>).col = '0')],
      ['null 행', (log) => ((log[3] as Record<string, unknown>).row = null)],
      ['필드 누락', (log) => delete (log[3] as Record<string, unknown>).trayIndex],
      ['채워진 칸 위에 놓기', (log) => ((log[1] as Record<string, unknown>).col = 0)],
    ];
    for (const [name, change] of cases) {
      expect(restoreRun(savedWith(change)), name).toBeNull();
    }
  });

  it('직접 만든 객체의 항목이 객체가 아니어도 예외 없이 null (invalid)', () => {
    const saved = parseRun(validJson()) as SavedRun;
    const broken = { ...saved, placements: [null as unknown as Placement] };
    expect(restoreRun(broken)).toBeNull();
    expect(restoreRun({ ...saved, placements: undefined as unknown as Placement[] })).toBeNull();
  });

  it('게임 오버에 닿은 로그는 복원되고, 그 뒤에 배치를 더하면 null (over)', () => {
    const over = playGreedy(294, 3000);
    expect(over.state.over).toBe(true);
    const json = serializeRun({
      seed: 294,
      runId: null,
      placements: over.placements,
      elapsedMs: 99999,
      state: over.state,
    });
    const saved = parseRun(json) as SavedRun;
    expect(restoreRun(saved)?.over).toBe(true);
    const more: SavedRun = {
      ...saved,
      placements: [...saved.placements, { trayIndex: 0, row: 0, col: 0, t: 90000 }],
    };
    expect(restoreRun(more)).toBeNull();
  });

  it('snapshot이 달라도 replay 결과를 쓰고 경고만 남긴다 (필드별로 하나씩 바꿔 본다)', () => {
    const played = fixture();
    const saved = parseRun(validJson()) as SavedRun;
    const snapshot = saved.snapshot as GameState;
    const variants: GameState[] = [
      { ...snapshot, score: snapshot.score + 1 },
      { ...snapshot, combo: 0 },
      { ...snapshot, missStreak: 9 },
      { ...snapshot, rngState: snapshot.rngState + 1 },
      { ...snapshot, tray: ['dot', 'dot', 'dot'] },
      { ...snapshot, over: true },
      { ...snapshot, board: { ...snapshot.board, cells: snapshot.board.cells.map(() => null) } },
    ];
    for (const variant of variants) {
      warn.mockClear();
      const restored = restoreRun({ ...saved, snapshot: variant });
      expect(restored).toEqual(played.state);
      expect(warn).toHaveBeenCalledTimes(1);
    }
    // snapshot이 같으면 경고가 없다
    warn.mockClear();
    expect(restoreRun(saved)).toEqual(played.state);
    expect(warn).not.toHaveBeenCalled();
    // snapshot이 없어도 로그로 복원한다
    expect(restoreRun({ ...saved, snapshot: null })).toEqual(played.state);
  });

  it('입력(saved·placements·snapshot)을 바꾸지 않고, 반환 상태를 바꿔도 입력이 오염되지 않는다', () => {
    const saved = parseRun(validJson()) as SavedRun;
    const before = JSON.stringify(saved);
    const restored = restoreRun(saved) as GameState;
    expect(JSON.stringify(saved)).toBe(before);
    (restored.board.cells as (number | null)[])[0] = 5;
    expect(JSON.stringify(saved)).toBe(before);
    expect(restoreRun(saved)?.board.cells[0]).toBeNull();
  });
});

describe('inspectRun (부팅 때 판정)', () => {
  it('끝나지 않았고 간격이 지켜진 로그는 이어할 수 있다', () => {
    const result = inspectRun(validJson());
    expect(result.kind).toBe('resume');
    if (result.kind === 'resume') {
      expect(result.state).toEqual(fixture().state);
      expect(result.saved.placements).toHaveLength(10);
    }
  });

  it('끝난 판은 over로 알리고 최고 점수 복구에 쓸 상태를 준다 (이어하기 대상이 아니다)', () => {
    const over = playGreedy(294, 3000);
    const json = serializeRun({
      seed: 294,
      runId: null,
      placements: over.placements,
      elapsedMs: 99999,
      state: over.state,
    });
    const result = inspectRun(json);
    expect(result.kind).toBe('over');
    if (result.kind === 'over') expect(result.state.score).toBe(305);
  });

  it('snapshot.over만 true이고 로그는 끝나지 않았으면 이어할 수 있다 (로그가 기준)', () => {
    const json = mutated((raw) => {
      (raw.snapshot as Record<string, unknown>).over = true;
    });
    expect(inspectRun(json).kind).toBe('resume');
  });

  it('깨짐·버전 불일치·복원 실패는 rejected', () => {
    expect(inspectRun(null).kind).toBe('rejected');
    expect(inspectRun('{').kind).toBe('rejected');
    expect(inspectRun(mutated((raw) => (raw.version = 2))).kind).toBe('rejected');
    expect(inspectRun(mutated((raw) => (raw.rulesVersion = RULES_VERSION + 1))).kind).toBe(
      'rejected',
    );
    expect(
      inspectRun(mutated((raw) => ((raw.placements as { row: number }[])[3]!.row = 99))).kind,
    ).toBe('rejected');
  });

  it('배치 간격(200ms)을 어긴 로그는 이어하기로 받지 않는다 (같은 t·199ms·감소)', () => {
    const at = (index: number, t: number) => (raw: Record<string, unknown>) => {
      (raw.placements as { t: number }[])[index]!.t = t;
      raw.elapsedMs = 9999;
    };
    // 기준: t를 원래 값(1250 = 이전 1000 + 250)으로 두면 통과
    expect(inspectRun(mutated(at(1, 1250))).kind).toBe('resume');
    expect(inspectRun(mutated(at(1, 1199))).kind).toBe('rejected'); // 199ms
    expect(inspectRun(mutated(at(1, 1200))).kind).toBe('resume'); // 200ms
    expect(inspectRun(mutated(at(1, 1000))).kind).toBe('rejected'); // 같은 t
    expect(inspectRun(mutated(at(1, 900))).kind).toBe('rejected'); // 감소
  });

  it('첫 배치의 t에는 하한이 없다 (0도 통과)', () => {
    const json = mutated((raw) => {
      const log = raw.placements as { t: number }[];
      log.forEach((item, i) => (item.t = i * 250)); // 0, 250, ...
      raw.elapsedMs = 2250;
    });
    expect(inspectRun(json).kind).toBe('resume');
  });
});

describe('serializeRun', () => {
  it('저장 문자열은 순수 함수의 결과: 만든 뒤 입력 배열이 늘어나도 문자열은 그대로', () => {
    const played = fixture();
    const log = [...played.placements];
    const text = serializeRun({
      seed: SEED,
      runId: null,
      placements: log,
      elapsedMs: ELAPSED,
      state: played.state,
    });
    log.push({ trayIndex: 0, row: 0, col: 0, t: 99999 });
    expect(JSON.parse(text).placements).toHaveLength(10);
    expect(sameState(played.state, played.state)).toBe(true);
  });
});
