// W4-02 sim 실행 순서: 폴더를 만든 뒤 어느 단계가 실패해도 지운다
import { describe, expect, it } from 'vitest';
import { runCli, type CliDeps } from '../../scripts/sim/runCli';

function deps(over: Partial<CliDeps> = {}) {
  const log: string[] = [];
  const d: CliDeps = {
    makeOutDir: () => {
      log.push('make');
      return '/tmp/out';
    },
    removeOutDir: (dir) => log.push(`remove ${dir}`),
    bundle: async () => {
      log.push('bundle');
    },
    load: async () => {
      log.push('load');
      return (argv) => {
        log.push(`main ${argv.join(' ')}`);
      };
    },
    error: (m) => log.push(`error ${m}`),
    ...over,
  };
  return { d, log };
}

describe('runCli', () => {
  it('성공: 만들기 → 묶기 → 불러오기 → main → 지우기, 종료 코드 0', async () => {
    const { d, log } = deps();
    expect(await runCli(['--seeds', '1'], d)).toBe(0);
    expect(log).toEqual(['make', 'bundle', 'load', 'main --seeds 1', 'remove /tmp/out']);
  });

  it('묶기 실패: 오류를 알리고 폴더를 지운다', async () => {
    const { d, log } = deps({
      bundle: async () => {
        throw new Error('빌드 실패');
      },
    });
    expect(await runCli([], d)).toBe(1);
    expect(log).toEqual(['make', 'error 빌드 실패', 'remove /tmp/out']);
  });

  it('불러오기 실패: 폴더를 지운다', async () => {
    const { d, log } = deps({
      load: async () => {
        throw new Error('import 실패');
      },
    });
    expect(await runCli([], d)).toBe(1);
    expect(log.at(-1)).toBe('remove /tmp/out');
    expect(log).toContain('error import 실패');
  });

  it('main 실패(잘못된 옵션 등): 폴더를 지운다', async () => {
    const { d, log } = deps({
      load: async () => () => {
        throw new Error('모르는 옵션');
      },
    });
    expect(await runCli([], d)).toBe(1);
    expect(log.at(-1)).toBe('remove /tmp/out');
  });

  it('폴더를 만들기 전 실패는 지울 것이 없다', async () => {
    const { d, log } = deps({
      makeOutDir: () => {
        throw new Error('권한 없음');
      },
    });
    await expect(runCli([], d)).rejects.toThrow('권한 없음');
    expect(log).toEqual([]);
  });
});
