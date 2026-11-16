// 서버 번들 대조용 계산 (W3-03). src 코드, 생성 번들(Node), 생성 번들(Deno)이 같은 입력에 같은 결과를 내는지 보려고
// 세 곳에서 같은 함수를 돌린다. 이 파일은 import 없이 형태만 받으므로 Node·Deno·Vitest 어디서든 그대로 실행된다.
// 입력은 한 곳(Vitest의 봇·고정 fixture)에서 한 번만 만들어 모두에게 같은 로그를 준다 (번들마다 봇을 다시 돌려 다른 로그를 비교하지 않는다).

export interface ParityApi {
  RULES_VERSION: number;
  replay(seed: number, placements: readonly unknown[]): unknown;
  checkIntervals(placements: readonly unknown[], minMs: number): boolean;
  verifyContent(submission: never, run: { seed: number }): unknown;
  submissionHash(submission: never): Promise<string>;
  generateTray(
    board: { size: number; cells: readonly (number | null)[] },
    rng: number,
  ): [string[], number];
  createRng(seed: number): number;
  weekKey(ms: number): string;
}

export interface ParityInput {
  games: { seed: number; clientScore: number; placements: unknown[] }[];
  variants: { name: string; seed: number; placements: unknown[] }[];
  boards: { name: string; size: number; cells: (number | null)[]; seeds: number[] }[];
  times: number[];
}

export async function compute(api: ParityApi, input: ParityInput): Promise<unknown> {
  const games = [];
  for (const g of input.games) {
    const submission = {
      seed: g.seed,
      version: api.RULES_VERSION,
      clientScore: g.clientScore,
      placements: g.placements,
    } as never;
    games.push({
      seed: g.seed,
      replay: api.replay(g.seed, g.placements),
      verdict: api.verifyContent(submission, { seed: g.seed }),
      hash: await api.submissionHash(submission),
    });
  }
  return {
    rulesVersion: api.RULES_VERSION,
    games,
    variants: input.variants.map((v) => ({
      name: v.name,
      replay: api.replay(v.seed, v.placements),
      intervals: api.checkIntervals(v.placements, 200),
    })),
    boards: input.boards.map((b) => ({
      name: b.name,
      results: b.seeds.map((seed) => {
        const [tray, rng] = api.generateTray({ size: b.size, cells: b.cells }, api.createRng(seed));
        return { seed, tray, rng };
      }),
    })),
    weeks: input.times.map((t) => ({ t, week: api.weekKey(t) })),
  };
}
