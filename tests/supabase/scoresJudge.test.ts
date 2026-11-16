import { describe, expect, it } from 'vitest';
import type { FnRes } from '../../scripts/supabase-check/nicknameJudge';
import { judgeConflictRace, judgeRaceRun } from '../../scripts/supabase-check/scoresJudge';

const res = (status: number, body: unknown): FnRes => ({ status, body, header: () => null });
const EXPECT = { score: 100, weekKey: '2026-W46' };
const good200 = res(200, { ok: true, score: 100, best: 100, weekKey: '2026-W46', isNewBest: true });
const conflict = res(409, { ok: false, code: 'resubmit-conflict' });
const mismatch = res(400, { ok: false, code: 'score-mismatch' });

describe('judgeConflictRace (정상 로그 vs 점수 조작 로그의 동시 제출)', () => {
  it('정상 두 조합만 PASS: (정상 200 + 조작 409), (정상 409 + 조작 400 score-mismatch)', () => {
    expect(judgeConflictRace(good200, conflict, EXPECT)).toMatchObject({
      pass: true,
      winner: 'good',
    });
    expect(judgeConflictRace(conflict, mismatch, EXPECT)).toMatchObject({
      pass: true,
      winner: 'tampered',
    });
  });

  it('허위 PASS였던 조합: 정상 200이 null·손상이면 조작이 409여도 FAIL', () => {
    expect(judgeConflictRace(res(200, null), conflict, EXPECT).pass).toBe(false);
    expect(judgeConflictRace(res(200, {}), conflict, EXPECT).pass).toBe(false);
  });

  it('허위 PASS였던 조합: 정상 409 + 조작 200(점수 조작 성공)은 FAIL', () => {
    const tampered200 = res(200, {
      ok: true,
      score: 999,
      best: 999,
      weekKey: '2026-W46',
      isNewBest: true,
    });
    const out = judgeConflictRace(conflict, tampered200, EXPECT);
    expect(out.pass).toBe(false);
    expect(out.unverified).toBeUndefined();
  });

  it('정상 200이라도 ok·score·best·weekKey가 틀리면 FAIL', () => {
    const bads = [
      { ok: false, score: 100, best: 100, weekKey: '2026-W46', isNewBest: true },
      { ok: true, score: 99, best: 100, weekKey: '2026-W46', isNewBest: true },
      { ok: true, score: 100, best: 50, weekKey: '2026-W46', isNewBest: true },
      { ok: true, score: 100, best: 100, weekKey: '2026-W45', isNewBest: true },
      { ok: true, score: 100, best: 100, weekKey: '2026-W46', isNewBest: 'yes' },
      { score: 100, best: 100, weekKey: '2026-W46', isNewBest: true },
    ];
    for (const body of bads) {
      expect(judgeConflictRace(res(200, body), conflict, EXPECT).pass, JSON.stringify(body)).toBe(
        false,
      );
    }
  });

  it('둘 다 확정 / 둘 다 거부 / 승자가 아닌 쪽 응답이 다른 코드면 FAIL', () => {
    expect(judgeConflictRace(good200, good200, EXPECT).pass).toBe(false);
    expect(judgeConflictRace(conflict, conflict, EXPECT).pass).toBe(false);
    expect(judgeConflictRace(good200, mismatch, EXPECT).pass).toBe(false); // 정상 200 + 조작 400
    expect(judgeConflictRace(good200, res(409, { code: 'version-mismatch' }), EXPECT).pass).toBe(
      false,
    );
    expect(judgeConflictRace(res(400, { code: 'gap-too-short' }), mismatch, EXPECT).pass).toBe(
      false,
    );
    expect(judgeConflictRace(conflict, res(400, { code: 'seed-mismatch' }), EXPECT).pass).toBe(
      false,
    );
  });

  it('연결 실패(status 0)·5xx는 FAIL이 아니라 시험 불가', () => {
    for (const bad of [res(0, null), res(500, { code: 'server' }), res(503, null)]) {
      const a = judgeConflictRace(bad, conflict, EXPECT);
      const b = judgeConflictRace(good200, bad, EXPECT);
      expect([a.pass, a.unverified, b.pass, b.unverified]).toEqual([false, true, false, true]);
    }
  });
});

describe('judgeRaceRun (경쟁 뒤 run의 해시·결과가 승자와 같다)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    data: [
      {
        submission_hash: 'h-good',
        submitted_at: '2026-11-17T00:00:00Z',
        result: { ok: true, score: 100, best: 100, isNewBest: true },
        ...over,
      },
    ],
    error: null,
    status: 200,
  });

  it('승자와 일치하면 PASS (정상 승자 / 조작 승자)', () => {
    expect(judgeRaceRun(row(), { winner: 'good', score: 100, hash: 'h-good' }).pass).toBe(true);
    const tampered = row({
      submission_hash: 'h-bad',
      result: { ok: false, code: 'score-mismatch' },
    });
    expect(judgeRaceRun(tampered, { winner: 'tampered', score: 100, hash: 'h-bad' }).pass).toBe(
      true,
    );
  });

  it('DB result·해시가 승자와 다르면 FAIL (응답은 정상 승자인데 DB에는 조작 결과 등)', () => {
    const wrongResult = row({ result: { ok: false, code: 'score-mismatch' } });
    expect(judgeRaceRun(wrongResult, { winner: 'good', score: 100, hash: 'h-good' }).pass).toBe(
      false,
    );
    expect(judgeRaceRun(row(), { winner: 'tampered', score: 100, hash: 'h-good' }).pass).toBe(
      false,
    );
    expect(
      judgeRaceRun(row({ submission_hash: 'other' }), {
        winner: 'good',
        score: 100,
        hash: 'h-good',
      }).pass,
    ).toBe(false);
    expect(
      judgeRaceRun(row({ result: { ok: true, score: 101 } }), {
        winner: 'good',
        score: 100,
        hash: 'h-good',
      }).pass,
    ).toBe(false);
  });

  it('조회 오류·0행·2행은 FAIL', () => {
    const exp = { winner: 'good' as const, score: 100, hash: 'h-good' };
    expect(
      judgeRaceRun({ data: null, error: { code: '500', message: 'x' }, status: 500 }, exp).pass,
    ).toBe(false);
    expect(judgeRaceRun({ data: [], error: null, status: 200 }, exp).pass).toBe(false);
    const two = row();
    expect(
      judgeRaceRun({ ...two, data: [...(two.data as unknown[]), ...(two.data as unknown[])] }, exp)
        .pass,
    ).toBe(false);
  });
});
