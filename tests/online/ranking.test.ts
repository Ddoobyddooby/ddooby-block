import { describe, expect, it } from 'vitest';
import { createAccount } from '../../src/online/account';
import type { RpcResult } from '../../src/online/client';
import {
  createRanking,
  parseRankingRows,
  RANKING_AROUND_MAX,
  RANKING_TOP_LIMIT,
} from '../../src/online/ranking';
import { deferred, fakeBackend, type FakeBackend, type FakeOptions } from './fakeBackend';

const WK = '2026-W47';
const weekRow = (over: Record<string, unknown> = {}) => ({
  week_key: WK,
  section: 'week',
  seq: null,
  rank: null,
  nickname: null,
  tag: null,
  best_score: null,
  is_me: false,
  ...over,
});
const dataRow = (section: 'top' | 'around', seq: number, over: Record<string, unknown> = {}) => ({
  week_key: WK,
  section,
  seq,
  rank: seq,
  nickname: `n${seq}`,
  tag: seq,
  best_score: 1000 - seq,
  is_me: false,
  ...over,
});
const meRow = (over: Record<string, unknown> = {}) => ({
  week_key: WK,
  section: 'me',
  seq: 7,
  rank: 7,
  nickname: 'n7',
  tag: 7,
  best_score: 993,
  is_me: true,
  ...over,
});

