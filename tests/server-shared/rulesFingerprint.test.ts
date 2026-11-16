import { afterEach, describe, expect, it, vi } from 'vitest';
import { RULES_VERSION } from '../../src/config';
import { rulesFingerprint } from '../helpers/rulesFingerprint';

// RULES_VERSION별로 승인된 규칙 지문. 같은 버전에서 규칙이 바뀌면 지문이 달라져 이 테스트가 실패한다.
// 의도한 규칙 변경이면: (1) src/config.ts의 RULES_VERSION을 올리고 (2) 새 지문을 아래에 **추가**한다 (옛 지문은 지우지 않는다)
// (3) 이어하기(storage/run.ts의 rulesVersion 비교)·서버 제출(옛 run은 version-mismatch)에 미치는 영향을 검토한다.
// 이 지문은 개발·배포 실수를 막는 장치다. 통신 계약은 int RULES_VERSION이고, 버전 번호를 고의로 재사용하는 운영까지 막지는 못한다.
const APPROVED: Record<number, string> = {
  1: '0355cefba2a21e34abe70444bd07585fe1e4d82fd78f75c76b5fb7a896fde807',
};

describe('규칙 지문', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../src/config');
  });

  it('현재 RULES_VERSION의 지문이 등록돼 있고 지금 코드와 같다', () => {
    const approved = APPROVED[RULES_VERSION];
    expect(approved, `RULES_VERSION ${RULES_VERSION}의 승인된 지문이 없다`).toBeDefined();
    expect(
      rulesFingerprint(),
      `같은 RULES_VERSION(${RULES_VERSION})에서 규칙(core·규칙 config)이 바뀌었다. 의도했다면 RULES_VERSION을 올리고 새 지문을 등록한다`,
    ).toBe(approved);
  });

  it('등록된 버전은 1부터 현재까지 빠짐없다 (옛 지문을 지우지 않는다)', () => {
    expect(
      Object.keys(APPROVED)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(Array.from({ length: RULES_VERSION }, (_, i) => i + 1));
  });

  it('규칙 값(점수표)을 바꾸면 지문이 달라진다 (버전을 안 올린 변경을 잡는다)', async () => {
    const before = rulesFingerprint();
    vi.resetModules();
    vi.doMock('../../src/config', async (orig) => {
      const real = await orig<typeof import('../../src/config')>();
      return { ...real, SCORE: { ...real.SCORE, perCell: 2 } };
    });
    const { rulesFingerprint: changed } = await import('../helpers/rulesFingerprint');
    expect(changed()).not.toBe(before);
  });

  it('추첨 가중치를 바꾸면 지문이 달라진다 (RNG 추첨 순서까지 덮는다)', async () => {
    const before = rulesFingerprint();
    vi.resetModules();
    vi.doMock('../../src/config', async (orig) => {
      const real = await orig<typeof import('../../src/config')>();
      return {
        ...real,
        PIECE_WEIGHTS: { ...real.PIECE_WEIGHTS, dot: real.PIECE_WEIGHTS.dot! + 1 },
      };
    });
    const { rulesFingerprint: changed } = await import('../helpers/rulesFingerprint');
    expect(changed()).not.toBe(before);
  });

  it('화면 수치(VIEW)를 바꾸면 지문은 그대로다 (불필요한 버전 증가를 강제하지 않는다)', async () => {
    const before = rulesFingerprint();
    vi.resetModules();
    vi.doMock('../../src/config', async (orig) => {
      const real = await orig<typeof import('../../src/config')>();
      return { ...real, VIEW: { ...real.VIEW, dragLiftCells: 99 } };
    });
    const { rulesFingerprint: changed } = await import('../helpers/rulesFingerprint');
    expect(changed()).toBe(before);
  });
});
