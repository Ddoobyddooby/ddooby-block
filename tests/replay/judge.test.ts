import { describe, expect, it } from 'vitest';
import type { Placement } from '../../src/core/types';
import {
  checkElapsed,
  isRulesVersion,
  isUuid,
  JUDGE,
  parseSubmission,
  readStoredResult,
  resubmitDecision,
  submissionHash,
  verifyContent,
  type Submission,
} from '../../src/replay/judge';
import { games, withTimes } from '../helpers/randomBot';
import { FIXTURES } from '../helpers/replayFixtures';

const body = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  seed: 7,
  version: 1,
  clientScore: 10,
  placements: [{ trayIndex: 0, row: 1, col: 2, t: 1000 }],
  ...over,
});
const parsed = (b: unknown): Submission => {
  const r = parseSubmission(b);
  if (!r.ok) throw new Error(`형식 오류 ${r.code}`);
  return r.submission;
};
const code = (b: unknown): string => {
  const r = parseSubmission(b);
  return r.ok ? 'ok' : r.code;
};

describe('parseSubmission: 형식', () => {
  it('정상 본문은 값을 새 객체로 복사한다', () => {
    const raw = body();
    const s = parsed(raw);
    expect(s).toEqual({
      seed: 7,
      version: 1,
      clientScore: 10,
      placements: [{ trayIndex: 0, row: 1, col: 2, t: 1000 }],
    });
    // 원본을 바꿔도 이미 만든 제출은 그대로
    (raw.placements as { row: number }[])[0]!.row = 99;
    expect(s.placements[0]?.row).toBe(1);
  });

  it('null·배열·숫자·문자열·undefined 본문은 payload-invalid', () => {
    for (const b of [null, [], 5, 'x', undefined, true])
      expect(code(b), String(b)).toBe('payload-invalid');
  });

  it('version: 정수 1 이상만. 문자열·null·소수·0·음수·int 범위 밖·누락은 version-invalid', () => {
    for (const v of ['1', null, 1.5, 0, -1, 2 ** 31, NaN, Infinity, undefined, true]) {
      expect(code(body({ version: v })), String(v)).toBe('version-invalid');
    }
    expect(code(body({ version: 2 ** 31 - 1 }))).toBe('ok');
    const noVersion = body();
    delete noVersion.version;
    expect(code(noVersion)).toBe('version-invalid');
  });

  it('seed: 0~4294967295 정수. 그 밖은 payload-invalid', () => {
    for (const v of [-1, 4294967296, 1.5, '7', null, NaN, 2 ** 53, undefined]) {
      expect(code(body({ seed: v })), String(v)).toBe('payload-invalid');
    }
    expect(code(body({ seed: 0 }))).toBe('ok');
    expect(code(body({ seed: 4294967295 }))).toBe('ok');
  });

  it('clientScore: 0 이상 안전한 정수. 음수·소수·문자열·unsafe·1e309는 client-score-invalid', () => {
    for (const v of [-1, 1.5, '10', null, 2 ** 53, NaN, Infinity, undefined]) {
      expect(code(body({ clientScore: v })), String(v)).toBe('client-score-invalid');
    }
    // JSON 숫자 1e309는 Infinity로 읽힌다
    expect(code(JSON.parse('{"seed":7,"version":1,"clientScore":1e309,"placements":[]}'))).toBe(
      'client-score-invalid',
    );
    expect(code(body({ clientScore: 0 }))).toBe('ok');
  });

  it('placements: 배열이 아니면 placements-invalid, 항목이 객체가 아니어도 placements-invalid', () => {
    for (const v of [null, {}, 'x', 5, undefined]) {
      expect(code(body({ placements: v })), String(v)).toBe('placements-invalid');
    }
    for (const item of [null, 5, 'x', [], undefined]) {
      expect(code(body({ placements: [item] })), String(item)).toBe('placements-invalid');
    }
  });

  it('좌표·슬롯이 정수가 아니면 placements-invalid (범위는 엔진이 판정한다)', () => {
    const bad = (patch: Record<string, unknown>): string =>
      code(body({ placements: [{ trayIndex: 0, row: 1, col: 2, t: 1000, ...patch }] }));
    for (const v of ['0', null, 1.5, NaN, undefined, 2 ** 53]) {
      expect(bad({ trayIndex: v }), `trayIndex ${String(v)}`).toBe('placements-invalid');
      expect(bad({ row: v }), `row ${String(v)}`).toBe('placements-invalid');
      expect(bad({ col: v }), `col ${String(v)}`).toBe('placements-invalid');
    }
    // 범위 밖이어도 정수면 형식은 통과한다 (엔진이 blocked로 거른다)
    expect(bad({ row: 99, col: -3, trayIndex: 7 })).toBe('ok');
  });

  it('t: 0 이상 안전한 정수. 문자열·음수·소수·NaN·Infinity·unsafe는 t-invalid', () => {
    const bad = (t: unknown): string =>
      code(body({ placements: [{ trayIndex: 0, row: 1, col: 2, t }] }));
    for (const t of ['1000', null, -1, 1.5, NaN, Infinity, 2 ** 53, undefined, {}]) {
      expect(bad(t), String(t)).toBe('t-invalid');
    }
    expect(bad(0)).toBe('ok');
    expect(bad(Number.MAX_SAFE_INTEGER)).toBe('ok');
  });

  it('배치 수 20,000개는 통과, 20,001개는 too-large', () => {
    const make = (n: number): unknown[] =>
      Array.from({ length: n }, (_, i) => ({ trayIndex: 0, row: 0, col: 0, t: i * 200 }));
    expect(code(body({ placements: make(JUDGE.maxPlacements) }))).toBe('ok');
    expect(code(body({ placements: make(JUDGE.maxPlacements + 1) }))).toBe('too-large');
  });

  it('모르는 필드는 버린다, -0은 0으로 읽는다', () => {
    const s = parsed(
      JSON.parse(
        '{"seed":7,"version":1,"clientScore":10,"extra":1,"placements":[{"trayIndex":-0,"row":1,"col":2,"t":-0,"role":"admin"}]}',
      ),
    );
    expect(s.placements[0]).toEqual({ trayIndex: 0, row: 1, col: 2, t: 0 });
    expect(Object.is(s.placements[0]?.trayIndex, -0)).toBe(false);
    expect(Object.keys(s)).toEqual(['seed', 'version', 'clientScore', 'placements']);
  });

  it('본문 상한(1.5MB)이 20,000배치(t 16자리)를 넣고도 남는다', () => {
    const items = Array.from({ length: JUDGE.maxPlacements }, () => ({
      trayIndex: 2,
      row: 7,
      col: 7,
      t: Number.MAX_SAFE_INTEGER,
    }));
    const text = JSON.stringify(
      body({ runId: '00000000-0000-4000-8000-000000000000', placements: items }),
    );
    expect(new TextEncoder().encode(text).length).toBeLessThan(JUDGE.maxBodyBytes);
    expect(JUDGE.maxBodyBytes).toBeLessThanOrEqual(1_500_000);
  });
});