describe('parseRankingRows: 응답 검사', () => {
  it('정상: week 메타 + top + around + me. 입력 순서가 섞여도 seq로 정렬하고, 겹치는 같은 줄은 허용', () => {
    const parsed = parseRankingRows([
      weekRow(),
      dataRow('top', 2),
      dataRow('top', 1),
      dataRow('around', 2),
      dataRow('around', 3),
      meRow({ seq: 3, rank: 3 }),
    ]);
    expect(parsed?.weekKey).toBe(WK);
    expect(parsed?.top.map((r) => r.seq)).toEqual([1, 2]);
    expect(parsed?.around.map((r) => r.seq)).toEqual([2, 3]);
    expect(parsed?.me).toEqual({ rank: 3, score: 993 });
    expect(parsed?.top[0]).toEqual({
      seq: 1,
      rank: 1,
      nickname: 'n1',
      tag: 1,
      score: 999,
      isMe: false,
    });
  });

  it('빈 주: week 메타 한 줄만 → 목록 비어 있고 me null', () => {
    expect(parseRankingRows([weekRow()])).toEqual({ weekKey: WK, top: [], around: [], me: null });
  });

  it('이름 없는 내 기록: me의 rank·seq가 null이어도 점수가 있으면 정상', () => {
    const parsed = parseRankingRows([
      weekRow(),
      meRow({ seq: null, rank: null, nickname: null, tag: null, best_score: 0 }),
    ]);
    expect(parsed?.me).toEqual({ rank: null, score: 0 });
  });

  it.each([
    ['null', null],
    ['객체', {}],
    ['문자열', 'x'],
    ['행이 null', [weekRow(), null]],
    ['행이 배열', [weekRow(), []]],
    ['빈 배열 (week 메타 없음)', []],
    ['week 메타 중복', [weekRow(), weekRow()]],
    ['week 메타 없음, top만', [dataRow('top', 1)]],
    ['week 행에 개인정보 칸이 있다', [weekRow({ nickname: 'x' })]],
    ['week 행의 is_me가 true', [weekRow({ is_me: true })]],
    ['알 수 없는 section', [weekRow(), dataRow('top', 1, { section: 'bottom' })]],
    ['다른 주가 섞임', [weekRow(), dataRow('top', 1, { week_key: '2026-W46' })]],
    ['없는 ISO 주(2021-W53)', [weekRow({ week_key: '2021-W53' })]],
    ['W00', [weekRow({ week_key: '2026-W00' })]],
    ['week_key 숫자', [weekRow({ week_key: 2026 })]],
    ['me 중복', [weekRow(), meRow(), meRow()]],
    ['me의 is_me가 false', [weekRow(), meRow({ is_me: false })]],
    ['me: rank만 null', [weekRow(), meRow({ rank: null })]],
    ['me: seq만 null', [weekRow(), meRow({ seq: null })]],
    ['me: rank > seq', [weekRow(), meRow({ rank: 9, seq: 7 })]],
    ['me: 점수 null', [weekRow(), meRow({ best_score: null })]],
    ['seq 0', [weekRow(), dataRow('top', 0)]],
    ['seq 소수', [weekRow(), dataRow('top', 1, { seq: 1.5 })]],
    ['seq 음수', [weekRow(), dataRow('top', 1, { seq: -1 })]],
    ['seq 문자열 숫자', [weekRow(), dataRow('top', 1, { seq: '1' })]],
    ['seq NaN', [weekRow(), dataRow('top', 1, { seq: Number.NaN })]],
    ['rank가 seq보다 크다', [weekRow(), dataRow('top', 2, { rank: 3 })]],
    ['rank 0', [weekRow(), dataRow('top', 1, { rank: 0 })]],
    ['tag 10000', [weekRow(), dataRow('top', 1, { tag: 10000 })]],
    ['tag -1', [weekRow(), dataRow('top', 1, { tag: -1 })]],
    ['tag 소수', [weekRow(), dataRow('top', 1, { tag: 1.5 })]],
    ['tag null (손상 행이 새어 나옴)', [weekRow(), dataRow('top', 1, { tag: null })]],
    ['닉네임 null', [weekRow(), dataRow('top', 1, { nickname: null })]],
    ['닉네임 빈 문자열', [weekRow(), dataRow('top', 1, { nickname: '' })]],
    ['점수 음수', [weekRow(), dataRow('top', 1, { best_score: -1 })]],
    ['점수 int 범위 초과', [weekRow(), dataRow('top', 1, { best_score: 2147483648 })]],
    ['is_me 문자열', [weekRow(), dataRow('top', 1, { is_me: 'false' })]],
    ['top의 seq가 50 초과', [weekRow(), dataRow('top', RANKING_TOP_LIMIT + 1)]],
    ['top 안에서 seq 중복', [weekRow(), dataRow('top', 1), dataRow('top', 1)]],
    [
      'top·around의 같은 seq가 다른 내용 (조용히 덮어쓰지 않는다)',
      [weekRow(), dataRow('top', 1), dataRow('around', 1, { best_score: 5 })],
    ],
  ])('어긋난 응답 → null (%s)', (_name, data) => {
    expect(parseRankingRows(data)).toBeNull();
  });

  it('top 51행·around 12행(상한 초과)은 거부', () => {
    const top = Array.from({ length: RANKING_TOP_LIMIT + 1 }, (_, i) => dataRow('top', i + 1));
    // seq 51이 이미 위에서 걸리지만, 개수 상한 자체도 막는다
    expect(parseRankingRows([weekRow(), ...top])).toBeNull();
    const around = Array.from({ length: RANKING_AROUND_MAX + 1 }, (_, i) =>
      dataRow('around', 100 + i),
    );
    expect(parseRankingRows([weekRow(), ...around])).toBeNull();
  });

  it('경계 값은 통과: tag 0·9999, 점수 0·int 최댓값, top 50행·around 11행', () => {
    const top = Array.from({ length: RANKING_TOP_LIMIT }, (_, i) => dataRow('top', i + 1));
    const around = Array.from({ length: RANKING_AROUND_MAX }, (_, i) => dataRow('around', 100 + i));
    const parsed = parseRankingRows([
      weekRow(),
      ...top,
      ...around,
      dataRow('around', 300, { tag: 0, best_score: 0 }),
    ]);
    expect(parsed).toBeNull(); // around 12행
    const ok = parseRankingRows([
      weekRow(),
      ...top,
      ...around.slice(0, 9),
      dataRow('around', 300, { tag: 0, best_score: 0 }),
      dataRow('around', 301, { tag: 9999, best_score: 2147483647 }),
    ]);
    expect(ok?.top).toHaveLength(RANKING_TOP_LIMIT);
    expect(ok?.around).toHaveLength(RANKING_AROUND_MAX);
  });
});

