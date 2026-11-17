// 진행 중인 점수 제출의 앱 전체 목록 (W3-04). 제출은 게임 오버 화면을 떠나도 계속된다 (rankingResult.ts).
// 제출이 끝나기 전에 [메뉴] → [주간 랭킹]으로 가면 방금 판의 점수가 아직 서버에 없어 목록에 빠진다 (pang R19).
// 랭킹 화면은 여기서 진행 중인 제출을 알아내 끝난 뒤 목록을 한 번 갱신한다. 제출은 10초 제한이 있어 기다림은 끝난다.
// Phaser 없는 순수 모듈이라 시험할 수 있다 (tests/scenes/pendingSubmission.test.ts).

const pending = new Set<Promise<void>>();

/** 제출 하나를 등록한다. 성공·실패와 상관없이 끝나면 목록에서 빠진다 */
export function trackSubmission(submission: Promise<unknown>): void {
  const settled: Promise<void> = submission
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => {
      pending.delete(settled);
    });
  pending.add(settled);
}

/** 지금 진행 중인 제출이 모두 끝나면 풀리는 약속. 진행 중인 것이 없으면 null (기다릴 필요 없음) */
export function whenSubmissionsSettle(): Promise<void> | null {
  if (pending.size === 0) return null;
  return Promise.all([...pending]).then(() => undefined);
}

/** 시험용: 목록을 비운다 */
export function resetPendingSubmissions(): void {
  pending.clear();
}
