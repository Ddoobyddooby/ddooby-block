import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyResult,
  chooseLater,
  initialPromptState,
  isLocked,
  PROMPT_TIMINGS,
  shouldLaterOnEscape,
  shouldSubmitOnEnter,
  startSubmit,
  submitWithTimeout,
  type NicknameResult,
} from '../../src/view/nicknamePromptState';
import { NICKNAME_TEXT } from '../../src/view/nicknameText';

describe('닉네임 입력 창 상태', () => {
  it('처음에는 입력 가능', () => {
    const s = initialPromptState();
    expect(s.phase).toBe('input');
    expect(isLocked(s)).toBe(false);
  });

  it('[확인] 연타: 첫 번째만 제출 중으로 넘어가고 나머지는 같은 상태를 돌려준다 (요청 1개)', () => {
    const s0 = initialPromptState();
    const s1 = startSubmit(s0);
    expect(s1.phase).toBe('submitting');
    expect(isLocked(s1)).toBe(true);
    expect(startSubmit(s1)).toBe(s1);
    expect(startSubmit(startSubmit(s1))).toBe(s1);
  });

  it('규칙 오류(too-short·too-long·bad-chars·banned)는 문구를 보이고 다시 입력할 수 있다', () => {
    for (const code of ['too-short', 'too-long', 'bad-chars', 'banned'] as const) {
      const s = applyResult(startSubmit(initialPromptState()), { ok: false, code });
      expect(s.phase).toBe('input');
      expect(s.message).toEqual({ kind: 'error', text: NICKNAME_TEXT.errors[code] });
      expect(isLocked(s)).toBe(false);
      expect(startSubmit(s).phase).toBe('submitting'); // 다시 제출할 수 있다
    }
  });

  it('성공: 정한 이름을 안내하고 saved로 닫는다. "랭킹에 등록"으로 읽히는 문구가 아니다', () => {
    const s = applyResult(startSubmit(initialPromptState()), {
      ok: true,
      nickname: '뚜비',
      tag: '#0427',
    });
    expect(s.phase).toBe('closing');
    expect(s.outcome).toBe('saved');
    expect(s.closeAfterMs).toBe(PROMPT_TIMINGS.savedMs);
    expect(s.message?.text).toBe('이름을 정했어요: 뚜비#0427');
    expect(s.message?.text).not.toContain('등록');
    expect(NICKNAME_TEXT.laterNotice).not.toContain('등록');
  });

  it('already-set은 saved로 닫고, 연결·서버·권한 오류는 failed로 닫는다 (영구 잠금 없음)', () => {
    const set = applyResult(startSubmit(initialPromptState()), { ok: false, code: 'already-set' });
    expect([set.phase, set.outcome]).toEqual(['closing', 'saved']);
    for (const code of ['network', 'server', 'unauthorized'] as const) {
      const s = applyResult(startSubmit(initialPromptState()), { ok: false, code });
      expect([s.phase, s.outcome, s.closeAfterMs]).toEqual([
        'closing',
        'failed',
        PROMPT_TIMINGS.failedMs,
      ]);
      expect(s.message?.text).toBe('지금은 연결이 안 돼요. 다음에 다시 물어볼게요');
    }
  });

  it('제출 중이 아닐 때 온 결과는 무시한다 (늦은 응답이 상태를 바꾸지 못한다)', () => {
    const closing = chooseLater(initialPromptState());
    const late: NicknameResult = { ok: true, nickname: '뚜비', tag: '#0001' };
    expect(applyResult(closing, late)).toBe(closing);
    const input = initialPromptState();
    expect(applyResult(input, late)).toBe(input);
  });

  it('[나중에]: 저장 호출 없이 안내 후 later로 닫는다. 제출 중·닫는 중에는 무시', () => {
    const later = chooseLater(initialPromptState());
    expect([later.phase, later.outcome, later.closeAfterMs]).toEqual([
      'closing',
      'later',
      PROMPT_TIMINGS.laterMs,
    ]);
    expect(later.message?.text).toBe('이름을 정하기 전까지 기록이 랭킹에 보이지 않아요');
    expect(chooseLater(later)).toBe(later);
    const submitting = startSubmit(initialPromptState());
    expect(chooseLater(submitting)).toBe(submitting);
  });

  it('제출 시간 제한은 10초', () => {
    expect(PROMPT_TIMINGS.submitMs).toBe(10_000);
  });
});

describe('키 입력', () => {
  it('Enter: 한글 조합 중(isComposing·keyCode 229)에는 제출하지 않고, 조합이 끝난 명시적 Enter만 제출', () => {
    expect(shouldSubmitOnEnter({ key: 'Enter' })).toBe(true);
    expect(shouldSubmitOnEnter({ key: 'Enter', isComposing: false, keyCode: 13 })).toBe(true);
    expect(shouldSubmitOnEnter({ key: 'Enter', isComposing: true })).toBe(false);
    expect(shouldSubmitOnEnter({ key: 'Enter', isComposing: false, keyCode: 229 })).toBe(false);
    expect(shouldSubmitOnEnter({ key: 'a' })).toBe(false);
    expect(shouldSubmitOnEnter({ key: 'Escape' })).toBe(false);
  });

  it('Esc는 [나중에]와 같다. 조합 중 Esc는 조합 취소라 닫지 않는다', () => {
    expect(shouldLaterOnEscape({ key: 'Escape' })).toBe(true);
    expect(shouldLaterOnEscape({ key: 'Escape', isComposing: true })).toBe(false);
    expect(shouldLaterOnEscape({ key: 'Enter' })).toBe(false);
  });
});

describe('submitWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ok: NicknameResult = { ok: true, nickname: '뚜비', tag: '#0427' };

  it('제때 오면 그 결과', async () => {
    const p = submitWithTimeout(() => Promise.resolve(ok), 1000);
    await expect(p).resolves.toEqual(ok);
  });

  it('응답이 없으면 ms 뒤 network, 뒤늦은 성공은 버린다', async () => {
    let finish!: (r: NicknameResult) => void;
    const p = submitWithTimeout(() => new Promise((r) => (finish = r)), 1000);
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ ok: false, code: 'network' });
    finish(ok); // 뒤늦은 성공: 이미 정해진 결과를 바꾸지 못한다
    await expect(p).resolves.toEqual({ ok: false, code: 'network' });
  });

  it('거부(예외)와 동기 예외도 network (창이 영구히 잠기지 않는다)', async () => {
    await expect(submitWithTimeout(() => Promise.reject(new Error('x')), 1000)).resolves.toEqual({
      ok: false,
      code: 'network',
    });
    await expect(
      submitWithTimeout(() => {
        throw new Error('sync');
      }, 1000),
    ).resolves.toEqual({ ok: false, code: 'network' });
  });
});