async function setup(
  opts: FakeOptions = {},
  deps: { online?: boolean; hasKeys?: boolean; timeoutMs?: number; ready?: boolean } = {},
) {
  const backend: FakeBackend = fakeBackend({ session: 'user-a', ...opts });
  const account = createAccount({
    hasKeys: deps.hasKeys ?? true,
    loadBackend: async () => (deps.hasKeys === false ? null : backend),
    isOnline: () => deps.online ?? true,
    onOnline: () => undefined,
    timeoutMs: 1000,
  });
  if (deps.ready !== false) await account.ensure();
  const ranking = createRanking(account, {
    isOnline: () => deps.online ?? true,
    timeoutMs: deps.timeoutMs ?? 200,
  });
  return { backend, account, ranking };
}
const rpc = (data: unknown, status = 200): FakeOptions => ({
  callRpc: async () => ({ status, data }),
});

describe('fetchRanking', () => {
  it('정상: weekly_ranking을 인자 없이 한 번 부르고 결과에 계정 ID를 싣는다', async () => {
    const { ranking, backend } = await setup(
      rpc([weekRow(), dataRow('top', 1), meRow({ seq: 1, rank: 1 })]),
    );
    const result = await ranking.fetchRanking();
    expect(result).toMatchObject({ kind: 'ok', weekKey: WK, userId: 'user-a' });
    expect(result.kind === 'ok' && result.me).toEqual({ rank: 1, score: 993 });
    expect(backend.calls.callRpc).toBe(1);
    expect(backend.lastRpc).toBe('weekly_ranking');
  });

  it('빈 주(week 한 줄)는 정상(ok, 목록 없음)이고 오류가 아니다', async () => {
    const { ranking } = await setup(rpc([weekRow()]));
    expect(await ranking.fetchRanking()).toMatchObject({
      kind: 'ok',
      top: [],
      around: [],
      me: null,
    });
  });

  it('키 없음 → offline, 요청 없음', async () => {
    const { ranking, backend } = await setup({}, { hasKeys: false });
    expect(await ranking.fetchRanking()).toEqual({ kind: 'offline' });
    expect(backend.calls.callRpc).toBe(0);
  });

  it('오프라인(navigator) → offline, 요청 없음', async () => {
    const { ranking, backend } = await setup({}, { online: false });
    expect(await ranking.fetchRanking()).toEqual({ kind: 'offline' });
    expect(backend.calls.callRpc).toBe(0);
  });

  it('연결 실패(SDK가 status 0으로 알림 → network) → offline', async () => {
    const { ranking } = await setup({ callRpc: async (): Promise<RpcResult> => 'network' });
    expect(await ranking.fetchRanking()).toEqual({ kind: 'offline' });
  });

  it.each([
    ['5xx', 500],
    ['401', 401],
    ['403', 403],
    ['404(함수 없음)', 404],
    ['204(본문 없음)', 204],
  ])('서버 오류 %s → error (빈 주·정상으로 위장하지 않는다)', async (_n, status) => {
    const { ranking } = await setup(rpc(status === 204 ? null : [weekRow()], status));
    expect(await ranking.fetchRanking()).toEqual({ kind: 'error' });
  });

  it('손상된 본문 → error', async () => {
    const { ranking } = await setup(rpc('<html>'));
    expect(await ranking.fetchRanking()).toEqual({ kind: 'error' });
    const b = await setup(rpc([weekRow(), dataRow('top', 1, { tag: null })]));
    expect(await b.ranking.fetchRanking()).toEqual({ kind: 'error' });
  });

  it('RPC가 throw해도 밖으로 던지지 않고 error', async () => {
    const { ranking } = await setup({
      callRpc: async () => {
        throw new Error('boom');
      },
    });
    expect(await ranking.fetchRanking()).toEqual({ kind: 'error' });
  });

  it('RPC가 기한(5초 → 시험에서는 200ms)을 넘기면 error, 늦은 응답은 쓰지 않는다', async () => {
    const gate = deferred<RpcResult>();
    const { ranking } = await setup({ callRpc: () => gate.promise }, { timeoutMs: 30 });
    const result = ranking.fetchRanking();
    expect(await result).toEqual({ kind: 'error' });
    gate.resolve({ status: 200, data: [weekRow()] });
    await Promise.resolve();
  });

  it('계정 준비가 기한을 넘기면 error이고, 그 뒤 준비가 끝나도 RPC를 새로 시작하지 않는다', async () => {
    const gate = deferred<string | null>();
    const { ranking, backend } = await setup(
      { session: null, getSession: () => gate.promise },
      { timeoutMs: 30, ready: false },
    );
    expect(await ranking.fetchRanking()).toEqual({ kind: 'error' });
    gate.resolve('user-a');
    await new Promise((r) => setTimeout(r, 10));
    expect(backend.calls.callRpc).toBe(0);
  });

  it('정확히 기한 안에 끝나면 ok', async () => {
    const { ranking } = await setup(
      {
        callRpc: () =>
          new Promise((r) => setTimeout(() => r({ status: 200, data: [weekRow()] }), 20)),
      },
      { timeoutMs: 200 },
    );
    expect((await ranking.fetchRanking()).kind).toBe('ok');
  });

  it('계정이 없어도(익명 로그인 실패) 공개 TOP을 조회한다: userId null, me null', async () => {
    const { ranking, backend } = await setup(
      {
        session: null,
        signIn: async () => {
          throw new Error('anonymous sign-ins disabled');
        },
        ...rpc([weekRow(), dataRow('top', 1)]),
      },
      { ready: false },
    );
    const result = await ranking.fetchRanking();
    expect(result).toMatchObject({ kind: 'ok', userId: null, me: null });
    expect(result.kind === 'ok' && result.top).toHaveLength(1);
    expect(backend.calls.callRpc).toBe(1);
  });

  it('계정 없이 불렀는데 내 기록(me·is_me)이 섞여 오면 믿지 않는다 (error)', async () => {
    const mk = () =>
      setup(
        {
          session: null,
          signIn: async () => {
            throw new Error('x');
          },
          ...rpc([weekRow(), dataRow('top', 1, { is_me: true })]),
        },
        { ready: false },
      );
    expect(await (await mk()).ranking.fetchRanking()).toEqual({ kind: 'error' });
  });

  it('A로 조회 중 로그아웃·다른 계정이 되면 그 응답은 버린다 (error)', async () => {
    const gate = deferred<RpcResult>();
    const { ranking, backend } = await setup({ callRpc: () => gate.promise });
    const pending = ranking.fetchRanking();
    await new Promise((r) => setTimeout(r, 0));
    backend.signOut();
    gate.resolve({ status: 200, data: [weekRow(), dataRow('top', 1), meRow()] });
    expect(await pending).toEqual({ kind: 'error' });
  });

  it('같은 계정의 토큰 갱신(TOKEN_REFRESHED)은 정상 응답을 버리지 않는다', async () => {
    const gate = deferred<RpcResult>();
    const { ranking, backend } = await setup({ callRpc: () => gate.promise });
    const pending = ranking.fetchRanking();
    await new Promise((r) => setTimeout(r, 0));
    // 같은 사용자 ID로 세션 이벤트가 다시 온다 (토큰 갱신)
    backend.emit('user-a');
    gate.resolve({ status: 200, data: [weekRow(), dataRow('top', 1)] });
    expect((await pending).kind).toBe('ok');
  });
});