describe('isRulesVersion·isUuid', () => {
  it('규칙 버전은 1~int 상한의 정수', () => {
    expect([1, 2, 2 ** 31 - 1].every(isRulesVersion)).toBe(true);
    expect([0, -1, 1.5, '1', null, 2 ** 31].some(isRulesVersion)).toBe(false);
  });
  it('UUID 모양만 통과 (대소문자 무관)', () => {
    expect(isUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isUuid('123E4567-E89B-42D3-A456-426614174000')).toBe(true);
    for (const v of ['', 'abc', '123e4567-e89b-42d3-a456-42661417400', null, 5, "1' or '1'='1"]) {
      expect(isUuid(v), String(v)).toBe(false);
    }
  });
});

describe('submissionHash·resubmitDecision', () => {
  const base = (): Submission => parsed(body());

  it('키 순서·공백이 달라도 같은 내용이면 같은 해시', async () => {
    const a = parsed(
      JSON.parse(
        '{"seed":7,"version":1,"clientScore":10,"placements":[{"trayIndex":0,"row":1,"col":2,"t":1000}]}',
      ),
    );
    const b = parsed(
      JSON.parse(
        '{ "placements": [ {"t":1000,"col":2,"row":1,"trayIndex":0} ], "clientScore":10, "version":1, "seed":7 }',
      ),
    );
    expect(await submissionHash(a)).toBe(await submissionHash(b));
    expect(await submissionHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('seed·version·clientScore·배치 한 칸·t·순서가 달라지면 다른 해시', async () => {
    const h0 = await submissionHash(base());
    const two: Placement[] = [
      { trayIndex: 0, row: 1, col: 2, t: 1000 },
      { trayIndex: 1, row: 3, col: 4, t: 1300 },
    ];
    const variants: Submission[] = [
      { ...base(), seed: 8 },
      { ...base(), version: 2 },
      { ...base(), clientScore: 11 },
      { ...base(), placements: [{ trayIndex: 1, row: 1, col: 2, t: 1000 }] },
      { ...base(), placements: [{ trayIndex: 0, row: 2, col: 2, t: 1000 }] },
      { ...base(), placements: [{ trayIndex: 0, row: 1, col: 3, t: 1000 }] },
      { ...base(), placements: [{ trayIndex: 0, row: 1, col: 2, t: 1001 }] },
      { ...base(), placements: [] },
    ];
    for (const v of variants) expect(await submissionHash(v)).not.toBe(h0);
    const swapped = [...two].reverse();
    expect(await submissionHash({ ...base(), placements: two })).not.toBe(
      await submissionHash({ ...base(), placements: swapped }),
    );
  });

  it('해시를 기다리는 동안 입력 배열이 바뀌어도 시작 시점의 내용으로 계산한다', async () => {
    const log: Placement[] = [{ trayIndex: 0, row: 1, col: 2, t: 1000 }];
    const s: Submission = { ...base(), placements: log };
    const expected = await submissionHash(base());
    const pending = submissionHash(s);
    log[0] = { trayIndex: 2, row: 7, col: 7, t: 9 };
    log.push({ trayIndex: 1, row: 0, col: 0, t: 2000 });
    expect(await pending).toBe(expected);
  });

  it('저장된 해시가 없으면 new, 같으면 same, 다르면 conflict', () => {
    expect(resubmitDecision(null, 'a')).toBe('new');
    expect(resubmitDecision('a', 'a')).toBe('same');
    expect(resubmitDecision('a', 'b')).toBe('conflict');
  });
});

describe('verifyContent: 봇 로그 200개', () => {
  it('모두 게임 오버로 끝난 로그라 clientScore가 같으면 ok, 점수는 봇 상태의 점수', () => {
    const all = games();
    expect(all).toHaveLength(200);
    for (const g of all) {
      const placements = withTimes(g.log);
      const sub: Submission = {
        seed: g.seed,
        version: 1,
        clientScore: g.state.score,
        placements,
      };
      expect(verifyContent(sub, { seed: g.seed }), `seed ${g.seed}`).toEqual({
        ok: true,
        score: g.state.score,
      });
    }
  });

  it('고정 fixture seed 67은 8배치·280점으로 ok, seed 68은 게임이 안 끝나 not-over', () => {
    const [fx68, fx67] = FIXTURES;
    expect(fx68?.seed).toBe(68);
    expect(fx67?.seed).toBe(67);
    const sub = (fx: NonNullable<typeof fx68>, score: number): Submission => ({
      seed: fx.seed,
      version: 1,
      clientScore: score,
      placements: withTimes(fx.log.map(([trayIndex, row, col]) => ({ trayIndex, row, col }))),
    });
    expect(verifyContent(sub(fx67!, 280), { seed: 67 })).toEqual({ ok: true, score: 280 });
    expect(verifyContent(sub(fx68!, 3281), { seed: 68 })).toEqual({
      ok: false,
      code: 'not-over',
    });
  });
});

describe('verifyContent: 거부', () => {
  const g = games()[0]!;
  const good = (): Submission => ({
    seed: g.seed,
    version: 1,
    clientScore: g.state.score,
    placements: withTimes(g.log),
  });

  it('요청 seed가 발급 seed와 다르면 seed-mismatch (리플레이는 발급 seed 기준)', () => {
    expect(verifyContent({ ...good(), seed: g.seed + 1 }, { seed: g.seed })).toEqual({
      ok: false,
      code: 'seed-mismatch',
    });
  });

  it('clientScore를 ±1 바꾸면 score-mismatch', () => {
    for (const d of [-1, 1]) {
      expect(
        verifyContent({ ...good(), clientScore: g.state.score + d }, { seed: g.seed }),
      ).toEqual({
        ok: false,
        code: 'score-mismatch',
      });
    }
  });

  it('간격 199ms는 gap-too-short, 200ms는 통과, 같은 t·줄어드는 t도 gap-too-short', () => {
    const at = (i: number, t: number): Submission => {
      const p = withTimes(g.log).map((x, k) => (k === i ? { ...x, t } : x));
      return { ...good(), placements: p };
    };
    const t0 = 1000;
    const second = (gap: number): Submission => {
      const p = withTimes(g.log).map((x, k) => ({ ...x, t: t0 + k * 250 }));
      p[1] = { ...p[1]!, t: t0 + gap };
      // 3번째 이후는 간격이 충분하도록 밀어 둔다
      for (let k = 2; k < p.length; k++) p[k] = { ...p[k]!, t: t0 + gap + (k - 1) * 250 };
      return { ...good(), placements: p };
    };
    expect(verifyContent(second(199), { seed: g.seed })).toEqual({
      ok: false,
      code: 'gap-too-short',
    });
    expect(verifyContent(second(200), { seed: g.seed })).toEqual({
      ok: true,
      score: g.state.score,
    });
    expect(verifyContent(second(0), { seed: g.seed })).toEqual({
      ok: false,
      code: 'gap-too-short',
    });
    expect(verifyContent(at(1, 500), { seed: g.seed })).toEqual({
      ok: false,
      code: 'gap-too-short',
    });
    expect(verifyContent(second(-50), { seed: g.seed })).toEqual({
      ok: false,
      code: 'gap-too-short',
    });
  });

  it('게임 오버 뒤에 배치가 더 있으면 그 index에서 replay-invalid / over', () => {
    const extra = withTimes([...g.log, g.log[0]!, g.log[1]!]);
    expect(verifyContent({ ...good(), placements: extra }, { seed: g.seed })).toEqual({
      ok: false,
      code: 'replay-invalid',
      index: g.log.length,
      reason: 'over',
    });
  });

  it('불법 좌표(범위 밖·이미 찬 칸)·빈 슬롯은 replay-invalid의 blocked / emptySlot', () => {
    const p = withTimes(g.log);
    const blocked = p.map((x, k) => (k === 2 ? { ...x, row: 99 } : x));
    expect(verifyContent({ ...good(), placements: blocked }, { seed: g.seed })).toEqual({
      ok: false,
      code: 'replay-invalid',
      index: 2,
      reason: 'blocked',
    });
    const slot = p.map((x, k) => (k === 1 ? { ...x, trayIndex: p[0]!.trayIndex } : x));
    expect(verifyContent({ ...good(), placements: slot }, { seed: g.seed })).toEqual({
      ok: false,
      code: 'replay-invalid',
      index: 1,
      reason: 'emptySlot',
    });
  });

  it('빈 로그는 not-over (점수 0이 맞아도 등록하지 않는다), 끝나기 전 로그 prefix도 not-over', () => {
    expect(verifyContent({ ...good(), placements: [], clientScore: 0 }, { seed: g.seed })).toEqual({
      ok: false,
      code: 'not-over',
    });
    const half = g.log.slice(0, g.log.length - 1);
    expect(
      verifyContent({ ...good(), placements: withTimes(half), clientScore: 0 }, { seed: g.seed }),
    ).toEqual({ ok: false, code: 'not-over' });
  });

  it('판정 순서: seed → 간격 → 리플레이 → 종료 → 점수', () => {
    // seed도 다르고 간격도 틀리면 seed-mismatch가 먼저
    const bad = withTimes(g.log).map((x) => ({ ...x, t: 0 }));
    expect(
      verifyContent({ ...good(), seed: g.seed + 1, placements: bad }, { seed: g.seed }),
    ).toMatchObject({
      code: 'seed-mismatch',
    });
    // 간격도 틀리고 로그도 틀리면 gap-too-short가 먼저
    const worse = bad.map((x) => ({ ...x, row: 99 }));
    expect(verifyContent({ ...good(), placements: worse }, { seed: g.seed })).toMatchObject({
      code: 'gap-too-short',
    });
  });
});

describe('checkElapsed: 마지막 t ≤ 제출 시각 − 발급 시각', () => {
  it('경과 −1ms·같음·+1ms', () => {
    expect(checkElapsed(5000, 0, 5001)).toBe('ok');
    expect(checkElapsed(5000, 0, 5000)).toBe('ok');
    expect(checkElapsed(5000, 0, 4999)).toBe('too-fast');
    expect(checkElapsed(4999, 0, 5000)).toBe('ok');
  });
  it('며칠 뒤 제출도 만료 없이 ok', () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(checkElapsed(60_000, 1_000_000, 1_000_000 + week)).toBe('ok');
  });
  it('제출 시각이 발급 시각보다 앞서거나 숫자가 아니면 clock', () => {
    expect(checkElapsed(0, 1000, 999)).toBe('clock');
    expect(checkElapsed(0, NaN, 1000)).toBe('clock');
    expect(checkElapsed(0, 1000, Infinity)).toBe('clock');
  });
});

describe('readStoredResult: DB에서 읽은 결과를 믿지 않는다', () => {
  it('성공·거부 모양을 읽는다', () => {
    expect(readStoredResult({ ok: true, score: 10, best: 20, isNewBest: false })).toEqual({
      ok: true,
      score: 10,
      best: 20,
      isNewBest: false,
    });
    expect(readStoredResult({ ok: false, code: 'score-mismatch' })).toEqual({
      ok: false,
      code: 'score-mismatch',
    });
    expect(
      readStoredResult({ ok: false, code: 'replay-invalid', index: 3, reason: 'blocked', x: 1 }),
    ).toEqual({ ok: false, code: 'replay-invalid', index: 3, reason: 'blocked' });
  });

  it('손상된 모양은 null', () => {
    const bads: unknown[] = [
      null,
      [],
      'x',
      {},
      { ok: true },
      { ok: true, score: -1, best: 1, isNewBest: true },
      { ok: true, score: 1.5, best: 1, isNewBest: true },
      { ok: true, score: 1, best: 1, isNewBest: 'yes' },
      { ok: false },
      { ok: false, code: 'too-fast' },
      { ok: false, code: 'replay-invalid' },
      { ok: false, code: 'replay-invalid', index: -1, reason: 'over' },
      { ok: false, code: 'replay-invalid', index: 1, reason: 'bogus' },
    ];
    for (const v of bads) expect(readStoredResult(v), JSON.stringify(v)).toBeNull();
  });
});
