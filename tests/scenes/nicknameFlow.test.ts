import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmitOutcome } from '../../src/online';
import { deferred } from '../online/fakeBackend';
import { THEMES } from '../../src/view/theme/themes';

// NicknameFlow가 "제출 성공 뒤에만, 같은 계정이고 이름이 없을 때 한 번" 창을 여는지 본다 (Phaser·DOM 없이 online·창을 가짜로).
const state = vi.hoisted(() => ({
  status: 'ready' as 'ready' | 'offline',
  userId: 'user-a' as string | null,
  networkOnline: true,
  profile: null as unknown,
  profileGate: null as Promise<void> | null,
  profileCalls: 0,
  prompts: [] as {
    destroyed: boolean;
    submit: (n: string) => Promise<unknown>;
    onClose: (outcome: 'saved' | 'later' | 'failed') => void;
  }[],
}));

vi.mock('../../src/online', () => ({
  currentUserId: () => state.userId,
  formatTag: (t: number) => `#${String(t).padStart(4, '0')}`,
  getMyProfile: async () => {
    state.profileCalls += 1;
    if (state.profileGate) await state.profileGate;
    return state.profile;
  },
  isNetworkOnline: () => state.networkOnline,
  onlineStatus: () => state.status,
  setNickname: async () => ({ ok: true, nickname: 'x', tag: 1 }),
}));
vi.mock('../../src/view/NicknamePrompt', () => ({
  NicknamePrompt: class {
    entry: (typeof state.prompts)[number];
    constructor(opts: {
      submit: (n: string) => Promise<unknown>;
      onClose: (outcome: 'saved' | 'later' | 'failed') => void;
    }) {
      this.entry = { destroyed: false, submit: opts.submit, onClose: opts.onClose };
      state.prompts.push(this.entry);
    }
    destroy() {
      this.entry.destroyed = true;
    }
  },
}));

const { NicknameFlow } = await import('../../src/scenes/nicknameFlow');

const ok: SubmitOutcome = {
  kind: 'ok',
  score: 5,
  best: 5,
  weekKey: '2026-W46',
  isNewBest: true,
  userId: 'user-a',
};
const canvas = {} as HTMLElement;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  Object.assign(state, {
    status: 'ready',
    userId: 'user-a',
    networkOnline: true,
    profile: null,
    profileGate: null,
    profileCalls: 0,
    prompts: [],
  });
});

describe('NicknameFlow.afterSubmit', () => {
  it('제출 성공 + 같은 계정 + 이름 없음(프로필 null)이면 창을 한 번 연다', async () => {
    const flow = new NicknameFlow(canvas, THEMES.soda);
    flow.afterSubmit(ok);
    await tick();
    expect(state.prompts).toHaveLength(1);
    // 같은 화면에서 다시 불러도 두 번째 창은 없다
    flow.afterSubmit(ok);
    await tick();
    expect(state.prompts).toHaveLength(1);
    expect(state.profileCalls).toBe(1);
  });

  it('제출 실패·거부·새 버전 안내에는 열지 않고 프로필도 조회하지 않는다', async () => {
    for (const outcome of [
      { kind: 'failed' },
      { kind: 'rejected', code: 'score-mismatch' },
      { kind: 'outdated' },
    ] as SubmitOutcome[]) {
      const flow = new NicknameFlow(canvas, THEMES.soda);
      flow.afterSubmit(outcome);
      await tick();
    }
    expect(state.prompts).toHaveLength(0);
    expect(state.profileCalls).toBe(0);
  });

  it('이미 이름이 있거나(설정됨) 조회가 실패하면(error) 열지 않는다', async () => {
    state.profile = { nickname: '뚜비', tag: 7 };
    const a = new NicknameFlow(canvas, THEMES.soda);
    a.afterSubmit(ok);
    await tick();
    state.profile = 'error';
    const b = new NicknameFlow(canvas, THEMES.soda);
    b.afterSubmit(ok);
    await tick();
    expect(state.prompts).toHaveLength(0);
  });

  it('오프라인·계정 없음이면 열지 않는다', async () => {
    state.networkOnline = false;
    new NicknameFlow(canvas, THEMES.soda).afterSubmit(ok);
    state.networkOnline = true;
    state.status = 'offline';
    new NicknameFlow(canvas, THEMES.soda).afterSubmit(ok);
    await tick();
    expect(state.prompts).toHaveLength(0);
    expect(state.profileCalls).toBe(0);
  });

  it('제출한 계정이 지금 계정과 다르면 열지 않는다', async () => {
    state.userId = 'user-b';
    new NicknameFlow(canvas, THEMES.soda).afterSubmit(ok);
    await tick();
    expect(state.prompts).toHaveLength(0);
  });

  it('프로필을 기다리는 사이 계정이 바뀌면 창을 열지 않는다', async () => {
    const gate = deferred<void>();
    state.profileGate = gate.promise;
    const flow = new NicknameFlow(canvas, THEMES.soda);
    flow.afterSubmit(ok);
    state.userId = 'user-b';
    gate.resolve();
    await tick();
    expect(state.prompts).toHaveLength(0);
  });

  it('프로필을 기다리는 사이 화면을 떠나면(end) 늦은 결과로 창을 열지 않는다', async () => {
    const gate = deferred<void>();
    state.profileGate = gate.promise;
    const flow = new NicknameFlow(canvas, THEMES.soda);
    flow.afterSubmit(ok);
    flow.end();
    gate.resolve();
    await tick();
    expect(state.prompts).toHaveLength(0);
  });

  it('end는 떠 있는 창을 지운다', async () => {
    const flow = new NicknameFlow(canvas, THEMES.soda);
    flow.afterSubmit(ok);
    await tick();
    expect(state.prompts[0]?.destroyed).toBe(false);
    flow.end();
    expect(state.prompts[0]?.destroyed).toBe(true);
  });
});

describe('NicknameFlow.beginFake (DEV ?ranking=fake)', () => {
  it('온라인과 무관하게 가짜 제출로 창을 연다', () => {
    state.status = 'offline';
    state.networkOnline = false;
    const fake = vi.fn(async () => ({ ok: true as const, nickname: 'a', tag: '#0427' }));
    new NicknameFlow(canvas, THEMES.soda).beginFake(fake);
    expect(state.prompts).toHaveLength(1);
    expect(state.profileCalls).toBe(0);
  });
});

describe('NicknameFlow: 이름이 저장되면 onSaved (랭킹 다시 조회용)', () => {
  const open = async (onSaved: () => void) => {
    const flow = new NicknameFlow(canvas, THEMES.soda, onSaved);
    flow.afterSubmit(ok);
    await tick();
    return flow;
  };

  it('saved(이미 정해져 있던 already-set 포함)로 닫히면 한 번 부른다', async () => {
    let saved = 0;
    await open(() => (saved += 1));
    state.prompts[0]?.onClose('saved');
    expect(saved).toBe(1);
  });

  it('later·failed로 닫히면 부르지 않는다', async () => {
    let saved = 0;
    await open(() => (saved += 1));
    state.prompts[0]?.onClose('later');
    expect(saved).toBe(0);
    state.prompts.length = 0;
    await open(() => (saved += 1));
    state.prompts[0]?.onClose('failed');
    expect(saved).toBe(0);
  });

  it('화면을 떠나(end) 지운 창은 부르지 않는다 (destroy는 onClose 없이 지운다)', async () => {
    let saved = 0;
    const flow = await open(() => (saved += 1));
    flow.end();
    expect(state.prompts[0]?.destroyed).toBe(true);
    expect(saved).toBe(0);
  });
});
