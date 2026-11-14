// seed 정하기 (PLAN 6.3). URL 해석은 순수 함수라 테스트할 수 있다.

/** seed 범위: 부호 없는 32비트 정수. core/rng.ts가 `seed | 0`으로 받으므로 이 범위 밖은 다른 seed와 겹친다 */
const SEED_MAX = 0xffffffff;

/**
 * URL의 `?seed=N`을 읽는다. N은 0~4294967295의 10진 정수여야 한다.
 * 없거나 형식이 다르면(빈 값, `abc`, `1.5`, `-1`, `1e3`, 범위 밖) null이고, 그때는 seed 옵션이 없는 것으로 본다.
 * 같은 키가 여러 번 나오면 첫 번째를 쓴다.
 */
export function parseSeedParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const seed = Number(raw);
  return seed <= SEED_MAX ? seed : null;
}

/** 무작위 seed. 게임 랜덤이 아니라 판을 고르는 값이라 core 밖에서 만든다 */
export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 0;
}
