// 화면 다시 그리기(scene.restart) 예약을 합치고, SHUTDOWN이 "다시 그리기"인지 "화면을 떠남"인지 가르는 순수 도우미.
// Phaser는 restart를 큐에 넣고 같은 씬의 중복을 합치지 않는다: resize가 다음 갱신 전에 여러 번 오면 SHUTDOWN→create가 여러 번 돌고,
// 첫 create가 플래그를 되돌린 뒤 두 번째 SHUTDOWN이 "화면을 떠남"으로 오판돼 준비 중인 새 판 요청이 취소된다.
// 그래서 예약이 이미 있으면 추가 예약을 하지 않는다 (restart 뒤 create는 그때의 현재 화면 크기를 읽으므로 마지막 resize가 반영된다).
export class RestartGate {
  private pending = false;

  /** 다시 그리기를 예약한다. 이미 예약돼 있으면 합쳐서 restart를 부르지 않는다 */
  request(restart: () => void): void {
    if (this.pending) return;
    this.pending = true;
    restart();
  }

  /** 예약된 다시 그리기가 실제로 (create에서) 이루어졌다 */
  started(): void {
    this.pending = false;
  }

  /** 지금 SHUTDOWN이 예약한 다시 그리기 때문이면 true (화면을 떠난 것이 아니다) */
  get restarting(): boolean {
    return this.pending;
  }
}
