// `npm run sim`의 실행 순서 (W4-02): 임시 폴더 만들기 → 묶기 → 불러오기 → main 실행 → 폴더 지우기.
// 폴더를 만든 뒤의 어느 단계가 실패해도 폴더를 지우도록 전체를 한 try/finally로 감싼다.
// 파일·번들러를 주입받아 실패 대역으로 시험할 수 있다 (tests/sim/runCli.test.ts).

export interface CliDeps {
  /** 실행마다 새로 만든 빈 폴더 경로 */
  makeOutDir(): string;
  removeOutDir(dir: string): void;
  /** main.ts를 묶어 outDir/main.mjs를 쓴다 */
  bundle(outDir: string): Promise<void>;
  /** outDir/main.mjs를 불러 main을 돌려준다 */
  load(outDir: string): Promise<(argv: readonly string[]) => void>;
  error(message: string): void;
}

/** 종료 코드 (0 성공, 1 실패) */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const out = deps.makeOutDir();
  try {
    await deps.bundle(out);
    const main = await deps.load(out);
    main(argv);
    return 0;
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    return 1;
  } finally {
    deps.removeOutDir(out);
  }
}
