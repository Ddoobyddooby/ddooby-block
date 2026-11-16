import { describe, expect, it } from 'vitest';
import type { SubmitOutcome } from '../../src/online';
import {
  parseFakeRanking,
  shouldCheckProfile,
  shouldOpenPrompt,
  type GateInput,
} from '../../src/scenes/nicknameGate';

describe('parseFakeRanking (DEV 전용 ?ranking=fake)', () => {
  it('?ranking=fake만 true', () => {
    expect(parseFakeRanking('?ranking=fake', true)).toBe(true);
    expect(parseFakeRanking('?seed=3&ranking=fake', true)).toBe(true);
  });

  it('프로덕션(dev=false)·없음·다른 값(이전의 ?ranking·?ranking=1 포함)은 무시', () => {
    expect(parseFakeRanking('?ranking=fake', false)).toBe(false);
    for (const q of [
      '',
      '?seed=1',
      '?ranking',
      '?ranking=',
      '?ranking=1',
      '?ranking=0',
      '?rankings=fake',
    ]) {
      expect(parseFakeRanking(q, true), q).toBe(false);
    }
  });
});

describe('닉네임 게이트 진리표 (점수 제출 성공 뒤에만, 배포본에서도)', () => {
  const ok: SubmitOutcome = {
    kind: 'ok',
    score: 10,
    best: 10,
    weekKey: '2026-W46',
    isNewBest: true,
    userId: 'user-a',
  };
  const base: GateInput = { outcome: ok, userId: 'user-a', status: 'ready', networkOnline: true };

  it('제출 성공 + 같은 계정 + 온라인 + ready면 프로필을 조회한다', () => {
    expect(shouldCheckProfile(base)).toBe(true);
  });

  it('제출이 실패·거부·새 버전 안내면 열지 않는다', () => {
    for (const outcome of [
      { kind: 'failed' },
      { kind: 'rejected', code: 'score-mismatch' },
      { kind: 'outdated' },
    ] as SubmitOutcome[]) {
      expect(shouldCheckProfile({ ...base, outcome }), outcome.kind).toBe(false);
    }
  });

  it('제출한 계정과 지금 계정이 다르거나 계정이 없으면 열지 않는다 (기다리는 사이 계정이 바뀜)', () => {
    expect(shouldCheckProfile({ ...base, userId: 'user-b' })).toBe(false);
    expect(shouldCheckProfile({ ...base, userId: null })).toBe(false);
  });

  it.each(['disabled', 'offline', 'signing-in'] as const)(
    '계정 %s이면 조회하지 않는다',
    (status) => {
      expect(shouldCheckProfile({ ...base, status })).toBe(false);
    },
  );

  it('저장된 세션으로 ready여도 브라우저가 오프라인이면 조회하지 않는다', () => {
    expect(shouldCheckProfile({ ...base, networkOnline: false })).toBe(false);
  });

  it('프로필 조회 결과: 이름이 없을 때(null)만 연다. 설정됨·조회 실패(error)는 열지 않는다', () => {
    expect(shouldOpenPrompt(null)).toBe(true);
    expect(shouldOpenPrompt({ nickname: '뚜비', tag: 0 })).toBe(false);
    expect(shouldOpenPrompt('error')).toBe(false);
    expect(shouldOpenPrompt(undefined)).toBe(false);
  });
});
