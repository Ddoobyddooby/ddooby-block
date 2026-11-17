import { afterEach, describe, expect, it } from 'vitest';
import {
  resetPendingSubmissions,
  trackSubmission,
  whenSubmissionsSettle,
} from '../../src/scenes/pendingSubmission';
import { deferred } from '../online/fakeBackend';

afterEach(() => resetPendingSubmissions());
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('pendingSubmission: 진행 중인 제출 목록', () => {
  it('진행 중인 제출이 없으면 null (기다릴 필요 없음)', () => {
    expect(whenSubmissionsSettle()).toBeNull();
  });

  it('제출이 끝나야 풀리고, 끝나면 목록에서 빠진다', async () => {
    const d = deferred<string>();
    trackSubmission(d.promise);
    const wait = whenSubmissionsSettle();
    expect(wait).not.toBeNull();
    let done = false;
    void wait?.then(() => (done = true));
    await tick();
    expect(done).toBe(false);
    d.resolve('ok');
    await tick();
    expect(done).toBe(true);
    expect(whenSubmissionsSettle()).toBeNull();
  });

  it('거부(예외)로 끝나도 풀리고 처리되지 않은 거부가 남지 않는다', async () => {
    const d = deferred<string>();
    trackSubmission(d.promise);
    const wait = whenSubmissionsSettle();
    d.reject(new Error('boom'));
    await expect(wait).resolves.toBeUndefined();
    expect(whenSubmissionsSettle()).toBeNull();
  });

  it('여러 제출이 있으면 모두 끝나야 풀린다', async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    trackSubmission(a.promise);
    trackSubmission(b.promise);
    let done = false;
    void whenSubmissionsSettle()?.then(() => (done = true));
    a.resolve('a');
    await tick();
    expect(done).toBe(false);
    b.resolve('b');
    await tick();
    expect(done).toBe(true);
  });

  it('RankingTracker를 만들면 그 제출이 자동으로 등록된다 (게임 오버 제출 → 랭킹 화면에서 기다릴 수 있다)', async () => {
    const { RankingTracker } = await import('../../src/scenes/rankingResult');
    const d = deferred<{ kind: 'failed' }>();
    new RankingTracker(d.promise);
    expect(whenSubmissionsSettle()).not.toBeNull();
    d.resolve({ kind: 'failed' });
    await tick();
    expect(whenSubmissionsSettle()).toBeNull();
  });
});
