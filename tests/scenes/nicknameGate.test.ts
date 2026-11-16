import { describe, expect, it } from 'vitest';
import {
  parseRankingParam,
  shouldCheckProfile,
  shouldOpenPrompt,
  type GateInput,
} from '../../src/scenes/nicknameGate';

describe('parseRankingParam (DEV 전용 ?ranking)', () => {
  it('?ranking·?ranking=1은 online, ?ranking=fake는 fake', () => {
    expect(parseRankingParam('?ranking', true)).toBe('online');
    expect(parseRankingParam('?ranking=', true)).toBe('online');
    expect(parseRankingParam('?ranking=1', true)).toBe('online');
    expect(parseRankingParam('?seed=3&ranking', true)).toBe('online');
    expect(parseRankingParam('?ranking=fake', true)).toBe('fake');
  });

  it('프로덕션(dev=false)·없음·다른 값은 무시', () => {
    expect(parseRankingParam('?ranking', false)).toBeNull();
    expect(parseRankingParam('?ranking=fake', false)).toBeNull();
    expect(parseRankingParam('', true)).toBeNull();
    expect(parseRankingParam('?seed=1', true)).toBeNull();
    expect(parseRankingParam('?ranking=0', true)).toBeNull();
    expect(parseRankingParam('?rankings', true)).toBeNull();
  });
});

describe('닉네임 게이트 진리표', () => {
  const base: GateInput = {
    ranking: 'online',
    eligible: true,
    status: 'ready',
    networkOnline: true,
  };

  it('?ranking이 없으면(프로덕션 포함) 창도 프로필 조회도 없다', () => {
    for (const status of ['disabled', 'offline', 'signing-in', 'ready'] as const) {
      expect(shouldCheckProfile({ ...base, ranking: null, status })).toBe(false);
    }
  });

  it('?ranking + 온라인 + 계정 ready + 정상 종료 화면이면 프로필을 조회한다', () => {
    expect(shouldCheckProfile(base)).toBe(true);
  });

  it.each(['disabled', 'offline', 'signing-in'] as const)(
    '계정 %s이면 조회하지 않는다 (이 화면에서는 묻지 않는다)',
    (status) => {
      expect(shouldCheckProfile({ ...base, status })).toBe(false);
    },
  );

  it('저장된 세션으로 ready여도 브라우저가 오프라인이면 조회하지 않는다', () => {
    expect(shouldCheckProfile({ ...base, networkOnline: false })).toBe(false);
  });

  it('?fill=·?over 같은 미리보기 화면(정상 종료가 아님)은 조회하지 않는다', () => {
    expect(shouldCheckProfile({ ...base, eligible: false })).toBe(false);
  });

  it('?ranking=fake는 온라인 없이도 창만 본다 (미리보기 화면 포함)', () => {
    expect(
      shouldCheckProfile({
        ranking: 'fake',
        eligible: false,
        status: 'disabled',
        networkOnline: false,
      }),
    ).toBe(true);
  });

  it('프로필 조회 결과: 이름이 없을 때(null)만 연다. 설정됨·조회 실패(error)는 열지 않는다', () => {
    expect(shouldOpenPrompt(null)).toBe(true);
    expect(shouldOpenPrompt({ nickname: '뚜비', tag: 0 })).toBe(false);
    expect(shouldOpenPrompt('error')).toBe(false);
    expect(shouldOpenPrompt(undefined)).toBe(false);
  });
});
